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
// v4: claves foráneas (reconstrucción de tablas) y recorded_timezone.
// v5: spatial_facts.mocked (ubicación simulada). Columna NULL: las filas viejas siguen.
export const SCHEMA_VERSION = 5;

/** Columnas aditivas de sessions (spec v1.3 §5.3). También en CREATE_TABLES_SQL. */
export const SESSION_ADDED_COLUMNS: [string, string][] = [
  ["pauses_json", "TEXT NOT NULL DEFAULT '[]'"],
  ["pauses_source", "TEXT NOT NULL DEFAULT 'RECORDED'"],
  ["breaks_clipped", "INTEGER NOT NULL DEFAULT 0"],
  ["split_from_session_id", "INTEGER"], // P4 RESOLVE_SPLIT (§5.4)
  ["cert_blockers_json", "TEXT NOT NULL DEFAULT '[]'"], // FieldCrypto §12
  ["recorded_timezone", "TEXT"],
];

/** Columnas aditivas de sites (spec v1.3 §7): coordenadas cifradas; las REAL quedan en NULL. */
export const SITE_ADDED_COLUMNS: [string, string][] = [["target_coords_enc", "TEXT"]];

/** Cola del portal (tanda 2): clave de idempotencia y espera del reintento. */
export const OFFLINE_QUEUE_ADDED_COLUMNS: [string, string][] = [
  ["idempotency_key", "TEXT"],
  ["next_attempt_at_ms", "INTEGER"],
];

/** Hechos espaciales: flag de proveedor simulado. NULL en filas anteriores. */
export const SPATIAL_ADDED_COLUMNS: [string, string][] = [["mocked", "INTEGER"]];

export const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS sessions (
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
    pack_id TEXT NOT NULL REFERENCES evidence_packs(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    idempotency_key TEXT,
    next_attempt_at_ms INTEGER
  );

  CREATE TABLE IF NOT EXISTS app_kv (
    key TEXT PRIMARY KEY NOT NULL,
    value_json TEXT NOT NULL,
    updated_at_ms INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
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
    session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
    event_type TEXT,
    trigger_source TEXT,
    reason TEXT,
    from_state TEXT,
    to_state TEXT,
    sync_status TEXT DEFAULT 'PENDING'
  );

  -- Filas que no caben en una foránea. Se conservan; no entran en la nómina.
  CREATE TABLE IF NOT EXISTS spatial_facts_orphans (
    id INTEGER PRIMARY KEY,
    session_id INTEGER NOT NULL,
    site_id INTEGER,
    type TEXT NOT NULL,
    coords_sealed TEXT,
    accuracy_m REAL,
    source TEXT NOT NULL,
    reliable INTEGER NOT NULL,
    reason TEXT,
    battery REAL,
    timestamp_ms INTEGER NOT NULL,
    orphan_reason TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS offline_queue_orphans (
    id INTEGER PRIMARY KEY,
    pack_id TEXT NOT NULL,
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL,
    last_error TEXT,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    idempotency_key TEXT,
    next_attempt_at_ms INTEGER,
    orphan_reason TEXT NOT NULL
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
  /** Heartbeat ya anotado como MONITORING_GAP, para no repetir el mismo hueco. */
  MONITORING_GAP_NOTE: "runtime.monitoring_gap_note",
  /** Jornada para la que ya se avisó de ubicación simulada. */
  MOCK_NOTICE: "runtime.mock_notice",
  /** Bitácora de geocerca sin coordenadas (diagnóstico en Salud). */
  GEOFENCE_DIAG: "runtime.geofence_diag",
  /** Última sonda de hora de red y las muestras que aún no confirman deriva. */
  CLOCK_PROBE: "runtime.clock_probe",
  LAST_PACK_WEEK: "runtime.last_payroll_export_week",
  MUTEX_PREFIX: "mutex.",
  /** Migración única de pausas antiguas desde el ledger (spec v1.3 §5.3). */
  PAUSES_BACKFILL: "payroll.pauses_backfill.v1",
  /** FieldCrypto v1.3 §7: paso de datos con clave (coordenadas de destinos) completado. */
  CRYPTO_BACKFILL: "crypto.backfill.v3",
  /** FieldCrypto v1.3 §11 paso 5: barrido plain → enc completado. */
  CRYPTO_SWEEP: "crypto.sweep.v1",
} as const;
