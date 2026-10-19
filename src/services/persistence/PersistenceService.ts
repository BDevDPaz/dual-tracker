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
  CertificationBlocker,
  EvidencePack,
  LedgerEntry,
  OfflineQueueItem,
  OfflineQueueStatus,
  SessionRecord,
  Site,
  SpatialFact,
} from "../../core/contracts";
import { OPEN_SESSION_STATES } from "../../core/contracts";
import { abortWriteBuffer, beginWriteBuffer, flushWriteBuffer, markPersisted } from "../../core/refresh/dataRevision";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { isDateString, parseTimestamp, toDateString } from "../../utils/dateUtils";
import { FieldCryptoService } from "./FieldCryptoService";
import { LoggingService } from "./LoggingService";
import { CREATE_TABLES_SQL, DB_NAME, KV_KEYS, OFFLINE_QUEUE_ADDED_COLUMNS, SCHEMA_VERSION, SESSION_ADDED_COLUMNS, SITE_ADDED_COLUMNS } from "./schema";
import {
  DbSessionRow,
  DbSiteRow,
  DbSpatialRow,
  SESSION_COLUMNS,
  rowToSession,
  rowToSite,
  rowToSpatialFact,
  sessionToParams,
  type SealedCoords,
} from "./mappers";

/**
 * Informe de escritura (spec v1.3 §10): campos sensibles que salieron
 * degradados (plain:v1:, FieldCrypto UNAVAILABLE). El motor aplica §12.
 * Se pasa como parámetro de salida opcional para no romper las firmas.
 */
export interface WriteReport {
  degradedFields: string[];
}

/** Orden de destinos (§7): en memoria, colación española sin mayúsculas ni acentos; desempate por id. */
let collator: Intl.Collator | null = null;
function compareAlias(a: Site, b: Site): number {
  try {
    collator ??= new Intl.Collator("es", { sensitivity: "base" });
    return collator.compare(a.alias, b.alias) || a.id - b.id;
  } catch {
    return a.alias.toLocaleLowerCase().localeCompare(b.alias.toLocaleLowerCase()) || a.id - b.id;
  }
}

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

/**
 * v2 (reparación de datos, idempotente): builds anteriores en Hermes
 * persistieron `date_string = "Invalid Date"` (dayjs tz no funciona en Hermes).
 * Se recalcula desde el inicio de la sesión en la zona corporativa. Los
 * timestamps *_ms siempre fueron epoch ms válidos, así que no se pierde nada.
 */
async function repairInvalidDateStrings(database: SQLite.SQLiteDatabase): Promise<number> {
  const rows = await database.getAllAsync<{ id: number; declared_start_ms: unknown; actual_start_ms: unknown; date_string: unknown }>(
    `SELECT id, declared_start_ms, actual_start_ms, date_string FROM sessions
     WHERE date_string IS NULL OR date_string NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`,
  );
  let fixed = 0;
  for (const r of rows) {
    if (isDateString(r.date_string)) continue;
    const start = parseTimestamp(r.actual_start_ms) ?? parseTimestamp(r.declared_start_ms);
    const ds = start !== null ? toDateString(start) : "";
    if (!ds) continue;
    await database.runAsync(`UPDATE sessions SET date_string = ? WHERE id = ?`, [ds, r.id]);
    fixed++;
  }
  if (fixed > 0) {
    LoggingService.system({
      color: "AMARILLO",
      category: "SERVICIOS_ACTIVOS",
      severity: "WARN",
      message: "date_string reparado en sesiones (Invalid Date de builds previos)",
      metadata: { fixed },
    });
  }
  return fixed;
}

/** Tolerancia de la reconstrucción de pausas (spec v1.3 §5.3: ±60 s). */
const PAUSE_BACKFILL_TOLERANCE_MS = 60_000;

