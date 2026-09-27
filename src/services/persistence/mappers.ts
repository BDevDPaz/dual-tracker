/**
 * Mapeo canónico SQLite ↔ contratos, ya resuelto (Propuesta Técnica §4.2:
 * "sin marcadores de conflicto de rama").
 *
 * Nota de port: sessionStoreAdapter.ts de GEOTrack contenía un conflicto de
 * merge sin resolver (<<<<<<< HEAD … >>>>>>> origin/main) en el mapeo de
 * totalPausedMs/lastPauseStartMs. Se adoptó la rama HEAD (leer las columnas
 * reales), que es la única coherente con la migración total_paused_ms.
 */
import type {
  IntegrityClass,
  IntegrityReason,
  OriginalTimes,
  PauseInterval,
  PausesSource,
  SessionRecord,
  SessionRecordStatus,
  Site,
  SpatialFact,
  SpatialSource,
  SpatialFactType,
  TransitSegment,
} from "../../core/contracts";
import { isDateString, parseTimestamp, toDateString } from "../../utils/dateUtils";
import { FieldCryptoService, type FieldId } from "./FieldCryptoService";

/** Descifra; un sobre ilegible (kid perdido, manipulado…) se hidrata como null y se marca. */
async function readField(fieldId: FieldId, rowId: number | string, stored: string | null): Promise<{ value: string | null; unreadable: boolean }> {
  try {
    return { value: await FieldCryptoService.decrypt(fieldId, rowId, stored), unreadable: false };
  } catch {
    return { value: null, unreadable: true };
  }
}

/**
 * Columnas *_ms: SQLite puede devolver INTEGER, REAL o TEXT (datos legados o
 * importados). Todo pasa por el parser central; nunca NaN en el store.
 */
const ms = (v: unknown): number | null => parseTimestamp(v);

/**
 * date_string saneado. Versiones previas persistieron "Invalid Date" (dayjs tz
 * en Hermes); se recalcula desde el inicio de la sesión.
 */
export function repairDateString(raw: unknown, startMs: number | null): string {
  if (isDateString(raw)) return raw;
  return startMs !== null ? toDateString(startMs) : "";
}

export interface DbSessionRow {
  id: number;
  declared_start_ms: number;
  actual_start_ms: number | null;
  end_ms: number | null;
  domain_status: string;
  site_id: number | null;
  client_id: string | null;
  lunch_taken: number;
  lunch_start_ms: number | null;
  lunch_end_ms: number | null;
  lunch_deducted_min: number | null;
  total_paused_ms: number;
  transit_segments_json: string;
  integrity_class: string;
  integrity_reason: string;
  policy_id: string;
  date_string: string;
  is_deleted: number;
  cancelled: number;
  last_pause_start_ms: number | null;
  first_exit_ms: number | null;
  first_exit_reliable: number | null;
  original_json: string | null;
  manual_note_sealed: string | null;
  updated_at_ms: number;
  pauses_json?: string | null;
  pauses_source?: string | null;
  breaks_clipped?: number | null;
  split_from_session_id?: number | null;
}

export interface DbSiteRow {
  id: number;
  alias: string;
  address: string;
  client_name: string | null;
  notes: string | null;
  target_lat: number | null;
  target_lon: number | null;
  radius_m: number | null;
  active: number;
  created_at_ms: number;
  archived_at_ms: number | null;
}

export interface DbSpatialRow {
  id: number;
  session_id: number;
  site_id: number | null;
  type: string;
  coords_sealed: string | null;
  accuracy_m: number | null;
  source: string;
  reliable: number;
  reason: string | null;
  battery: number | null;
  timestamp_ms: number;
}

const RECORD_STATUSES: readonly SessionRecordStatus[] = [
  "ESPERANDO",
  "ACTIVA",
  "PAUSADA",
  "TRASLADO",
  "SALIDA",
  "CERRADA",
];

/**
 * Traduce estados del linaje GEOTrack/LEDTracker al vocabulario canónico.
 * Base para la futura migración de `ledtracker_v2.db` (TODO).
 */
