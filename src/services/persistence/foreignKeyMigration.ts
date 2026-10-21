/**
 * Claves foráneas (auditoría 2, hallazgo 15).
 * SQLite no añade una REFERENCES a una tabla ya creada: se reconstruye.
 * Las filas que no tienen padre se conservan (site_id y session_id anulables
 * pasan a NULL; un hecho espacial sin jornada o una cola sin pack van a una
 * tabla de huérfanos). Con el esquema ya foráneo y sin huérfanos no se copia nada.
 */
import type * as SQLite from "expo-sqlite";
import { LoggingService } from "./LoggingService";

export interface OrphanReport {
  sessionSite: number;
  sessionSplit: number;
  spatialSession: number;
  spatialSite: number;
  ledgerSession: number;
  queuePack: number;
  auditSession: number;
  logSession: number;
}

const EMPTY: OrphanReport = {
  sessionSite: 0,
  sessionSplit: 0,
  spatialSession: 0,
  spatialSite: 0,
  ledgerSession: 0,
  queuePack: 0,
  auditSession: 0,
  logSession: 0,
};

async function count(database: SQLite.SQLiteDatabase, sql: string): Promise<number> {
  const row = await database.getFirstAsync<{ n: number }>(sql);
  return Number(row?.n ?? 0);
}

export async function countFkOrphans(database: SQLite.SQLiteDatabase): Promise<OrphanReport> {
  return {
    sessionSite: await count(database, `SELECT COUNT(*) AS n FROM sessions WHERE site_id IS NOT NULL AND site_id NOT IN (SELECT id FROM sites)`),
    sessionSplit: await count(
      database,
      `SELECT COUNT(*) AS n FROM sessions WHERE split_from_session_id IS NOT NULL AND split_from_session_id NOT IN (SELECT id FROM sessions)`,
    ),
    spatialSession: await count(database, `SELECT COUNT(*) AS n FROM spatial_facts WHERE session_id NOT IN (SELECT id FROM sessions)`),
    spatialSite: await count(
      database,
      `SELECT COUNT(*) AS n FROM spatial_facts WHERE site_id IS NOT NULL AND site_id NOT IN (SELECT id FROM sites)`,
    ),
    ledgerSession: await count(
      database,
      `SELECT COUNT(*) AS n FROM ledger_entries WHERE session_id IS NOT NULL AND session_id NOT IN (SELECT id FROM sessions)`,
    ),
    queuePack: await count(database, `SELECT COUNT(*) AS n FROM offline_queue WHERE pack_id NOT IN (SELECT id FROM evidence_packs)`),
    auditSession: await count(
      database,
      `SELECT COUNT(*) AS n FROM audit_logs WHERE session_id IS NOT NULL AND session_id NOT IN (SELECT id FROM sessions)`,
    ),
    logSession: await count(
      database,
      `SELECT COUNT(*) AS n FROM system_logs WHERE session_id IS NOT NULL AND session_id NOT IN (SELECT id FROM sessions)`,
    ),
  };
}

function dirty(report: OrphanReport): boolean {
  return Object.values(report).some((n) => n > 0);
}

async function hasSessionSiteFk(database: SQLite.SQLiteDatabase): Promise<boolean> {
  const rows = await database.getAllAsync<{ from?: string; from_column?: string }>(`PRAGMA foreign_key_list(sessions)`);
  return rows.some((r) => r.from === "site_id" || r.from_column === "site_id");
}

