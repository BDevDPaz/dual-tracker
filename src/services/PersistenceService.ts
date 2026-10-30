import type * as SQLite from "expo-sqlite";
import { ensureDbReady } from "../database/db";
import { timeAuthorityService } from "./TimeAuthorityService";
import type {
  SessionRecord as DomainSessionRecord,
  DomainStatus,
  SpatialFact,
  LedgerEntry,
  TransitSegment,
  Site,
  PayrollStatement,
  EvidencePack,
} from "../core/contracts/domain";
import type { SessionRecord as LegacySessionRecord } from "../core/contracts/types";

/**
 * ============================================================================
 * PersistenceService — Propuesta 4.2
 * ----------------------------------------------------------------------------
 * "Un repositorio único con mapeo canónico ya resuelto (sin marcadores de
 * conflicto de rama)." Fusiona DatabaseService (src/database/db.ts) y
 * sessionStoreAdapter en un solo punto de escritura para el dominio Dual
 * Tracker.
 *
 * Reutiliza el handle ya abierto por src/database/db.ts (ensureDbReady) en
 * vez de volver a llamar SQLite.openDatabaseAsync. Este archivo solo AGREGA
 * las tablas nuevas que el dominio Dual Tracker necesita (ledger_entries,
 * spatial_facts, sites, transit_segments, payroll_statements) y columnas
 * adicionales sobre `work_sessions` para los campos canónicos que el
 * SessionRecord congelado (domain.ts) exige y que la tabla legacy no tenía
 * (site_id, client_id, integrity_class, policy_id,
 * original_actual_start_at_ms, original_end_at_ms). Todas las migraciones
 * están guardadas con "IF NOT EXISTS" / verificación de columna existente,
 * así que son seguras de reejecutar en cada boot.
 *
 * checkOverlap dejó de ser un comentario en el modal: es una consulta SQL
 * real contra work_sessions (ver checkOverlap más abajo).
 * ============================================================================
 */

// --------------------------------------------------------------------------
// Migraciones propias de la capa Dual Tracker
// --------------------------------------------------------------------------

let dualTrackerMigrationsPromise: Promise<void> | null = null;

async function getTableColumns(
  database: SQLite.SQLiteDatabase,
  tableName: string,
): Promise<Set<string>> {
  const rows = await database.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName});`);
  return new Set(rows.map((row) => row.name));
}

async function addColumnIfMissing(
  database: SQLite.SQLiteDatabase,
  existingColumns: Set<string>,
  tableName: string,
  columnName: string,
  definition: string,
): Promise<void> {
  if (existingColumns.has(columnName)) {
    return;
  }
  await database.execAsync(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
  existingColumns.add(columnName);
}

async function migrateWorkSessionsForDualTracker(database: SQLite.SQLiteDatabase): Promise<void> {
  const columns = await getTableColumns(database, "work_sessions");

  await addColumnIfMissing(database, columns, "work_sessions", "site_id", "TEXT");
  await addColumnIfMissing(database, columns, "work_sessions", "client_id", "TEXT");
  await addColumnIfMissing(
    database,
    columns,
    "work_sessions",
    "integrity_class",
    "TEXT DEFAULT 'VALID'",
  );
  await addColumnIfMissing(
    database,
    columns,
    "work_sessions",
    "policy_id",
    "TEXT DEFAULT 'default'",
  );
  await addColumnIfMissing(
    database,
    columns,
    "work_sessions",
    "original_actual_start_at_ms",
    "INTEGER",
  );
  await addColumnIfMissing(database, columns, "work_sessions", "original_end_at_ms", "INTEGER");
}

async function createDualTrackerTables(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS ledger_entries (
      id TEXT PRIMARY KEY NOT NULL,
      session_id INTEGER NOT NULL,
      prev_hash TEXT,
      hash TEXT NOT NULL,
      actor TEXT NOT NULL,
      intent TEXT NOT NULL,
      from_state TEXT,
      to_state TEXT,
      integrity_class TEXT NOT NULL,
      reason_code TEXT,
      reason TEXT,
      timestamp_ms INTEGER NOT NULL,
      payload_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ledger_entries_session
      ON ledger_entries (session_id, timestamp_ms);

    CREATE TABLE IF NOT EXISTS spatial_facts (
      id TEXT PRIMARY KEY NOT NULL,
      session_id INTEGER,
      site_id TEXT,
      type TEXT NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      accuracy_m REAL NOT NULL,
      speed_mps REAL,
      altitude_m REAL,
      battery REAL,
      timestamp_ms INTEGER NOT NULL,
      source TEXT NOT NULL,
      reliable INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_spatial_facts_session
      ON spatial_facts (session_id, timestamp_ms);

    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY NOT NULL,
      alias TEXT NOT NULL,
      client_id TEXT,
      client_name TEXT,
      address TEXT NOT NULL,
      target_latitude REAL NOT NULL,
      target_longitude REAL NOT NULL,
      radius_meters REAL NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transit_segments (
      id TEXT PRIMARY KEY NOT NULL,
      session_id INTEGER NOT NULL,
      from_site_id TEXT,
      to_site_id TEXT,
      start_at_ms INTEGER NOT NULL,
      end_at_ms INTEGER,
      is_paid INTEGER NOT NULL DEFAULT 0,
      counts_for_overtime INTEGER NOT NULL DEFAULT 0,
      policy_id TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_transit_segments_session
      ON transit_segments (session_id, start_at_ms);

    CREATE TABLE IF NOT EXISTS payroll_statements (
      id TEXT PRIMARY KEY NOT NULL,
      period_start INTEGER NOT NULL,
      period_end INTEGER NOT NULL,
      statement_json TEXT NOT NULL,
      pack_hash TEXT NOT NULL,
      policy_id TEXT NOT NULL,
      generated_at_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS evidence_packs (
      id TEXT PRIMARY KEY NOT NULL,
      period_start INTEGER NOT NULL,
      period_end INTEGER NOT NULL,
      pack_json TEXT NOT NULL,
      manifest_sha256 TEXT NOT NULL,
      policy_id TEXT NOT NULL,
      generated_at_ms INTEGER NOT NULL
    );
  `);
}