export function mapLegacyStatus(raw: string | null | undefined): SessionRecordStatus {
  switch (raw) {
    case "GEOFENCE_CREATED":
      return "ESPERANDO";
    case "ACTIVE_WORK":
    case "active":
      return "ACTIVA";
    case "PAUSED":
      return "PAUSADA";
    case "TRAVEL":
    case "travel":
      return "TRASLADO";
    case "PENDING_EXIT_CONFIRMATION":
      return "SALIDA";
    case "CLOSED":
    case "completed":
      return "CERRADA";
    default:
      return "CERRADA";
  }
}

function normalizeStatus(raw: string): SessionRecordStatus {
  return (RECORD_STATUSES as readonly string[]).includes(raw)
    ? (raw as SessionRecordStatus)
    : mapLegacyStatus(raw);
}

function normalizeIntegrity(raw: string): IntegrityClass {
  return raw === "VALID" || raw === "MANUAL" || raw === "AUTO" || raw === "CONFLICT" ? raw : "CONFLICT";
}

function pauseFields(row: DbSessionRow): Partial<SessionRecord["bookkeeping"]> {
  const out: Partial<SessionRecord["bookkeeping"]> = {};
  const pauses = parseJson<PauseInterval[]>(row.pauses_json ?? null, []);
  if (Array.isArray(pauses) && pauses.length) out.pauses = pauses;
  const src = normalizePausesSource(row.pauses_source);
  if (src !== "RECORDED") out.pausesSource = src;
  if (row.breaks_clipped) out.breaksClipped = true;
  if (row.split_from_session_id !== null && row.split_from_session_id !== undefined) out.splitFromSessionId = Number(row.split_from_session_id);
  return out;
}

