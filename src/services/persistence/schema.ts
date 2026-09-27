/**
 * Esquema SQLite canónico de Dual Tracker (Fase 0: "Dejar de añadir campos
 * ad hoc en SQLite"). Base: src/database/db.ts de GEOTrack (WAL, PRAGMAs,
 * migraciones aditivas), con tablas nuevas para sitios, ledger, hechos
 * espaciales, packs y cola offline.
 *
 * Cambios deliberados respecto a GEOTrack:
 *  - `is_deleted` explícito. En GEOTrack el borrado lógico ponía status='CLOSED'
 *    y el mapeo leía CLOSED como isDeleted, así que toda jornada cerrada
 *    aparecía como borrada.
 *  - Estados en español (máquina de siete estados de la propuesta).
 *  - Base nueva (`dual_tracker_v1.db`). La migración de datos desde
 *    `ledtracker_v2.db` queda como TODO (ver mappers.mapLegacyStatus).
 */
export const DB_NAME = "dual_tracker_v1.db";
// v2: reparación de date_string; v3: FieldCrypto v1.3 (DDL sin clave + paso de datos con clave, §7).
export const SCHEMA_VERSION = 3;

/** Columnas aditivas de sessions (spec v1.3 §5.3). También en CREATE_TABLES_SQL. */
export const SESSION_ADDED_COLUMNS: [string, string][] = [
  ["pauses_json", "TEXT NOT NULL DEFAULT '[]'"],
  ["pauses_source", "TEXT NOT NULL DEFAULT 'RECORDED'"],
  ["breaks_clipped", "INTEGER NOT NULL DEFAULT 0"],
  ["split_from_session_id", "INTEGER"], // P4 RESOLVE_SPLIT (§5.4)
];

/** Columnas aditivas de sites (spec v1.3 §7): coordenadas cifradas; las REAL quedan en NULL. */
export const SITE_ADDED_COLUMNS: [string, string][] = [["target_coords_enc", "TEXT"]];

export const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    declared_start_ms INTEGER NOT NULL,
    actual_start_ms INTEGER,
    end_ms INTEGER,
    domain_status TEXT NOT NULL,
    site_id INTEGER,
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
    split_from_session_id INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_start ON sessions(declared_start_ms);
  CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(domain_status);

  CREATE TABLE IF NOT EXISTS sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alias TEXT NOT NULL,
    address TEXT NOT NULL,
    client_name TEXT,
    notes TEXT,
    target_lat REAL,
    target_lon REAL,
    target_coords_enc TEXT,
    radius_m REAL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at_ms INTEGER NOT NULL,
    archived_at_ms INTEGER
  );

  CREATE TABLE IF NOT EXISTS ledger_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
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
  CREATE INDEX IF NOT EXISTS idx_ledger_session ON ledger_entries(session_id);

  -- Append-only: el ledger no admite UPDATE ni DELETE.
  CREATE TRIGGER IF NOT EXISTS trg_ledger_no_update
    BEFORE UPDATE ON ledger_entries
    BEGIN SELECT RAISE(ABORT, 'ledger_entries es append-only'); END;
  CREATE TRIGGER IF NOT EXISTS trg_ledger_no_delete
    BEFORE DELETE ON ledger_entries
    BEGIN SELECT RAISE(ABORT, 'ledger_entries es append-only'); END;

  CREATE TABLE IF NOT EXISTS spatial_facts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    site_id INTEGER,
    type TEXT NOT NULL,
    coords_sealed TEXT,
    accuracy_m REAL,
    source TEXT NOT NULL,
    reliable INTEGER NOT NULL,
    reason TEXT,
    battery REAL,
    timestamp_ms INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_spatial_session ON spatial_facts(session_id, timestamp_ms);

  CREATE TABLE IF NOT EXISTS evidence_packs (
    id TEXT PRIMARY KEY NOT NULL,
    period_start INTEGER NOT NULL,
    period_end INTEGER NOT NULL,
    pack_hash TEXT NOT NULL,
    policy_id TEXT NOT NULL,
    manifest_json TEXT NOT NULL,
    statement_json TEXT NOT NULL,
    evidence_json TEXT NOT NULL,
    employee_pdf_uri TEXT,
    employer_pdf_uri TEXT,
    manifest_uri TEXT,
    created_at_ms INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS offline_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pack_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_kv (
    key TEXT PRIMARY KEY NOT NULL,
    value_json TEXT NOT NULL,
    updated_at_ms INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
    action_type TEXT,
    details TEXT,
    timestamp INTEGER
  );

  CREATE TABLE IF NOT EXISTS system_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER,
    timestamp_str TEXT,
    color TEXT,
    categoria TEXT,
    severidad TEXT,
    mensaje TEXT,
    metadata TEXT,
    session_id INTEGER,
    event_type TEXT,
    trigger_source TEXT,
    reason TEXT,
    from_state TEXT,
    to_state TEXT,
    sync_status TEXT DEFAULT 'PENDING'
  );
`;

/** Claves de app_kv. */
export const KV_KEYS = {
  SCHEMA_VERSION: "schema_version",
  PROFILE: "settings.profile",
  COMPANY: "settings.company",
  DEVICE: "settings.device",
  HEARTBEAT: "runtime.heartbeat",
  PENDING_EXIT: "runtime.pending_exit",
  EXIT_DECISION: "runtime.exit_decision",
  LAST_SWEEP_DAY: "runtime.last_integrity_sweep_day",
  LAST_FIX: "runtime.last_fix",
  LAST_PACK_WEEK: "runtime.last_payroll_export_week",
  MUTEX_PREFIX: "mutex.",
  /** Migración única de pausas antiguas desde el ledger (spec v1.3 §5.3). */
  PAUSES_BACKFILL: "payroll.pauses_backfill.v1",
  /** FieldCrypto v1.3 §7: paso de datos con clave (coordenadas de destinos) completado. */
  CRYPTO_BACKFILL: "crypto.backfill.v3",
  /** FieldCrypto v1.3 §11 paso 5: barrido plain → enc completado. */
  CRYPTO_SWEEP: "crypto.sweep.v1",
} as const;
