/**
 * PersistenceService — Persistencia (Propuesta Técnica §4.2)
 * ============================================================================
 * Fusiona DatabaseService (src/database/db.ts) y sessionStoreAdapter de
 * GEOTrack en un repositorio único con mapeo canónico ya resuelto.
 *
 *  - WAL obligatorio (PRAGMAs portados de GEOTrack).
 *  - Transacciones por intención de SessionEngine: `transaction(work)`.
 *  - checkOverlap se ejecuta en el repositorio (ya no es un comentario en el
 *    modal ni la regla demo "00:00" de W Tracker).
 *  - Rehidratación al arranque: `loadSnapshot()` produce el estado canónico.
 *
 * Solo SessionEngineService escribe sesiones y solo IntegrityLedgerService
 * escribe ledger_entries. El resto de servicios usa sus propios métodos.
 */
import * as SQLite from "expo-sqlite";
import type {
  EvidencePack,
  LedgerEntry,
  OfflineQueueItem,
  OfflineQueueStatus,
  SessionRecord,
  Site,
  SpatialFact,
} from "../../core/contracts";
import { OPEN_SESSION_STATES } from "../../core/contracts";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { LoggingService } from "./LoggingService";
import { CREATE_TABLES_SQL, DB_NAME, KV_KEYS, SCHEMA_VERSION } from "./schema";
import {
  DbSessionRow,
  DbSiteRow,
  DbSpatialRow,
  SESSION_COLUMNS,
  rowToSession,
  rowToSite,
  rowToSpatialFact,
  sealCoords,
  sessionToParams,
} from "./mappers";

type SqlParam = string | number | null;

let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let ready = false;
/** Serializa transacciones en esta conexión (evita BEGIN anidados). */
let txChain: Promise<unknown> = Promise.resolve();

async function configure(database: SQLite.SQLiteDatabase): Promise<void> {
  const wal = await database.getFirstAsync<{ journal_mode?: string }>("PRAGMA journal_mode = WAL");
  await database.execAsync(`PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;`);
  LoggingService.system({
    color: "VERDE",
    category: "SERVICIOS_ACTIVOS",
    severity: "INFO",
    message: "PRAGMAs SQLite configurados",
    metadata: { journal_mode: wal?.journal_mode ?? "unknown" },
  });
  if ((wal?.journal_mode ?? "").toLowerCase() !== "wal") {
    // WAL es obligatorio (§4.2). No se aborta el arranque, pero queda auditado.
    LoggingService.system({
      color: "ROJO",
      category: "INTEGRIDAD_COMPROMETIDA",
      severity: "WARN",
      message: "SQLite no aceptó journal_mode=WAL",
    });
  }
}

/** Migraciones aditivas (patrón addColumnIfMissing de GEOTrack). */
async function addColumnIfMissing(
  database: SQLite.SQLiteDatabase,
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  const cols = await database.getAllAsync<{ name: string }>(`PRAGMA table_info(${table});`);
  if (cols.some((c) => c.name === column)) return;
  await database.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
}

async function runMigrations(database: SQLite.SQLiteDatabase): Promise<void> {
  // v1: esquema inicial. Las siguientes versiones añaden columnas aquí.
  void addColumnIfMissing;
  await database.runAsync(
    `INSERT OR REPLACE INTO app_kv (key, value_json, updated_at_ms) VALUES (?, ?, ?)`,
    [KV_KEYS.SCHEMA_VERSION, JSON.stringify(SCHEMA_VERSION), TimeAuthorityService.now()],
  );
}

async function ensureReady(): Promise<SQLite.SQLiteDatabase> {
  if (ready && db) return db;
  return PersistenceService.init();
}