/**
 * Migración única de pausas antiguas (spec v1.3 §5.3). Para sesiones cerradas
 * con total_paused_ms > 0 y pauses_json vacío, empareja en el ledger cada
 * LUNCH_START/PAUSE_STARTED con el RESUME siguiente de la misma sesión (una
 * pausa abierta al cierre se cierra en end_ms, como hace closeRecord). Si la
 * suma coincide con total_paused_ms (±60 s) → pauses_source = LEDGER; si no →
 * PRORATED (el motor prorratea con advertencia). Idempotente (KV).
 */
export async function backfillPausesFromLedger(database: SQLite.SQLiteDatabase): Promise<{ ledger: number; prorated: number }> {
  const out = { ledger: 0, prorated: 0 };
  if (await readKv(database, KV_KEYS.PAUSES_BACKFILL)) return out;
  const rows = await database.getAllAsync<{ id: number; total_paused_ms: number; end_ms: number | null }>(
    `SELECT id, total_paused_ms, end_ms FROM sessions
     WHERE domain_status = 'CERRADA' AND total_paused_ms > 0 AND (pauses_json IS NULL OR pauses_json = '[]')`,
  );
  for (const r of rows) {
    const entries = await database.getAllAsync<{ intent: string; reason: string; timestamp_ms: number }>(
      `SELECT intent, reason, timestamp_ms FROM ledger_entries WHERE session_id = ? ORDER BY id ASC`,
      [r.id],
    );
    const pauses: { startAtMs: number; endAtMs: number }[] = [];
    let open: number | null = null;
    for (const e of entries) {
      if (e.intent === "LUNCH_START" && e.reason === "PAUSE_STARTED") open = Number(e.timestamp_ms);
      else if (open !== null && (e.intent === "RESUME" || e.intent === "CLOSE_DAY" || e.intent === "AUTO_CLOSE")) {
        const end = e.intent === "RESUME" ? Number(e.timestamp_ms) : Number(r.end_ms ?? e.timestamp_ms);
        pauses.push({ startAtMs: open, endAtMs: Math.max(open, end) });
        open = null;
      }
    }
    const sum = pauses.reduce((a, p) => a + (p.endAtMs - p.startAtMs), 0);
    const matches = pauses.length > 0 && Math.abs(sum - Number(r.total_paused_ms)) <= PAUSE_BACKFILL_TOLERANCE_MS;
    if (matches) {
      await database.runAsync(`UPDATE sessions SET pauses_json = ?, pauses_source = 'LEDGER' WHERE id = ?`, [JSON.stringify(pauses), r.id]);
      out.ledger++;
    } else {
      await database.runAsync(`UPDATE sessions SET pauses_source = 'PRORATED' WHERE id = ?`, [r.id]);
      out.prorated++;
    }
  }
  await database.runAsync(`INSERT OR REPLACE INTO app_kv (key, value_json, updated_at_ms) VALUES (?, ?, ?)`, [
    KV_KEYS.PAUSES_BACKFILL,
    JSON.stringify({ doneAtMs: TimeAuthorityService.now(), ...out }),
    TimeAuthorityService.now(),
  ]);
  if (out.ledger + out.prorated > 0) {
    LoggingService.system({
      color: "AMARILLO",
      category: "SERVICIOS_ACTIVOS",
      severity: "INFO",
      message: "Pausas antiguas reconstruidas desde el ledger",
      metadata: out,
    });
  }
  return out;
}

async function readKv(database: SQLite.SQLiteDatabase, key: string): Promise<unknown> {
  const row = await database.getFirstAsync<{ value_json: string }>(`SELECT value_json FROM app_kv WHERE key = ?`, [key]);
  return row ? JSON.parse(row.value_json) : null;
}