const REBUILD_SQL = `
  INSERT OR IGNORE INTO spatial_facts_orphans (
    id, session_id, site_id, type, coords_sealed, accuracy_m, source, reliable, reason, battery, timestamp_ms, orphan_reason
  )
  SELECT id, session_id, site_id, type, coords_sealed, accuracy_m, source, reliable, reason, battery, timestamp_ms, 'MISSING_SESSION'
  FROM spatial_facts
  WHERE session_id NOT IN (SELECT id FROM sessions);

  INSERT OR IGNORE INTO offline_queue_orphans (
    id, pack_id, status, attempts, last_error, created_at_ms, updated_at_ms, idempotency_key, next_attempt_at_ms, orphan_reason
  )
  SELECT id, pack_id, status, attempts, last_error, created_at_ms, updated_at_ms, idempotency_key, next_attempt_at_ms, 'MISSING_PACK'
  FROM offline_queue
  WHERE pack_id NOT IN (SELECT id FROM evidence_packs);

  ALTER TABLE sessions RENAME TO sessions_v4_old;
  CREATE TABLE sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    declared_start_ms INTEGER NOT NULL,
    actual_start_ms INTEGER,
    end_ms INTEGER,
    domain_status TEXT NOT NULL,
    site_id INTEGER REFERENCES sites(id) ON DELETE SET NULL,
    client_id TEXT,
    lunch_taken INTEGER NOT NULL DEFAULT 0,
    lunch_start_ms INTEGER,
    lunch_end_ms INTEGER,
    lunch_deducted_min INTEGER,
    total_paused_ms INTEGER NOT NULL DEFAULT 0,
    transit_segments_json TEXT NOT NULL DEFAULT '[]',
    integrity_class TEXT NOT NULL DEFAULT 'VALID',
    integrity_reason TEXT NOT NULL DEFAULT 'CLEAN',
    policy_id TEXT NOT NULL,
    date_string TEXT NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    cancelled INTEGER NOT NULL DEFAULT 0,
    last_pause_start_ms INTEGER,
    first_exit_ms INTEGER,
    first_exit_reliable INTEGER,
    original_json TEXT,
    manual_note_sealed TEXT,
    updated_at_ms INTEGER NOT NULL,
    pauses_json TEXT NOT NULL DEFAULT '[]',
    pauses_source TEXT NOT NULL DEFAULT 'RECORDED',
    breaks_clipped INTEGER NOT NULL DEFAULT 0,
    split_from_session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
    cert_blockers_json TEXT NOT NULL DEFAULT '[]',
    recorded_timezone TEXT
  );
  INSERT INTO sessions (
    id, declared_start_ms, actual_start_ms, end_ms, domain_status, site_id, client_id,
    lunch_taken, lunch_start_ms, lunch_end_ms, lunch_deducted_min, total_paused_ms, transit_segments_json,
    integrity_class, integrity_reason, policy_id, date_string, is_deleted, cancelled, last_pause_start_ms,
    first_exit_ms, first_exit_reliable, original_json, manual_note_sealed, updated_at_ms, pauses_json,
    pauses_source, breaks_clipped, split_from_session_id, cert_blockers_json, recorded_timezone
  )
  SELECT
    id, declared_start_ms, actual_start_ms, end_ms, domain_status,
    CASE WHEN site_id IS NOT NULL AND site_id NOT IN (SELECT id FROM sites) THEN NULL ELSE site_id END,
    client_id, lunch_taken, lunch_start_ms, lunch_end_ms, lunch_deducted_min, total_paused_ms, transit_segments_json,
    integrity_class, integrity_reason, policy_id, date_string, is_deleted, cancelled, last_pause_start_ms,
    first_exit_ms, first_exit_reliable, original_json, manual_note_sealed, updated_at_ms, pauses_json,
    pauses_source, breaks_clipped,
    CASE WHEN split_from_session_id IS NOT NULL AND split_from_session_id NOT IN (SELECT id FROM sessions_v4_old) THEN NULL ELSE split_from_session_id END,
    cert_blockers_json, recorded_timezone
  FROM sessions_v4_old
  ORDER BY id;
  DROP TABLE sessions_v4_old;
  CREATE INDEX IF NOT EXISTS idx_sessions_start ON sessions(declared_start_ms);
  CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(domain_status);

  ALTER TABLE spatial_facts RENAME TO spatial_facts_v4_old;
  CREATE TABLE spatial_facts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
    site_id INTEGER REFERENCES sites(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    coords_sealed TEXT,
    accuracy_m REAL,
    source TEXT NOT NULL,
    reliable INTEGER NOT NULL,
    reason TEXT,
    battery REAL,
    timestamp_ms INTEGER NOT NULL,
    mocked INTEGER
  );
  INSERT INTO spatial_facts (
    id, session_id, site_id, type, coords_sealed, accuracy_m, source, reliable, reason, battery, timestamp_ms, mocked
  )
  SELECT
    id, session_id,
    CASE WHEN site_id IS NOT NULL AND site_id NOT IN (SELECT id FROM sites) THEN NULL ELSE site_id END,
    type, coords_sealed, accuracy_m, source, reliable, reason, battery, timestamp_ms, mocked
  FROM spatial_facts_v4_old
  WHERE session_id IN (SELECT id FROM sessions)
  ORDER BY id;
  DROP TABLE spatial_facts_v4_old;
  CREATE INDEX IF NOT EXISTS idx_spatial_session ON spatial_facts(session_id, timestamp_ms);

  ALTER TABLE ledger_entries RENAME TO ledger_entries_v4_old;
  CREATE TABLE ledger_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER REFERENCES sessions(id) ON DELETE RESTRICT,
    prev_hash TEXT NOT NULL,
    hash TEXT NOT NULL UNIQUE,
    actor TEXT NOT NULL,
    intent TEXT NOT NULL,
    from_state TEXT,
    to_state TEXT,
    reason TEXT NOT NULL,
    timestamp_ms INTEGER NOT NULL,
    payload_json TEXT NOT NULL,
    integrity_class TEXT
  );
  INSERT INTO ledger_entries (
    id, session_id, prev_hash, hash, actor, intent, from_state, to_state, reason, timestamp_ms, payload_json, integrity_class
  )
  SELECT
    id,
    CASE WHEN session_id IS NOT NULL AND session_id NOT IN (SELECT id FROM sessions) THEN NULL ELSE session_id END,
    prev_hash, hash, actor, intent, from_state, to_state, reason, timestamp_ms, payload_json, integrity_class
  FROM ledger_entries_v4_old
  ORDER BY id;
  DROP TABLE ledger_entries_v4_old;
  CREATE INDEX IF NOT EXISTS idx_ledger_session ON ledger_entries(session_id);
  CREATE TRIGGER IF NOT EXISTS trg_ledger_no_update
    BEFORE UPDATE ON ledger_entries
    BEGIN SELECT RAISE(ABORT, 'ledger_entries es append-only'); END;
  CREATE TRIGGER IF NOT EXISTS trg_ledger_no_delete
    BEFORE DELETE ON ledger_entries
    BEGIN SELECT RAISE(ABORT, 'ledger_entries es append-only'); END;

  ALTER TABLE offline_queue RENAME TO offline_queue_v4_old;
  CREATE TABLE offline_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pack_id TEXT NOT NULL REFERENCES evidence_packs(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    idempotency_key TEXT,
    next_attempt_at_ms INTEGER
  );
  INSERT INTO offline_queue (
    id, pack_id, status, attempts, last_error, created_at_ms, updated_at_ms, idempotency_key, next_attempt_at_ms
  )
  SELECT id, pack_id, status, attempts, last_error, created_at_ms, updated_at_ms, idempotency_key, next_attempt_at_ms
  FROM offline_queue_v4_old
  WHERE pack_id IN (SELECT id FROM evidence_packs)
  ORDER BY id;
  DROP TABLE offline_queue_v4_old;

  ALTER TABLE audit_logs RENAME TO audit_logs_v4_old;
  CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
    action_type TEXT,
    details TEXT,
    timestamp INTEGER
  );
  INSERT INTO audit_logs (id, session_id, action_type, details, timestamp)
  SELECT
    id,
    CASE WHEN session_id IS NOT NULL AND session_id NOT IN (SELECT id FROM sessions) THEN NULL ELSE session_id END,
    action_type, details, timestamp
  FROM audit_logs_v4_old
  ORDER BY id;
  DROP TABLE audit_logs_v4_old;

  ALTER TABLE system_logs RENAME TO system_logs_v4_old;
  CREATE TABLE system_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER,
    timestamp_str TEXT,
    color TEXT,
    categoria TEXT,
    severidad TEXT,
    mensaje TEXT,
    metadata TEXT,
    session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
    event_type TEXT,
    trigger_source TEXT,
    reason TEXT,
    from_state TEXT,
    to_state TEXT,
    sync_status TEXT DEFAULT 'PENDING'
  );
  INSERT INTO system_logs (
    id, timestamp, timestamp_str, color, categoria, severidad, mensaje, metadata, session_id,
    event_type, trigger_source, reason, from_state, to_state, sync_status
  )
  SELECT
    id, timestamp, timestamp_str, color, categoria, severidad, mensaje, metadata,
    CASE WHEN session_id IS NOT NULL AND session_id NOT IN (SELECT id FROM sessions) THEN NULL ELSE session_id END,
    event_type, trigger_source, reason, from_state, to_state, sync_status
  FROM system_logs_v4_old
  ORDER BY id;
  DROP TABLE system_logs_v4_old;
`;