function normalizePausesSource(raw: unknown): PausesSource {
  return raw === "LEDGER" || raw === "PRORATED" ? raw : "RECORDED";
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function rowToSession(row: DbSessionRow): Promise<SessionRecord> {
  const updatedAtMs = ms(row.updated_at_ms) ?? 0;
  const declaredStartAtMs = ms(row.declared_start_ms) ?? updatedAtMs;
  const actualStartAtMs = ms(row.actual_start_ms);
  const note = await readField("session.note", row.id, row.manual_note_sealed);
  return {
    id: row.id,
    declaredStartAtMs,
    actualStartAtMs,
    endAtMs: ms(row.end_ms),
    domainStatus: normalizeStatus(row.domain_status),
    siteId: row.site_id ?? null,
    clientId: row.client_id ?? null,
    lunch: {
      taken: Boolean(row.lunch_taken),
      startAtMs: ms(row.lunch_start_ms),
      endAtMs: ms(row.lunch_end_ms),
      deductedMinutes: row.lunch_deducted_min ?? null,
    },
    totalPausedMs: row.total_paused_ms ?? 0,
    transitSegments: parseJson<TransitSegment[]>(row.transit_segments_json, []),
    integrityClass: normalizeIntegrity(row.integrity_class),
    policyId: row.policy_id,
    bookkeeping: {
      dateString: repairDateString(row.date_string, actualStartAtMs ?? declaredStartAtMs),
      isDeleted: Boolean(row.is_deleted),
      cancelled: Boolean(row.cancelled),
      lastPauseStartMs: ms(row.last_pause_start_ms),
      firstExitAtMs: ms(row.first_exit_ms),
      firstExitReliable: row.first_exit_reliable === null ? null : Boolean(row.first_exit_reliable),
      integrityReason: (row.integrity_reason as IntegrityReason) ?? "CLEAN",
      original: parseJson<OriginalTimes | null>(row.original_json, null),
      manualNote: note.value,
      updatedAtMs,
      // Campos de §5.3 solo cuando difieren del valor por defecto: los registros
      // antiguos quedan idénticos (misma evidencia, mismo contentHash).
      ...pauseFields(row),
      ...(note.unreadable ? { unreadableFields: ["note" as const] } : {}),
    },
  };
}

/** Parámetros posicionales para INSERT/UPDATE de sessions (orden = SESSION_COLUMNS). */
export const SESSION_COLUMNS = [
  "declared_start_ms",
  "actual_start_ms",
  "end_ms",
  "domain_status",
  "site_id",
  "client_id",
  "lunch_taken",
  "lunch_start_ms",
  "lunch_end_ms",
  "lunch_deducted_min",
  "total_paused_ms",
  "transit_segments_json",
  "integrity_class",
  "integrity_reason",
  "policy_id",
  "date_string",
  "is_deleted",
  "cancelled",
  "last_pause_start_ms",
  "first_exit_ms",
  "first_exit_reliable",
  "original_json",
  "manual_note_sealed",
  "updated_at_ms",
  "pauses_json",
  "pauses_source",
  "breaks_clipped",
  "split_from_session_id",
] as const;

/**
 * Parámetros posicionales. `noteStored` es el sobre ya calculado por
 * PersistenceService (necesita el rowId: INSERT → lastInsertRowId → UPDATE).
 */
export function sessionToParams(s: SessionRecord, noteStored: string | null): (string | number | null)[] {
  const b = s.bookkeeping;
  return [
    s.declaredStartAtMs,
    s.actualStartAtMs,
    s.endAtMs,
    s.domainStatus,
    s.siteId,
    s.clientId,
    s.lunch.taken ? 1 : 0,
    s.lunch.startAtMs,
    s.lunch.endAtMs,
    s.lunch.deductedMinutes,
    s.totalPausedMs,
    JSON.stringify(s.transitSegments),
    s.integrityClass,
    b.integrityReason,
    s.policyId,
    b.dateString,
    b.isDeleted ? 1 : 0,
    b.cancelled ? 1 : 0,
    b.lastPauseStartMs,
    b.firstExitAtMs,
    b.firstExitReliable === null ? null : b.firstExitReliable ? 1 : 0,
    b.original ? JSON.stringify(b.original) : null,
    noteStored,
    b.updatedAtMs,
    JSON.stringify(b.pauses ?? []),
    b.pausesSource ?? "RECORDED",
    b.breaksClipped ? 1 : 0,
    b.splitFromSessionId ?? null,
  ];
}

export async function rowToSite(row: DbSiteRow): Promise<Site> {
  const unreadable: NonNullable<Site["unreadableFields"]> = [];
  const read = async (fieldId: FieldId, key: NonNullable<Site["unreadableFields"]>[number], stored: string | null) => {
    const r = await readField(fieldId, row.id, stored);
    if (r.unreadable) unreadable.push(key);
    return r.value;
  };
  const alias = await read("site.alias", "alias", row.alias);
  const address = await read("site.address", "address", row.address);
  const clientName = await read("site.clientName", "clientName", row.client_name);
  const notes = await read("site.notes", "notes", row.notes);
  return {
    id: row.id,
    alias: alias ?? "",
    address: address ?? "",
    clientName,
    notes,
    ...(unreadable.length ? { unreadableFields: unreadable } : {}),
    targetLat: row.target_lat,
    targetLon: row.target_lon,
    radiusM: row.radius_m,
    active: Boolean(row.active),
    createdAtMs: ms(row.created_at_ms) ?? 0,
    archivedAtMs: ms(row.archived_at_ms),
  };
}

type SealedCoords = { lat: number | null; lon: number | null; speedMps?: number | null; altitudeM?: number | null };

export async function rowToSpatialFact(row: DbSpatialRow): Promise<SpatialFact & { speedMps?: number | null; altitudeM?: number | null; battery?: number | null }> {
  let coords: SealedCoords = { lat: null, lon: null };
  let unreadable = false;
  try {
    coords = (await FieldCryptoService.decryptJson<SealedCoords>("spatial.coords", row.id, row.coords_sealed)) ?? coords;
  } catch {
    unreadable = true;
  }
  return {
    ...(unreadable ? { unreadable: true } : {}),
    id: row.id,
    sessionId: row.session_id,
    siteId: row.site_id,
    type: row.type as SpatialFactType,
    lat: coords.lat,
    lon: coords.lon,
    speedMps: coords.speedMps ?? null,
    altitudeM: coords.altitudeM ?? null,
    battery: row.battery,
    accuracyM: row.accuracy_m,
    source: row.source as SpatialSource,
    reliable: Boolean(row.reliable),
    reason: row.reason,
    timestampMs: ms(row.timestamp_ms) ?? 0,
  };
}

export type { SealedCoords };