async function runMigrations(database: SQLite.SQLiteDatabase): Promise<void> {
  // v1: esquema inicial. Columnas aditivas (spec v1.3 §5.3: pausas por intervalo).
  for (const [col, def] of SESSION_ADDED_COLUMNS) await addColumnIfMissing(database, "sessions", col, def);
  // v3 DDL (FieldCrypto §7): sin clave. El paso de datos va en runCryptoDataMigrations.
  for (const [col, def] of SITE_ADDED_COLUMNS) await addColumnIfMissing(database, "sites", col, def);
  for (const [col, def] of OFFLINE_QUEUE_ADDED_COLUMNS) await addColumnIfMissing(database, "offline_queue", col, def);
  // v2: reparación de date_string (ver arriba).
  await repairInvalidDateStrings(database);
  // Paso de datos sin clave: pausas antiguas desde el ledger (una vez).
  await backfillPausesFromLedger(database);
  await database.runAsync(
    `INSERT OR REPLACE INTO app_kv (key, value_json, updated_at_ms) VALUES (?, ?, ?)`,
    [KV_KEYS.SCHEMA_VERSION, JSON.stringify(SCHEMA_VERSION), TimeAuthorityService.now()],
  );
}

const SITE_TEXT_FIELDS = [
  { column: "alias", key: "alias", fieldId: "site.alias" },
  { column: "address", key: "address", fieldId: "site.address" },
  { column: "client_name", key: "clientName", fieldId: "site.clientName" },
  { column: "notes", key: "notes", fieldId: "site.notes" },
] as const;

/**
 * Cifra y escribe alias, dirección, cliente y notas (§6). Un campo ilegible
 * (kid perdido, §14) que sigue con su valor hidratado vacío no se reescribe.
 */