export const PersistenceService = {
  // -------------------------------------------------------------------------
  // Ciclo de vida
  // -------------------------------------------------------------------------
  async init(): Promise<SQLite.SQLiteDatabase> {
    if (ready && db) return db;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      const database = db ?? (await SQLite.openDatabaseAsync(DB_NAME));
      db = database;
      await configure(database);
      await database.execAsync(CREATE_TABLES_SQL);
      await runMigrations(database);
      await LoggingService.attachDatabase(database);
      ready = true;
      LoggingService.system({
        color: "VERDE",
        category: "SERVICIOS_ACTIVOS",
        severity: "INFO",
        message: "DB inicializada de forma segura",
      });
      return database;
    })();

    try {
      return await initPromise;
    } finally {
      if (!ready) initPromise = null;
    }
  },

  isReady(): boolean {
    return ready;
  },

  /**
   * Ejecuta `work` en una transacción BEGIN IMMEDIATE (portado de GEOTrack),
   * serializada en esta conexión. Una intención de SessionEngine = una transacción.
   */
  async transaction<T>(work: (database: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const database = await ensureReady();
      await database.execAsync("BEGIN IMMEDIATE TRANSACTION");
      try {
        const result = await work(database);
        await database.execAsync("COMMIT");
        return result;
      } catch (error) {
        try {
          await database.execAsync("ROLLBACK");
        } catch {
          // rollback secundario ignorado
        }
        throw error;
      }
    };
    const next = txChain.then(run, run);
    txChain = next.catch(() => undefined);
    return next;
  },

  // -------------------------------------------------------------------------
  // Sesiones (solo SessionEngineService escribe)
  // -------------------------------------------------------------------------
  async insertSession(record: SessionRecord, database?: SQLite.SQLiteDatabase): Promise<number> {
    const d = database ?? (await ensureReady());
    const params = await sessionToParams(record);
    const placeholders = SESSION_COLUMNS.map(() => "?").join(", ");
    const res = await d.runAsync(
      `INSERT INTO sessions (${SESSION_COLUMNS.join(", ")}) VALUES (${placeholders})`,
      params,
    );
    const id = Number(res.lastInsertRowId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error("La base de datos no devolvió un ID válido al crear la sesión.");
    }
    return id;
  },

  async updateSession(record: SessionRecord, database?: SQLite.SQLiteDatabase): Promise<void> {
    const d = database ?? (await ensureReady());
    const params = await sessionToParams(record);
    const sets = SESSION_COLUMNS.map((c) => `${c} = ?`).join(", ");
    await d.runAsync(`UPDATE sessions SET ${sets} WHERE id = ?`, [...params, record.id]);
  },

  async getSession(id: number): Promise<SessionRecord | null> {
    const d = await ensureReady();
    const row = await d.getFirstAsync<DbSessionRow>(`SELECT * FROM sessions WHERE id = ?`, [id]);
    return row ? rowToSession(row) : null;
  },

  /** Jornada abierta del dispositivo (mutex: debería existir como máximo una). */
  async getOpenSession(): Promise<SessionRecord | null> {
    const d = await ensureReady();
    const placeholders = OPEN_SESSION_STATES.map(() => "?").join(", ");
    const row = await d.getFirstAsync<DbSessionRow>(
      `SELECT * FROM sessions
       WHERE is_deleted = 0 AND domain_status IN (${placeholders})
       ORDER BY declared_start_ms DESC LIMIT 1`,
      [...OPEN_SESSION_STATES],
    );
    return row ? rowToSession(row) : null;
  },

  async countOpenSessions(): Promise<number> {
    const d = await ensureReady();
    const placeholders = OPEN_SESSION_STATES.map(() => "?").join(", ");
    const r = await d.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM sessions WHERE is_deleted = 0 AND domain_status IN (${placeholders})`,
      [...OPEN_SESSION_STATES],
    );
    return r?.n ?? 0;
  },

  async listSessions(opts: { from?: number; to?: number; includeDeleted?: boolean } = {}): Promise<SessionRecord[]> {
    const d = await ensureReady();
    const where: string[] = [];
    const params: SqlParam[] = [];
    if (!opts.includeDeleted) where.push("is_deleted = 0");
    if (opts.from !== undefined) {
      where.push("declared_start_ms >= ?");
      params.push(opts.from);
    }
    if (opts.to !== undefined) {
      where.push("declared_start_ms <= ?");
      params.push(opts.to);
    }
    const rows = await d.getAllAsync<DbSessionRow>(
      `SELECT * FROM sessions ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY declared_start_ms DESC`,
      params,
    );
    return Promise.all(rows.map(rowToSession));
  },

  /**
   * Solape real contra otras sesiones no borradas ni canceladas.
   * Corrige la consulta de GEOTrack, que excluía status 'CLOSED' y por tanto
   * nunca detectaba solape con jornadas ya cerradas.
   */
  async checkOverlap(startMs: number, endMs: number | null, excludeId: number | null): Promise<boolean> {
    const d = await ensureReady();
    const effectiveEnd = endMs ?? Number.MAX_SAFE_INTEGER;
    const r = await d.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM sessions
       WHERE id != ? AND is_deleted = 0 AND cancelled = 0
         AND COALESCE(end_ms, ?) > ?
         AND COALESCE(actual_start_ms, declared_start_ms) < ?`,
      [excludeId ?? -1, Number.MAX_SAFE_INTEGER, startMs, effectiveEnd],
    );
    return (r?.n ?? 0) > 0;
  },

  // -------------------------------------------------------------------------
  // Sitios
  // -------------------------------------------------------------------------
  async insertSite(site: Omit<Site, "id" | "lastVisitAtMs">): Promise<number> {
    const d = await ensureReady();
    const res = await d.runAsync(
      `INSERT INTO sites (alias, address, client_name, notes, target_lat, target_lon, radius_m, active, created_at_ms, archived_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        site.alias,
        site.address,
        site.clientName,
        site.notes,
        site.targetLat,
        site.targetLon,
        site.radiusM,
        site.active ? 1 : 0,
        site.createdAtMs,
        site.archivedAtMs,
      ],
    );
    return Number(res.lastInsertRowId);
  },

  async updateSite(site: Site): Promise<void> {
    const d = await ensureReady();
    await d.runAsync(
      `UPDATE sites SET alias = ?, address = ?, client_name = ?, notes = ?, target_lat = ?, target_lon = ?,
         radius_m = ?, active = ?, archived_at_ms = ? WHERE id = ?`,
      [
        site.alias,
        site.address,
        site.clientName,
        site.notes,
        site.targetLat,
        site.targetLon,
        site.radiusM,
        site.active ? 1 : 0,
        site.archivedAtMs,
        site.id,
      ],
    );
  },

  async getSite(id: number): Promise<Site | null> {
    const d = await ensureReady();
    const row = await d.getFirstAsync<DbSiteRow>(`SELECT * FROM sites WHERE id = ?`, [id]);
    return row ? rowToSite(row) : null;
  },

  async listSites(opts: { includeArchived?: boolean } = {}): Promise<Site[]> {
    const d = await ensureReady();
    const rows = await d.getAllAsync<DbSiteRow>(
      `SELECT s.*, (
         SELECT MAX(COALESCE(x.actual_start_ms, x.declared_start_ms)) FROM sessions x
         WHERE x.site_id = s.id AND x.is_deleted = 0
       ) AS last_visit
       FROM sites s ${opts.includeArchived ? "" : "WHERE s.active = 1"}
       ORDER BY s.alias COLLATE NOCASE ASC`,
    );
    return rows.map((r) => ({
      ...rowToSite(r),
      lastVisitAtMs: (r as DbSiteRow & { last_visit: number | null }).last_visit ?? null,
    }));
  },

  async countActiveSites(): Promise<number> {
    const d = await ensureReady();
    const r = await d.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM sites WHERE active = 1`);
    return r?.n ?? 0;
  },

  // -------------------------------------------------------------------------
  // Ledger (solo IntegrityLedgerService escribe)
  // -------------------------------------------------------------------------
  async insertLedgerEntry(entry: Omit<LedgerEntry, "id">, database?: SQLite.SQLiteDatabase): Promise<number> {
    const d = database ?? (await ensureReady());
    const res = await d.runAsync(
      `INSERT INTO ledger_entries (session_id, prev_hash, hash, actor, intent, from_state, to_state, reason, timestamp_ms, payload_json, integrity_class)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.sessionId,
        entry.prevHash,
        entry.hash,
        entry.actor,
        entry.intent,
        entry.fromState,
        entry.toState,
        entry.reason,
        entry.timestampMs,
        entry.payloadJson,
        entry.integrityClass,
      ],
    );
    return Number(res.lastInsertRowId);
  },

  async getLastLedgerEntry(database?: SQLite.SQLiteDatabase): Promise<LedgerEntry | null> {
    const d = database ?? (await ensureReady());
    const row = await d.getFirstAsync<Record<string, unknown>>(
      `SELECT * FROM ledger_entries ORDER BY id DESC LIMIT 1`,
    );
    return row ? mapLedgerRow(row) : null;
  },

  async listLedger(opts: { sessionId?: number; from?: number; to?: number } = {}): Promise<LedgerEntry[]> {
    const d = await ensureReady();
    const where: string[] = [];
    const params: SqlParam[] = [];
    if (opts.sessionId !== undefined) {
      where.push("session_id = ?");
      params.push(opts.sessionId);
    }
    if (opts.from !== undefined) {
      where.push("timestamp_ms >= ?");
      params.push(opts.from);
    }
    if (opts.to !== undefined) {
      where.push("timestamp_ms <= ?");
      params.push(opts.to);
    }
    const rows = await d.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM ledger_entries ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY id ASC`,
      params,
    );
    return rows.map(mapLedgerRow);
  },

  // -------------------------------------------------------------------------
  // Hechos espaciales (GeofenceRuntime / TraceRecorder)
  // -------------------------------------------------------------------------
  async insertSpatialFact(
    fact: SpatialFact & { speedMps?: number | null; altitudeM?: number | null; battery?: number | null },
  ): Promise<number> {
    const d = await ensureReady();
    const res = await d.runAsync(
      `INSERT INTO spatial_facts (session_id, site_id, type, coords_sealed, accuracy_m, source, reliable, reason, battery, timestamp_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fact.sessionId,
        fact.siteId ?? null,
        fact.type,
        await sealCoords({
          lat: fact.lat,
          lon: fact.lon,
          speedMps: fact.speedMps ?? null,
          altitudeM: fact.altitudeM ?? null,
        }),
        fact.accuracyM,
        fact.source,
        fact.reliable ? 1 : 0,
        fact.reason ?? null,
        fact.battery ?? null,
        fact.timestampMs,
      ],
    );
    return Number(res.lastInsertRowId);
  },

  async listSpatialFacts(sessionId: number, types?: SpatialFact["type"][]) {
    const d = await ensureReady();
    const params: SqlParam[] = [sessionId];
    let typeClause = "";
    if (types?.length) {
      typeClause = ` AND type IN (${types.map(() => "?").join(", ")})`;
      params.push(...types);
    }
    const rows = await d.getAllAsync<DbSpatialRow>(
      `SELECT * FROM spatial_facts WHERE session_id = ?${typeClause} ORDER BY timestamp_ms ASC`,
      params,
    );
    return Promise.all(rows.map(rowToSpatialFact));
  },

  async lastSpatialFactAt(): Promise<number | null> {
    const d = await ensureReady();
    const r = await d.getFirstAsync<{ t: number | null }>(`SELECT MAX(timestamp_ms) AS t FROM spatial_facts`);
    return r?.t ?? null;
  },

  /** Expurgo por retención (§5.4). Solo miga de pan; ENTER/EXIT se conservan como evidencia. */
  async purgeBreadcrumbsBefore(cutoffMs: number): Promise<number> {
    const d = await ensureReady();
    const res = await d.runAsync(
      `DELETE FROM spatial_facts WHERE type IN ('BREADCRUMB', 'ACCURACY_DROP') AND timestamp_ms < ?`,
      [cutoffMs],
    );
    return res.changes;
  },

  // -------------------------------------------------------------------------
  // KV (settings separados, heartbeat, pending exit, mutex)
  // -------------------------------------------------------------------------
  async getKv<T>(key: string): Promise<T | null> {
    const d = await ensureReady();
    const r = await d.getFirstAsync<{ value_json: string }>(`SELECT value_json FROM app_kv WHERE key = ?`, [key]);
    if (!r) return null;
    try {
      return JSON.parse(r.value_json) as T;
    } catch {
      return null;
    }
  },

  async setKv(key: string, value: unknown, database?: SQLite.SQLiteDatabase): Promise<void> {
    const d = database ?? (await ensureReady());
    await d.runAsync(`INSERT OR REPLACE INTO app_kv (key, value_json, updated_at_ms) VALUES (?, ?, ?)`, [
      key,
      JSON.stringify(value),
      TimeAuthorityService.now(),
    ]);
  },

  async deleteKv(key: string): Promise<void> {
    const d = await ensureReady();
    await d.runAsync(`DELETE FROM app_kv WHERE key = ?`, [key]);
  },

  // -------------------------------------------------------------------------
  // Evidence packs + cola offline
  // -------------------------------------------------------------------------
  async insertPack(pack: EvidencePack): Promise<void> {
    const d = await ensureReady();
    // INSERT (no REPLACE): dos packs nunca se sobrescriben (§9 criterios app).
    await d.runAsync(
      `INSERT INTO evidence_packs (id, period_start, period_end, pack_hash, policy_id, manifest_json, statement_json, evidence_json,
         employee_pdf_uri, employer_pdf_uri, manifest_uri, created_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        pack.id,
        pack.manifest.periodStart,
        pack.manifest.periodEnd,
        pack.manifest.packHash,
        pack.manifest.policyId,
        JSON.stringify(pack.manifest),
        JSON.stringify(pack.statement),
        JSON.stringify(pack.evidence),
        pack.employeePdfUri,
        pack.employerPdfUri,
        pack.manifestUri,
        pack.createdAtMs,
      ],
    );
  },

  async listPacks(): Promise<EvidencePack[]> {
    const d = await ensureReady();
    const rows = await d.getAllAsync<Record<string, unknown>>(`SELECT * FROM evidence_packs ORDER BY created_at_ms DESC`);
    return rows.map(mapPackRow);
  },

  async getPack(id: string): Promise<EvidencePack | null> {
    const d = await ensureReady();
    const row = await d.getFirstAsync<Record<string, unknown>>(`SELECT * FROM evidence_packs WHERE id = ?`, [id]);
    return row ? mapPackRow(row) : null;
  },

  async enqueueOffline(packId: string): Promise<number> {
    const d = await ensureReady();
    const now = TimeAuthorityService.now();
    const res = await d.runAsync(
      `INSERT INTO offline_queue (pack_id, status, attempts, created_at_ms, updated_at_ms) VALUES (?, 'PENDING', 0, ?, ?)`,
      [packId, now, now],
    );
    return Number(res.lastInsertRowId);
  },

  async listOffline(status?: OfflineQueueStatus): Promise<OfflineQueueItem[]> {
    const d = await ensureReady();
    const rows = await d.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM offline_queue ${status ? "WHERE status = ?" : ""} ORDER BY id ASC`,
      status ? [status] : [],
    );
    return rows.map((r) => ({
      id: Number(r.id),
      packId: String(r.pack_id),
      status: r.status as OfflineQueueStatus,
      attempts: Number(r.attempts),
      lastError: (r.last_error as string | null) ?? null,
      createdAtMs: Number(r.created_at_ms),
      updatedAtMs: Number(r.updated_at_ms),
    }));
  },

  async updateOffline(id: number, status: OfflineQueueStatus, lastError: string | null): Promise<void> {
    const d = await ensureReady();
    await d.runAsync(
      `UPDATE offline_queue SET status = ?, attempts = attempts + 1, last_error = ?, updated_at_ms = ? WHERE id = ?`,
      [status, lastError, TimeAuthorityService.now(), id],
    );
  },

  // -------------------------------------------------------------------------
  // Rehidratación
  // -------------------------------------------------------------------------
  /** Snapshot canónico para el arranque (Zustand/store solo refleja esto). */
  async loadSnapshot(): Promise<{ sessions: SessionRecord[]; sites: Site[]; packs: EvidencePack[] }> {
    const [sessions, sites, packs] = await Promise.all([
      PersistenceService.listSessions({ includeDeleted: true }),
      PersistenceService.listSites({ includeArchived: true }),
      PersistenceService.listPacks(),
    ]);
    return { sessions, sites, packs };
  },
};

function mapLedgerRow(row: Record<string, unknown>): LedgerEntry {
  return {
    id: Number(row.id),
    sessionId: row.session_id === null ? null : Number(row.session_id),
    prevHash: String(row.prev_hash),
    hash: String(row.hash),
    actor: row.actor as LedgerEntry["actor"],
    intent: row.intent as LedgerEntry["intent"],
    fromState: (row.from_state as LedgerEntry["fromState"]) ?? null,
    toState: (row.to_state as LedgerEntry["toState"]) ?? null,
    reason: String(row.reason),
    timestampMs: Number(row.timestamp_ms),
    payloadJson: String(row.payload_json),
    integrityClass: (row.integrity_class as LedgerEntry["integrityClass"]) ?? null,
  };
}

function mapPackRow(row: Record<string, unknown>): EvidencePack {
  return {
    id: String(row.id),
    manifest: JSON.parse(String(row.manifest_json)),
    statement: JSON.parse(String(row.statement_json)),
    evidence: JSON.parse(String(row.evidence_json)),
    employeePdfUri: (row.employee_pdf_uri as string | null) ?? null,
    employerPdfUri: (row.employer_pdf_uri as string | null) ?? null,
    manifestUri: (row.manifest_uri as string | null) ?? null,
    createdAtMs: Number(row.created_at_ms),
  };
}