/**
 * Declara las foráneas y aparta huérfanos. `force` reconstruye aunque el
 * esquema ya las tenga (la prueba de no perder filas).
 */
export async function ensureForeignKeys(database: SQLite.SQLiteDatabase, opts?: { force?: boolean }): Promise<OrphanReport> {
  const before = await countFkOrphans(database);
  const present = await hasSessionSiteFk(database);
  if (present && !dirty(before) && !opts?.force) return before;

  await database.execAsync("PRAGMA foreign_keys = OFF");
  try {
    await database.execAsync(REBUILD_SQL);
  } finally {
    await database.execAsync("PRAGMA foreign_keys = ON");
  }
  const left = await database.getAllAsync<{ table: string }>(`PRAGMA foreign_key_check`);
  if (left.length) {
    LoggingService.system({
      color: "ROJO",
      category: "INTEGRIDAD_COMPROMETIDA",
      severity: "ERROR",
      message: "foreign_key_check no quedó vacío tras la migración",
      metadata: { rows: left.length },
    });
    throw new Error("FK_CHECK_FAILED");
  }
  if (dirty(before)) {
    LoggingService.system({
      color: "AMARILLO",
      category: "INTEGRIDAD_COMPROMETIDA",
      severity: "WARN",
      message: "Huérfanos apartados al declarar claves foráneas",
      metadata: { ...before },
    });
  }
  return before;
}

export const EMPTY_ORPHAN_REPORT = EMPTY;
