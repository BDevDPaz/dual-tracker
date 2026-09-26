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
  SessionRecord,
  SessionRecordStatus,
  Site,
  SpatialFact,
  SpatialSource,
  SpatialFactType,
  TransitSegment,
} from "../../core/contracts";
import { FieldCryptoService } from "./FieldCryptoService";

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

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function rowToSession(row: DbSessionRow): Promise<SessionRecord> {
  return {
    id: row.id,
    declaredStartAtMs: row.declared_start_ms,
    actualStartAtMs: row.actual_start_ms ?? null,
    endAtMs: row.end_ms ?? null,
    domainStatus: normalizeStatus(row.domain_status),
    siteId: row.site_id ?? null,
    clientId: row.client_id ?? null,
    lunch: {
      taken: Boolean(row.lunch_taken),
      startAtMs: row.lunch_start_ms ?? null,
      endAtMs: row.lunch_end_ms ?? null,
      deductedMinutes: row.lunch_deducted_min ?? null,
    },
    totalPausedMs: row.total_paused_ms ?? 0,
    transitSegments: parseJson<TransitSegment[]>(row.transit_segments_json, []),
    integrityClass: normalizeIntegrity(row.integrity_class),
    policyId: row.policy_id,
    bookkeeping: {
      dateString: row.date_string,
      isDeleted: Boolean(row.is_deleted),
      cancelled: Boolean(row.cancelled),
      lastPauseStartMs: row.last_pause_start_ms ?? null,
      firstExitAtMs: row.first_exit_ms ?? null,
      firstExitReliable: row.first_exit_reliable === null ? null : Boolean(row.first_exit_reliable),
      integrityReason: (row.integrity_reason as IntegrityReason) ?? "CLEAN",
      original: parseJson<OriginalTimes | null>(row.original_json, null),
      manualNote: await FieldCryptoService.open(row.manual_note_sealed),
      updatedAtMs: row.updated_at_ms,
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
] as const;

export async function sessionToParams(s: SessionRecord): Promise<(string | number | null)[]> {
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
    await FieldCryptoService.seal(b.manualNote),
    b.updatedAtMs,
  ];
}

export function rowToSite(row: DbSiteRow): Site {
  return {
    id: row.id,
    alias: row.alias,
    address: row.address,
    clientName: row.client_name,
    notes: row.notes,
    targetLat: row.target_lat,
    targetLon: row.target_lon,
    radiusM: row.radius_m,
    active: Boolean(row.active),
    createdAtMs: row.created_at_ms,
    archivedAtMs: row.archived_at_ms,
  };
}

type SealedCoords = { lat: number | null; lon: number | null; speedMps?: number | null; altitudeM?: number | null };

export async function rowToSpatialFact(row: DbSpatialRow): Promise<SpatialFact & { speedMps?: number | null; altitudeM?: number | null; battery?: number | null }> {
  const coords = (await FieldCryptoService.openJson<SealedCoords>(row.coords_sealed)) ?? { lat: null, lon: null };
  return {
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
    timestampMs: row.timestamp_ms,
  };
}

export async function sealCoords(c: SealedCoords): Promise<string | null> {
  return FieldCryptoService.sealJson(c);
}