async function writeSiteText(
  d: SQLite.SQLiteDatabase,
  site: Pick<Site, "id" | "alias" | "address" | "clientName" | "notes" | "unreadableFields" | "targetLat" | "targetLon">,
  report?: WriteReport,
): Promise<void> {
  const sets: string[] = [];
  const params: SqlParam[] = [];
  for (const f of SITE_TEXT_FIELDS) {
    const value = site[f.key];
    if (site.unreadableFields?.includes(f.key) && (value === null || value === "")) continue;
    const enc = await FieldCryptoService.encrypt(f.fieldId, site.id, value);
    if (enc.degraded) report?.degradedFields.push(f.fieldId);
    sets.push(`${f.column} = ?`);
    params.push(enc.stored);
  }
  // Coordenadas (§6/§7): target_coords_enc cifrado; las REAL quedan en NULL.
  if (!(site.unreadableFields?.includes("coords") && site.targetLat === null)) {
    const coords = site.targetLat !== null && site.targetLon !== null ? { lat: site.targetLat, lon: site.targetLon } : null;
    const enc = await FieldCryptoService.encryptJson("site.coords", site.id, coords);
    if (enc.degraded) report?.degradedFields.push("site.coords");
    sets.push("target_coords_enc = ?", "target_lat = NULL", "target_lon = NULL");
    params.push(enc.stored);
  }
  if (sets.length) await d.runAsync(`UPDATE sites SET ${sets.join(", ")} WHERE id = ?`, [...params, site.id]);
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
      beginWriteBuffer();
      try {
        const result = await work(database);
        await database.execAsync("COMMIT");
        flushWriteBuffer();
        return result;
      } catch (error) {
        abortWriteBuffer();
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
  async insertSession(record: SessionRecord, database?: SQLite.SQLiteDatabase, report?: WriteReport): Promise<number> {
    const d = database ?? (await ensureReady());
    // §8: INSERT con la columna sensible en NULL → lastInsertRowId → encrypt(rowId) → UPDATE.
    const params = sessionToParams(record, null);
    const placeholders = SESSION_COLUMNS.map(() => "?").join(", ");
    const res = await d.runAsync(
      `INSERT INTO sessions (${SESSION_COLUMNS.join(", ")}) VALUES (${placeholders})`,
      params,
    );
    const id = Number(res.lastInsertRowId);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error("La base de datos no devolvió un ID válido al crear la sesión.");
    }
    if (record.bookkeeping.manualNote !== null && record.bookkeeping.manualNote !== undefined) {
      const enc = await FieldCryptoService.encrypt("session.note", id, record.bookkeeping.manualNote);
      if (enc.degraded) report?.degradedFields.push("session.note");
      await d.runAsync(`UPDATE sessions SET manual_note_sealed = ? WHERE id = ?`, [enc.stored, id]);
    }
    markPersisted("sessions");
    return id;
  },

  /**
   * Reescribe la fila completa; la nota se vuelve a cifrar con el kid activo
   * (reescritura en la siguiente escritura, §11). Una nota ilegible (kid
   * perdido, §14) que sigue en null NO se toca: el sobre perdido se conserva.
   */
  async updateSession(record: SessionRecord, database?: SQLite.SQLiteDatabase, report?: WriteReport): Promise<void> {
    const d = database ?? (await ensureReady());
    const keepNote = !!record.bookkeeping.unreadableFields?.includes("note") && record.bookkeeping.manualNote === null;
    const enc = keepNote ? { stored: null, degraded: false } : await FieldCryptoService.encrypt("session.note", record.id, record.bookkeeping.manualNote);
    if (enc.degraded) report?.degradedFields.push("session.note");
    const params = sessionToParams(record, enc.stored);
    const cols = SESSION_COLUMNS.map((c, i) => [c, params[i]] as const).filter(([c]) => !(keepNote && c === "manual_note_sealed"));
    await d.runAsync(`UPDATE sessions SET ${cols.map(([c]) => `${c} = ?`).join(", ")} WHERE id = ?`, [...cols.map(([, v]) => v), record.id]);
    markPersisted("sessions");
  },

  /**
   * FieldCrypto v1.3 §12: agrega un bloqueo de certificación (permanente, una
   * sola vez). Devuelve true si se agregó ahora.
   */
  async addCertBlocker(sessionId: number, blocker: CertificationBlocker, database?: SQLite.SQLiteDatabase): Promise<boolean> {
    const d = database ?? (await ensureReady());
    const row = await d.getFirstAsync<{ b: string | null }>(`SELECT cert_blockers_json AS b FROM sessions WHERE id = ?`, [sessionId]);
    if (!row) return false;
    let list: string[] = [];
    try {
      list = JSON.parse(row.b ?? "[]");
    } catch {
      list = [];
    }
    if (list.includes(blocker)) return false;
    await d.runAsync(`UPDATE sessions SET cert_blockers_json = ? WHERE id = ?`, [JSON.stringify([...list, blocker]), sessionId]);
    markPersisted("sessions");
    return true;
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

  async listSessions(opts: { from?: number; to?: number; includeDeleted?: boolean; overlapping?: boolean } = {}): Promise<SessionRecord[]> {
    const d = await ensureReady();
    const where: string[] = [];
    const params: SqlParam[] = [];
    if (!opts.includeDeleted) where.push("is_deleted = 0");
    // Mismo criterio de inicio que selectSessionsInRange y buildStatement
    // (actual ?? declared). Un límite no finito (NaN) se ignora en vez de
    // enlazarse en SQL y devolver silenciosamente 0 filas.
    if (opts.from !== undefined && Number.isFinite(opts.from)) {
      // overlapping (spec v1.3 §5.2 N5): también las que empezaron antes y siguen
      // abiertas o terminan dentro del rango (superset; el motor filtra por segmento).
      if (opts.overlapping) where.push("(COALESCE(actual_start_ms, declared_start_ms) >= ? OR end_ms IS NULL OR end_ms > ?)");
      else where.push("COALESCE(actual_start_ms, declared_start_ms) >= ?");
      params.push(opts.from);
      if (opts.overlapping) params.push(opts.from);
    }
    if (opts.to !== undefined && Number.isFinite(opts.to)) {
      where.push("COALESCE(actual_start_ms, declared_start_ms) <= ?");
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
  async insertSite(site: Omit<Site, "id" | "lastVisitAtMs">, report?: WriteReport): Promise<number> {
    // §8: INSERT con alias/address vacíos (NOT NULL) y el resto en NULL → id → encrypt → UPDATE.
    return PersistenceService.transaction(async (tx) => {
      const res = await tx.runAsync(
      `INSERT INTO sites (alias, address, client_name, notes, target_lat, target_lon, radius_m, active, created_at_ms, archived_at_ms)
       VALUES ('', '', NULL, NULL, NULL, NULL, ?, ?, ?, ?)`,
      [
        site.radiusM,
        site.active ? 1 : 0,
        site.createdAtMs,
        site.archivedAtMs,
      ],
      );
      const id = Number(res.lastInsertRowId);
      await writeSiteText(tx, { ...site, id }, report);
      markPersisted("sites");
      return id;
    });
  },

  async updateSite(site: Site, report?: WriteReport): Promise<void> {
    await PersistenceService.transaction(async (d) => {
      await writeSiteText(d, site, report);
      await d.runAsync(
      `UPDATE sites SET radius_m = ?, active = ?, archived_at_ms = ? WHERE id = ?`,
      [
        site.radiusM,
        site.active ? 1 : 0,
        site.archivedAtMs,
        site.id,
      ],
      );
      markPersisted("sites");
    });
  },

  async getSite(id: number): Promise<Site | null> {
    const d = await ensureReady();
    const row = await d.getFirstAsync<DbSiteRow>(`SELECT * FROM sites WHERE id = ?`, [id]);
    return row ? await rowToSite(row) : null;
  },

  async listSites(opts: { includeArchived?: boolean } = {}): Promise<Site[]> {
    const d = await ensureReady();
    const rows = await d.getAllAsync<DbSiteRow>(
      `SELECT s.*, (
         SELECT MAX(COALESCE(x.actual_start_ms, x.declared_start_ms)) FROM sessions x
         WHERE x.site_id = s.id AND x.is_deleted = 0
       ) AS last_visit
       FROM sites s ${opts.includeArchived ? "" : "WHERE s.active = 1"}`,
    );
    // §7: alias cifrado → el orden pasa a memoria tras descifrar.
    const sites = await Promise.all(
      rows.map(async (r) => ({
        ...(await rowToSite(r)),
        lastVisitAtMs: parseTimestamp((r as DbSiteRow & { last_visit: unknown }).last_visit),
      })),
    );
    return sites.sort(compareAlias);
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
    const id = Number(res.lastInsertRowId);
    markPersisted("ledger");
    return id;
  },

  async getLastLedgerEntry(database?: SQLite.SQLiteDatabase): Promise<LedgerEntry | null> {
    const d = database ?? (await ensureReady());
    const row = await d.getFirstAsync<Record<string, unknown>>(
      `SELECT * FROM ledger_entries ORDER BY id DESC LIMIT 1`,
    );
    return row ? mapLedgerRow(row) : null;
  },

  async listLedger(
    opts: { sessionId?: number; from?: number; to?: number; afterId?: number; fromId?: number; toId?: number; intent?: string } = {},
  ): Promise<LedgerEntry[]> {
    const d = await ensureReady();
    const where: string[] = [];
    const params: SqlParam[] = [];
    if (opts.afterId !== undefined) {
      where.push("id > ?");
      params.push(opts.afterId);
    }
    if (opts.fromId !== undefined) {
      where.push("id >= ?");
      params.push(opts.fromId);
    }
    if (opts.toId !== undefined) {
      where.push("id <= ?");
      params.push(opts.toId);
    }
    if (opts.intent !== undefined) {
      where.push("intent = ?");
      params.push(opts.intent);
    }
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
    report?: WriteReport,
    database?: SQLite.SQLiteDatabase,
  ): Promise<number> {
    const d = database ?? (await ensureReady());
    // §8: INSERT con coords_sealed NULL → lastInsertRowId → encryptJson(rowId) → UPDATE.
    const res = await d.runAsync(
      `INSERT INTO spatial_facts (session_id, site_id, type, coords_sealed, accuracy_m, source, reliable, reason, battery, timestamp_ms)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
      [
        fact.sessionId,
        fact.siteId ?? null,
        fact.type,
        fact.accuracyM,
        fact.source,
        fact.reliable ? 1 : 0,
        fact.reason ?? null,
        fact.battery ?? null,
        fact.timestampMs,
      ],
    );
    const id = Number(res.lastInsertRowId);
    const coords: SealedCoords = { lat: fact.lat, lon: fact.lon, speedMps: fact.speedMps ?? null, altitudeM: fact.altitudeM ?? null };
    const enc = await FieldCryptoService.encryptJson("spatial.coords", id, coords);
    if (enc.degraded) report?.degradedFields.push("spatial.coords");
    await d.runAsync(`UPDATE spatial_facts SET coords_sealed = ? WHERE id = ?`, [enc.stored, id]);
    markPersisted("trace");
    return id;
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
    const r = await d.getFirstAsync<{ t: unknown }>(`SELECT MAX(timestamp_ms) AS t FROM spatial_facts`);
    return parseTimestamp(r?.t);
  },

  /** Migas y caídas de precisión, con su marca de tiempo. ENTER/EXIT no salen. */
  async listTrailStamps(): Promise<{ id: number; timestampMs: number }[]> {
    const d = await ensureReady();
    const rows = await d.getAllAsync<{ id: number; timestamp_ms: number }>(
      `SELECT id, timestamp_ms FROM spatial_facts WHERE type IN ('BREADCRUMB', 'ACCURACY_DROP') ORDER BY timestamp_ms ASC`,
    );
    return rows.map((r) => ({ id: Number(r.id), timestampMs: Number(r.timestamp_ms) }));
  },

  /** Borra solo miga de pan y ACCURACY_DROP, por id, en tandas. */
  async deleteSpatialFactsByIds(ids: number[]): Promise<number> {
    if (!ids.length) return 0;
    const d = await ensureReady();
    let deleted = 0;
    for (let i = 0; i < ids.length; i += 400) {
      const chunk = ids.slice(i, i + 400);
      const res = await d.runAsync(
        `DELETE FROM spatial_facts WHERE id IN (${chunk.map(() => "?").join(",")}) AND type IN ('BREADCRUMB', 'ACCURACY_DROP')`,
        chunk,
      );
      deleted += res.changes;
    }
    if (deleted) markPersisted("trace");
    return deleted;
  },

  /** Expurgo por corte de edad. El barrido de retención usa listTrailStamps. */
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

  /** runtime.last_fix cifrado (§6, fieldId kv.lastFix, rowId = la clave KV). Acepta el valor legado en claro. */
  async getLastFix(): Promise<{ lat: number; lon: number; timestampMs: number } | null> {
    const raw = await PersistenceService.getKv<unknown>(KV_KEYS.LAST_FIX);
    if (raw === null) return null;
    if (typeof raw === "object") return raw as { lat: number; lon: number; timestampMs: number };
    try {
      return await FieldCryptoService.decryptJson("kv.lastFix", KV_KEYS.LAST_FIX, raw as string);
    } catch {
      return null;
    }
  },

  async setLastFix(fix: { lat: number; lon: number; timestampMs: number }): Promise<void> {
    const enc = await FieldCryptoService.encryptJson("kv.lastFix", KV_KEYS.LAST_FIX, fix);
    await PersistenceService.setKv(KV_KEYS.LAST_FIX, enc.stored);
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
    markPersisted("packs");
  },

  /**
   * RESOLVE_SPLIT (spec v1.3 §5.4): re-vincula a `toSessionId` los hechos
   * espaciales con timestamp_ms ≥ fromMs. Devuelve cuántos se movieron.
   */
  async moveSpatialFacts(fromSessionId: number, toSessionId: number, fromMs: number, database?: SQLite.SQLiteDatabase): Promise<number> {
    const d = database ?? (await ensureReady());
    const r = await d.runAsync(`UPDATE spatial_facts SET session_id = ? WHERE session_id = ? AND timestamp_ms >= ?`, [toSessionId, fromSessionId, fromMs]);
    if ((r.changes ?? 0) > 0) markPersisted("trace");
    return r.changes ?? 0;
  },

  /** policy_id del pack más reciente del periodo exacto (policyForPeriod, spec v1.3 §5.2 N3). */
  async packPolicyForPeriod(periodStart: number, periodEnd: number): Promise<string | null> {
    const d = await ensureReady();
    const row = await d.getFirstAsync<{ policy_id: string }>(
      `SELECT policy_id FROM evidence_packs WHERE period_start = ? AND period_end = ? ORDER BY created_at_ms DESC LIMIT 1`,
      [periodStart, periodEnd],
    );
    return row?.policy_id ?? null;
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

  async enqueueOffline(packId: string, idempotencyKey: string | null = null): Promise<number> {
    const d = await ensureReady();
    const now = TimeAuthorityService.now();
    const res = await d.runAsync(
      `INSERT INTO offline_queue (pack_id, status, attempts, last_error, created_at_ms, updated_at_ms, idempotency_key, next_attempt_at_ms)
       VALUES (?, 'PENDING', 0, NULL, ?, ?, ?, NULL)`,
      [packId, now, now, idempotencyKey],
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
      idempotencyKey: typeof r.idempotency_key === "string" ? r.idempotency_key : null,
      nextAttemptAtMs: r.next_attempt_at_ms == null ? null : Number(r.next_attempt_at_ms),
    }));
  },

  async updateOffline(
    id: number,
    status: OfflineQueueStatus,
    lastError: string | null,
    nextAttemptAtMs: number | null = null,
  ): Promise<void> {
    const d = await ensureReady();
    await d.runAsync(
      `UPDATE offline_queue SET status = ?, attempts = attempts + 1, last_error = ?, updated_at_ms = ?, next_attempt_at_ms = ? WHERE id = ?`,
      [status, lastError, TimeAuthorityService.now(), nextAttemptAtMs, id],
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

// ---------------------------------------------------------------------------
// FieldCrypto: metadatos en app_kv y escaneo de kids (spec v1.3 §9, §14)
// ---------------------------------------------------------------------------
/** Columnas del inventario (§6) con sobres; app_kv se revisa por separado. */
export const CRYPTO_INVENTORY: { table: string; column: string }[] = [
  { table: "sessions", column: "manual_note_sealed" },
  { table: "sites", column: "alias" },
  { table: "sites", column: "client_name" },
  { table: "sites", column: "address" },
  { table: "sites", column: "notes" },
  { table: "spatial_facts", column: "coords_sealed" },
];

async function scanKids(): Promise<string[]> {
  const d = await ensureReady();
  const kids = new Set<string>();
  const cols = [...CRYPTO_INVENTORY];
  const siteCols = await d.getAllAsync<{ name: string }>(`PRAGMA table_info(sites);`);
  if (siteCols.some((c) => c.name === "target_coords_enc")) cols.push({ table: "sites", column: "target_coords_enc" });
  for (const { table, column } of cols) {
    const rows = await d.getAllAsync<{ k: string | null }>(
      `SELECT DISTINCT substr(${column}, 8, instr(substr(${column}, 8), ':') - 1) AS k FROM ${table} WHERE ${column} LIKE 'enc:v1:%'`,
    );
    for (const r of rows) if (r.k) kids.add(r.k);
  }
  const kv = await d.getAllAsync<{ value_json: string }>(`SELECT value_json FROM app_kv WHERE value_json LIKE '%enc:v1:%'`);
  for (const r of kv) for (const m of r.value_json.matchAll(/enc:v1:(k\d+):/g)) kids.add(m[1]);
  return [...kids].sort();
}

FieldCryptoService.attachStorage({
  getKv: (k) => PersistenceService.getKv(k),
  setKv: (k, v) => PersistenceService.setKv(k, v),
  scanKids,
});