/**
 * Corre las migraciones propias del dominio Dual Tracker exactamente una
 * vez por proceso, después de que src/database/db.ts confirme que el handle
 * SQLite está listo (WAL/pragmas ya configurados por ensureDbReady).
 */
async function ensureDualTrackerSchema(): Promise<SQLite.SQLiteDatabase> {
  const database = await ensureDbReady();

  if (!dualTrackerMigrationsPromise) {
    dualTrackerMigrationsPromise = (async () => {
      await createDualTrackerTables(database);
      await migrateWorkSessionsForDualTracker(database);
    })();
  }

  await dualTrackerMigrationsPromise;
  return database;
}

async function runTx<T>(work: (database: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  const database = await ensureDualTrackerSchema();

  await database.execAsync("BEGIN IMMEDIATE TRANSACTION");
  try {
    const result = await work(database);
    await database.execAsync("COMMIT");
    return result;
  } catch (error) {
    try {
      await database.execAsync("ROLLBACK");
    } catch {
      // rollback secundario ignorado, el error original prevalece
    }
    throw error;
  }
}

// --------------------------------------------------------------------------
// Mapeo de estado de dominio <-> estado legacy persistido en `status`
// --------------------------------------------------------------------------

const DOMAIN_TO_LEGACY_STATUS: Record<DomainStatus, string> = {
  NO_INICIADA: "GEOFENCE_CREATED",
  GEOFENCE_CREATED: "GEOFENCE_CREATED",
  TRASLADO: "TRAVEL",
  ACTIVA: "ACTIVE_WORK",
  PAUSADA: "PAUSED",
  PENDING_EXIT_CONFIRMATION: "PENDING_EXIT_CONFIRMATION",
  CERRADA: "CLOSED",
};

const LEGACY_TO_DOMAIN_STATUS: Record<string, DomainStatus> = {
  GEOFENCE_CREATED: "GEOFENCE_CREATED",
  TRAVEL: "TRASLADO",
  ACTIVE_WORK: "ACTIVA",
  PAUSED: "PAUSADA",
  PENDING_EXIT_CONFIRMATION: "PENDING_EXIT_CONFIRMATION",
  CLOSED: "CERRADA",
};

function domainStatusToLegacy(status: DomainStatus): string {
  return DOMAIN_TO_LEGACY_STATUS[status] ?? "GEOFENCE_CREATED";
}

function legacyStatusToDomain(status: string | null | undefined): DomainStatus {
  if (!status) return "NO_INICIADA";
  return LEGACY_TO_DOMAIN_STATUS[status] ?? "NO_INICIADA";
}

// --------------------------------------------------------------------------
// Filas SQLite crudas
// --------------------------------------------------------------------------

interface WorkSessionRow {
  id: number;
  start_time: number;
  actual_start_time: number | null;
  end_time: number | null;
  status: string;
  address: string | null;
  client_name: string | null;
  manual_note: string | null;
  is_manual_edit: number | null;
  lunch_taken: number | null;
  lunch_start: number | null;
  lunch_end: number | null;
  total_paused_ms: number | null;
  last_pause_start_ms: number | null;
  date_string: string | null;
  site_id: string | null;
  client_id: string | null;
  integrity_class: string | null;
  policy_id: string | null;
  original_actual_start_at_ms: number | null;
  original_end_at_ms: number | null;
}

interface TransitSegmentRow {
  id: string;
  session_id: number;
  from_site_id: string | null;
  to_site_id: string | null;
  start_at_ms: number;
  end_at_ms: number | null;
  is_paid: number;
  counts_for_overtime: number;
  policy_id: string;
}

interface LedgerEntryRow {
  id: string;
  session_id: number;
  prev_hash: string | null;
  hash: string;
  actor: string;
  intent: string;
  from_state: string | null;
  to_state: string | null;
  integrity_class: string;
  reason_code: string | null;
  reason: string | null;
  timestamp_ms: number;
  payload_json: string;
}

interface SpatialFactRow {
  id: string;
  session_id: number | null;
  site_id: string | null;
  type: string;
  lat: number;
  lon: number;
  accuracy_m: number;
  speed_mps: number | null;
  altitude_m: number | null;
  battery: number | null;
  timestamp_ms: number;
  source: string;
  reliable: number;
}

interface SiteRow {
  id: string;
  alias: string;
  client_id: string | null;
  client_name: string | null;
  address: string;
  target_latitude: number;
  target_longitude: number;
  radius_meters: number;
  is_active: number;
  created_at_ms: number;
}

interface PayrollStatementRow {
  id: string;
  period_start: number;
  period_end: number;
  statement_json: string;
  pack_hash: string;
  policy_id: string;
  generated_at_ms: number;
}

interface EvidencePackRow {
  id: string;
  period_start: number;
  period_end: number;
  pack_json: string;
  manifest_sha256: string;
  policy_id: string;
  generated_at_ms: number;
}

// --------------------------------------------------------------------------
// Mapeo fila <-> SessionRecord canónico (domain.ts)
// --------------------------------------------------------------------------

function mapTransitSegmentRow(row: TransitSegmentRow): TransitSegment {
  return {
    id: row.id,
    sessionId: row.session_id,
    fromSiteId: row.from_site_id,
    toSiteId: row.to_site_id,
    startAtMs: row.start_at_ms,
    endAtMs: row.end_at_ms,
    isPaid: Boolean(row.is_paid),
    countsForOvertime: Boolean(row.counts_for_overtime),
    policyId: row.policy_id,
  };
}

function mapWorkSessionRowToDomain(
  row: WorkSessionRow,
  transitSegments: TransitSegment[],
): DomainSessionRecord {
  const domainStatus = legacyStatusToDomain(row.status);

  return {
    id: row.id,
    declaredStartAtMs: row.start_time,
    actualStartAtMs: row.actual_start_time ?? null,
    endAtMs: row.end_time ?? null,
    domainStatus,
    siteId: row.site_id ?? null,
    clientId: row.client_id ?? null,
    lunch: {
      taken: Boolean(row.lunch_taken),
      startAtMs: row.lunch_start ?? null,
      endAtMs: row.lunch_end ?? null,
      deductedMinutes:
        row.lunch_taken && row.lunch_start && row.lunch_end
          ? Math.max(0, Math.round((row.lunch_end - row.lunch_start) / 60000))
          : null,
    },
    totalPausedMs: row.total_paused_ms ?? 0,
    lastPauseStartMs: row.last_pause_start_ms ?? null,
    transitSegments,
    integrityClass: (row.integrity_class as DomainSessionRecord["integrityClass"]) ?? "VALID",
    policyId: row.policy_id ?? "default",
    isDeleted: domainStatus === "CERRADA",
    isManualEdit: Boolean(row.is_manual_edit),
    manualEditNote: row.manual_note ?? null,
    originalActualStartAtMs: row.original_actual_start_at_ms ?? null,
    originalEndAtMs: row.original_end_at_ms ?? null,
    dateString: row.date_string ?? null,
  };
}

/** Convierte un SessionRecord canónico (domain.ts) al SessionRecord legacy
 * (types.ts) anidado, para los consumidores que aún no migraron
 * (reducer/effects actuales). Ver docstring de SessionRecord en domain.ts. */
function toLegacySessionRecord(session: DomainSessionRecord): LegacySessionRecord {
  const legacyStatusMap: Record<DomainStatus, LegacySessionRecord["lifecycle"]["domainStatus"]> = {
    NO_INICIADA: "GEOFENCE_CREATED",
    GEOFENCE_CREATED: "GEOFENCE_CREATED",
    TRASLADO: "TRAVEL",
    ACTIVA: "ACTIVE_WORK",
    PAUSADA: "PAUSED",
    PENDING_EXIT_CONFIRMATION: "PENDING_EXIT_CONFIRMATION",
    CERRADA: "CLOSED",
  };

  return {
    id: session.id,
    declaredStartAtMs: session.declaredStartAtMs,
    actualStartAtMs: session.actualStartAtMs,
    endAtMs: session.endAtMs,
    lifecycle: {
      domainStatus: legacyStatusMap[session.domainStatus],
      isDeleted: session.isDeleted,
      isManualEdit: session.isManualEdit,
      locationConfirmed: session.actualStartAtMs !== null,
      totalPausedMs: session.totalPausedMs,
      lastPauseStartMs: session.lastPauseStartMs,
    },
    destination: {
      address: null,
      clientName: session.clientId,
      targetLatitude: null,
      targetLongitude: null,
      setupLatitude: null,
      setupLongitude: null,
    },
    capturedLocation: {
      latitude: null,
      longitude: null,
    },
    lunch: session.lunch,
    notes: {
      manualNote: session.manualEditNote,
    },
    bookkeeping: {
      dateString: session.dateString,
    },
  };
}

/** Convierte un SessionRecord legacy (types.ts) al SessionRecord canónico
 * (domain.ts), completando los campos exclusivos del contrato congelado con
 * valores neutrales por defecto. Usado como puente durante la migración
 * mientras el reducer/effects legacy siguen siendo la fuente de un evento. */
function fromLegacySessionRecord(legacy: LegacySessionRecord): DomainSessionRecord {
  const domainStatusMap: Record<LegacySessionRecord["lifecycle"]["domainStatus"], DomainStatus> = {
    GEOFENCE_CREATED: "GEOFENCE_CREATED",
    TRAVEL: "TRASLADO",
    ACTIVE_WORK: "ACTIVA",
    PAUSED: "PAUSADA",
    PENDING_EXIT_CONFIRMATION: "PENDING_EXIT_CONFIRMATION",
    CLOSED: "CERRADA",
  };

  return {
    id: legacy.id,
    declaredStartAtMs: legacy.declaredStartAtMs,
    actualStartAtMs: legacy.actualStartAtMs,
    endAtMs: legacy.endAtMs,
    domainStatus: domainStatusMap[legacy.lifecycle.domainStatus],
    siteId: null,
    clientId: legacy.destination.clientName,
    lunch: legacy.lunch,
    totalPausedMs: legacy.lifecycle.totalPausedMs,
    lastPauseStartMs: legacy.lifecycle.lastPauseStartMs,
    transitSegments: [],
    integrityClass: legacy.lifecycle.isManualEdit ? "MANUAL" : "VALID",
    policyId: "default",
    isDeleted: legacy.lifecycle.isDeleted,
    isManualEdit: legacy.lifecycle.isManualEdit,
    manualEditNote: legacy.notes.manualNote,
    originalActualStartAtMs: null,
    originalEndAtMs: null,
    dateString: legacy.bookkeeping.dateString,
  };
}

// --------------------------------------------------------------------------
// Mapeo de otros contratos congelados
// --------------------------------------------------------------------------

function mapLedgerEntryRow(row: LedgerEntryRow): LedgerEntry {
  return {
    id: row.id,
    sessionId: row.session_id,
    prevHash: row.prev_hash,
    hash: row.hash,
    actor: row.actor as LedgerEntry["actor"],
    intent: row.intent,
    fromState: (row.from_state as DomainStatus | null) ?? null,
    toState: (row.to_state as DomainStatus | null) ?? null,
    integrityClass: row.integrity_class as LedgerEntry["integrityClass"],
    reasonCode: (row.reason_code as LedgerEntry["reasonCode"]) ?? null,
    reason: row.reason ?? null,
    timestampMs: row.timestamp_ms,
    payloadJson: row.payload_json,
  };
}

function mapSpatialFactRow(row: SpatialFactRow): SpatialFact {
  return {
    id: row.id,
    sessionId: row.session_id ?? null,
    siteId: row.site_id ?? null,
    type: row.type as SpatialFact["type"],
    lat: row.lat,
    lon: row.lon,
    accuracyM: row.accuracy_m,
    speedMps: row.speed_mps ?? null,
    altitudeM: row.altitude_m ?? null,
    battery: row.battery ?? null,
    timestampMs: row.timestamp_ms,
    source: row.source as SpatialFact["source"],
    reliable: Boolean(row.reliable),
  };
}

function mapSiteRow(row: SiteRow): Site {
  return {
    id: row.id,
    alias: row.alias,
    clientId: row.client_id ?? null,
    clientName: row.client_name ?? null,
    address: row.address,
    targetLatitude: row.target_latitude,
    targetLongitude: row.target_longitude,
    radiusMeters: row.radius_meters,
    isActive: Boolean(row.is_active),
    createdAtMs: row.created_at_ms,
  };
}

function mapEvidencePackRow(row: EvidencePackRow): EvidencePack {
  const parsed = JSON.parse(row.pack_json) as EvidencePack;
  return {
    ...parsed,
    id: row.id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    manifestSha256: row.manifest_sha256,
    policyId: row.policy_id,
    generatedAtMs: row.generated_at_ms,
  };
}

function mapPayrollStatementRow(row: PayrollStatementRow): PayrollStatement {
  const parsed = JSON.parse(row.statement_json) as PayrollStatement;
  return {
    ...parsed,
    id: row.id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    packHash: row.pack_hash,
    policyId: row.policy_id,
    generatedAtMs: row.generated_at_ms,
  };
}

// --------------------------------------------------------------------------
// Repositorio
// --------------------------------------------------------------------------

class PersistenceService {
  // ---- SessionRecord -----------------------------------------------------

  private async loadTransitSegmentsForSession(
    database: SQLite.SQLiteDatabase,
    sessionId: number,
  ): Promise<TransitSegment[]> {
    const rows = await database.getAllAsync<TransitSegmentRow>(
      `SELECT * FROM transit_segments WHERE session_id = ? ORDER BY start_at_ms ASC`,
      [sessionId],
    );
    return rows.map(mapTransitSegmentRow);
  }

  /**
   * Inserta (si `session.id` es <= 0 / no existe todavía) o actualiza (si ya
   * existe) el SessionRecord canónico completo, incluyendo columnas
   * exclusivas del contrato congelado. Retorna el id definitivo.
   */
  async saveSessionRecord(session: DomainSessionRecord): Promise<number> {
    return runTx(async (database) => {
      const legacyStatus = domainStatusToLegacy(session.domainStatus);
      const existing =
        session.id > 0
          ? await database.getFirstAsync<{ id: number }>(
              `SELECT id FROM work_sessions WHERE id = ?`,
              [session.id],
            )
          : null;

      if (existing) {
        await database.runAsync(
          `UPDATE work_sessions SET
             start_time = ?, actual_start_time = ?, end_time = ?, status = ?,
             address = COALESCE(address, ''), client_name = ?,
             manual_note = ?, is_manual_edit = ?,
             lunch_taken = ?, lunch_start = ?, lunch_end = ?,
             total_paused_ms = ?, last_pause_start_ms = ?, date_string = ?,
             site_id = ?, client_id = ?, integrity_class = ?, policy_id = ?,
             original_actual_start_at_ms = ?, original_end_at_ms = ?
           WHERE id = ?`,
          [
            session.declaredStartAtMs,
            session.actualStartAtMs,
            session.endAtMs,
            legacyStatus,
            session.clientId,
            session.manualEditNote,
            session.isManualEdit ? 1 : 0,
            session.lunch.taken ? 1 : 0,
            session.lunch.startAtMs,
            session.lunch.endAtMs,
            session.totalPausedMs,
            session.lastPauseStartMs,
            session.dateString,
            session.siteId,
            session.clientId,
            session.integrityClass,
            session.policyId,
            session.originalActualStartAtMs,
            session.originalEndAtMs,
            session.id,
          ],
        );
        return session.id;
      }

      const result = await database.runAsync(
        `INSERT INTO work_sessions (
           start_time, actual_start_time, end_time, status,
           address, client_name, manual_note, is_manual_edit,
           lunch_taken, lunch_start, lunch_end,
           total_paused_ms, last_pause_start_ms, date_string,
           site_id, client_id, integrity_class, policy_id,
           original_actual_start_at_ms, original_end_at_ms
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          session.declaredStartAtMs,
          session.actualStartAtMs,
          session.endAtMs,
          legacyStatus,
          "",
          session.clientId,
          session.manualEditNote,
          session.isManualEdit ? 1 : 0,
          session.lunch.taken ? 1 : 0,
          session.lunch.startAtMs,
          session.lunch.endAtMs,
          session.totalPausedMs,
          session.lastPauseStartMs,
          session.dateString,
          session.siteId,
          session.clientId,
          session.integrityClass,
          session.policyId,
          session.originalActualStartAtMs,
          session.originalEndAtMs,
        ],
      );

      return Number(result.lastInsertRowId);
    });
  }

  async getSessionRecord(id: number): Promise<DomainSessionRecord | null> {
    const database = await ensureDualTrackerSchema();
    const row = await database.getFirstAsync<WorkSessionRow>(
      `SELECT * FROM work_sessions WHERE id = ?`,
      [id],
    );
    if (!row) return null;
    const transitSegments = await this.loadTransitSegmentsForSession(database, row.id);
    return mapWorkSessionRowToDomain(row, transitSegments);
  }

  async listSessionRecords(options?: { includeClosed?: boolean }): Promise<DomainSessionRecord[]> {
    const database = await ensureDualTrackerSchema();
    const includeClosed = options?.includeClosed ?? true;
    const rows = await database.getAllAsync<WorkSessionRow>(
      includeClosed
        ? `SELECT * FROM work_sessions ORDER BY start_time ASC`
        : `SELECT * FROM work_sessions WHERE status != 'CLOSED' ORDER BY start_time ASC`,
    );

    const records: DomainSessionRecord[] = [];
    for (const row of rows) {
      const transitSegments = await this.loadTransitSegmentsForSession(database, row.id);
      records.push(mapWorkSessionRowToDomain(row, transitSegments));
    }
    return records;
  }

  toLegacySessionRecord(session: DomainSessionRecord): LegacySessionRecord {
    return toLegacySessionRecord(session);
  }

  fromLegacySessionRecord(legacy: LegacySessionRecord): DomainSessionRecord {
    return fromLegacySessionRecord(legacy);
  }

  /**
   * Consulta real de solapamiento — "checkOverlap deja de ser un comentario
   * en el modal" (Propuesta 4.2). Considera cualquier sesión que no esté
   * CERRADA cuyo rango [start,end) intersecte [candidateStartMs,
   * candidateEndMs). Una sesión abierta (endAtMs null) se trata como abierta
   * hasta "ahora" para efectos del solapamiento.
   */
  async checkOverlap(
    candidateStartMs: number,
    candidateEndMs: number,
    excludeSessionId?: number,
  ): Promise<boolean> {
    const database = await ensureDualTrackerSchema();
    const nowMs = timeAuthorityService.now();
    const effectiveCandidateEnd = candidateEndMs || nowMs;

    const result = await database.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM work_sessions
       WHERE (? IS NULL OR id != ?)
         AND status != 'CLOSED'
         AND COALESCE(end_time, ?) > ?
         AND start_time < ?`,
      [
        excludeSessionId ?? null,
        excludeSessionId ?? -1,
        nowMs,
        candidateStartMs,
        effectiveCandidateEnd,
      ],
    );

    return (result?.count ?? 0) > 0;
  }

  // ---- Ledger --------------------------------------------------------

  async appendLedgerEntry(entry: LedgerEntry): Promise<void> {
    await runTx(async (database) => {
      await database.runAsync(
        `INSERT INTO ledger_entries (
           id, session_id, prev_hash, hash, actor, intent,
           from_state, to_state, integrity_class, reason_code, reason,
           timestamp_ms, payload_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.id,
          entry.sessionId,
          entry.prevHash,
          entry.hash,
          entry.actor,
          entry.intent,
          entry.fromState,
          entry.toState,
          entry.integrityClass,
          entry.reasonCode,
          entry.reason,
          entry.timestampMs,
          entry.payloadJson,
        ],
      );
    });
  }

  async listLedgerEntriesForSession(sessionId: number): Promise<LedgerEntry[]> {
    const database = await ensureDualTrackerSchema();
    const rows = await database.getAllAsync<LedgerEntryRow>(
      `SELECT * FROM ledger_entries WHERE session_id = ? ORDER BY timestamp_ms ASC`,
      [sessionId],
    );
    return rows.map(mapLedgerEntryRow);
  }

  // ---- Spatial facts ---------------------------------------------------

  async insertSpatialFact(fact: SpatialFact): Promise<void> {
    await runTx(async (database) => {
      await database.runAsync(
        `INSERT INTO spatial_facts (
           id, session_id, site_id, type, lat, lon, accuracy_m, speed_mps,
           altitude_m, battery, timestamp_ms, source, reliable
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          fact.id,
          fact.sessionId,
          fact.siteId,
          fact.type,
          fact.lat,
          fact.lon,
          fact.accuracyM,
          fact.speedMps,
          fact.altitudeM,
          fact.battery,
          fact.timestampMs,
          fact.source,
          fact.reliable ? 1 : 0,
        ],
      );
    });
  }

  /**
   * Retención de traza (Propuesta 5.4: "Retención configurable, por ejemplo
   * 90 días o hasta exportación del periodo de nómina"). Borra hechos
   * espaciales con timestamp anterior a `timestampMs` y devuelve cuántos
   * fueron eliminados. Integración cerrada para TraceRecorderService
   * (ver working/notes/wave3.md, "deleteSpatialFactsBefore").
   */
  async deleteSpatialFactsBefore(timestampMs: number): Promise<number> {
    const database = await ensureDualTrackerSchema();
    const result = await database.runAsync(`DELETE FROM spatial_facts WHERE timestamp_ms < ?`, [
      timestampMs,
    ]);
    return result.changes ?? 0;
  }

  /**
   * Puente hacia las tablas legacy audit_logs/system_logs (src/database/db.ts)
   * para que LoggingService tenga un único punto de persistencia canónico.
   * Integración cerrada para LoggingService (ver working/notes/wave5.md,
   * "appendAuditLog/appendSystemLog").
   */
  async appendAuditLog(entry: {
    sessionId: number | null;
    actionType: string;
    details: string;
    timestampMs: number;
  }): Promise<void> {
    const database = await ensureDualTrackerSchema();
    await database.runAsync(
      `INSERT INTO audit_logs (session_id, action_type, details, timestamp)
       VALUES (?, ?, ?, ?)`,
      [entry.sessionId, entry.actionType, entry.details, entry.timestampMs],
    );
  }

  async appendSystemLog(entry: {
    timestampMs: number;
    timestampIso: string;
    color: string;
    category: string;
    severity: string;
    message: string;
    metadataJson: string | null;
    sessionId?: number | null;
    userId?: string | null;
    fromState?: string | null;
    toState?: string | null;
    eventType?: string | null;
  }): Promise<void> {
    const database = await ensureDualTrackerSchema();
    await database.runAsync(
      `INSERT INTO system_logs (
         timestamp, timestamp_str, color, categoria, severidad, mensaje,
         metadata, session_id, user_id, from_state, to_state, event_type
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.timestampMs,
        entry.timestampIso,
        entry.color,
        entry.category,
        entry.severity,
        entry.message,
        entry.metadataJson,
        entry.sessionId ?? null,
        entry.userId ?? null,
        entry.fromState ?? null,
        entry.toState ?? null,
        entry.eventType ?? null,
      ],
    );
  }

  async listSpatialFacts(sessionId: number): Promise<SpatialFact[]> {
    const database = await ensureDualTrackerSchema();
    const rows = await database.getAllAsync<SpatialFactRow>(
      `SELECT * FROM spatial_facts WHERE session_id = ? ORDER BY timestamp_ms ASC`,
      [sessionId],
    );
    return rows.map(mapSpatialFactRow);
  }

  // ---- Sites -----------------------------------------------------------

  async upsertSite(site: Site): Promise<void> {
    await runTx(async (database) => {
      await database.runAsync(
        `INSERT INTO sites (
           id, alias, client_id, client_name, address,
           target_latitude, target_longitude, radius_meters,
           is_active, created_at_ms
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           alias = excluded.alias,
           client_id = excluded.client_id,
           client_name = excluded.client_name,
           address = excluded.address,
           target_latitude = excluded.target_latitude,
           target_longitude = excluded.target_longitude,
           radius_meters = excluded.radius_meters,
           is_active = excluded.is_active`,
        [
          site.id,
          site.alias,
          site.clientId,
          site.clientName,
          site.address,
          site.targetLatitude,
          site.targetLongitude,
          site.radiusMeters,
          site.isActive ? 1 : 0,
          site.createdAtMs,
        ],
      );
    });
  }

  async listSites(): Promise<Site[]> {
    const database = await ensureDualTrackerSchema();
    const rows = await database.getAllAsync<SiteRow>(
      `SELECT * FROM sites ORDER BY created_at_ms ASC`,
    );
    return rows.map(mapSiteRow);
  }

  // ---- Transit segments --------------------------------------------------

  async insertTransitSegment(segment: TransitSegment): Promise<void> {
    await runTx(async (database) => {
      await database.runAsync(
        `INSERT INTO transit_segments (
           id, session_id, from_site_id, to_site_id, start_at_ms, end_at_ms,
           is_paid, counts_for_overtime, policy_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          segment.id,
          segment.sessionId,
          segment.fromSiteId,
          segment.toSiteId,
          segment.startAtMs,
          segment.endAtMs,
          segment.isPaid ? 1 : 0,
          segment.countsForOvertime ? 1 : 0,
          segment.policyId,
        ],
      );
    });
  }

  async updateTransitSegment(
    id: string,
    patch: Partial<Pick<TransitSegment, "endAtMs" | "isPaid" | "countsForOvertime" | "toSiteId">>,
  ): Promise<void> {
    await runTx(async (database) => {
      const existing = await database.getFirstAsync<TransitSegmentRow>(
        `SELECT * FROM transit_segments WHERE id = ?`,
        [id],
      );
      if (!existing) {
        throw new Error(`PersistenceService: transit_segment ${id} no existe.`);
      }

      const merged: TransitSegmentRow = {
        ...existing,
        end_at_ms: patch.endAtMs ?? existing.end_at_ms,
        is_paid: patch.isPaid !== undefined ? (patch.isPaid ? 1 : 0) : existing.is_paid,
        counts_for_overtime:
          patch.countsForOvertime !== undefined
            ? patch.countsForOvertime
              ? 1
              : 0
            : existing.counts_for_overtime,
        to_site_id: patch.toSiteId ?? existing.to_site_id,
      };

      await database.runAsync(
        `UPDATE transit_segments SET
           end_at_ms = ?, is_paid = ?, counts_for_overtime = ?, to_site_id = ?
         WHERE id = ?`,
        [merged.end_at_ms, merged.is_paid, merged.counts_for_overtime, merged.to_site_id, id],
      );
    });
  }

  // ---- Payroll statements ------------------------------------------------

  async savePayrollStatement(statement: PayrollStatement): Promise<void> {
    await runTx(async (database) => {
      await database.runAsync(
        `INSERT INTO payroll_statements (
           id, period_start, period_end, statement_json, pack_hash,
           policy_id, generated_at_ms
         ) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           statement_json = excluded.statement_json,
           pack_hash = excluded.pack_hash,
           generated_at_ms = excluded.generated_at_ms`,
        [
          statement.id,
          statement.periodStart,
          statement.periodEnd,
          JSON.stringify(statement),
          statement.packHash,
          statement.policyId,
          statement.generatedAtMs,
        ],
      );
    });
  }

  async listPayrollStatements(): Promise<PayrollStatement[]> {
    const database = await ensureDualTrackerSchema();
    const rows = await database.getAllAsync<PayrollStatementRow>(
      `SELECT * FROM payroll_statements ORDER BY generated_at_ms ASC`,
    );
    return rows.map(mapPayrollStatementRow);
  }

  /**
   * Persiste un EvidencePack ya sellado (EvidencePackService.buildPack). Un
   * pack sellado no se sobrescribe con contenido distinto bajo el mismo id
   * -- `savePack` es efectivamente insert-once: si el id ya existe, la
   * llamada es un no-op de confirmación, nunca una reescritura silenciosa
   * (Propuesta capa app §5.13/§9: "Dos packs sellados... no se sobrescriben").
   */
  async savePack(pack: EvidencePack): Promise<void> {
    await runTx(async (database) => {
      await database.runAsync(
        `INSERT INTO evidence_packs (
           id, period_start, period_end, pack_json, manifest_sha256,
           policy_id, generated_at_ms
         ) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
        [
          pack.id,
          pack.periodStart,
          pack.periodEnd,
          JSON.stringify(pack),
          pack.manifestSha256,
          pack.policyId,
          pack.generatedAtMs,
        ],
      );
    });
  }

  async getPack(packId: string): Promise<EvidencePack | null> {
    const database = await ensureDualTrackerSchema();
    const row = await database.getFirstAsync<EvidencePackRow>(
      `SELECT * FROM evidence_packs WHERE id = ?`,
      [packId],
    );
    return row ? mapEvidencePackRow(row) : null;
  }

  async listPacks(): Promise<EvidencePack[]> {
    const database = await ensureDualTrackerSchema();
    const rows = await database.getAllAsync<EvidencePackRow>(
      `SELECT * FROM evidence_packs ORDER BY generated_at_ms DESC`,
    );
    return rows.map(mapEvidencePackRow);
  }
}

/** Instancia única — un solo repositorio Dual Tracker por proceso. */
export const persistenceService = new PersistenceService();
