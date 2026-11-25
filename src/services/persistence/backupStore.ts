/**
 * backupStore — volcado y reemplazo total de los datos para la copia de
 * seguridad (Ajustes). Vive en persistence/ porque es lo único que puede leer y
 * escribir los campos cifrados (staticGuards: FieldCryptoService solo aquí).
 * ============================================================================
 *  - dumpForBackup(): lee jornadas, destinos, libro, rastro, expedientes y los
 *    ajustes de persona/empresa. Los campos cifrados salen DESCIFRADOS: la clave
 *    de este teléfono no viaja (THIS_DEVICE_ONLY) y el archivo entero va cifrado
 *    con la contraseña de la copia (backupCodec). Un campo que hoy ya es
 *    ilegible (kid perdido) viaja tal cual y queda en `unreadable`.
 *  - replaceAllFromBackup(db, data): SOLO dentro de PersistenceService.transaction.
 *    Quita los triggers append-only, borra las tablas, inserta las filas con
 *    sus mismos ids, vuelve a cifrar con la clave de ESTE teléfono (el AAD usa
 *    el mismo rowId) y recrea los triggers. Un fallo en cualquier paso deja
 *    que la transacción haga ROLLBACK: datos y triggers vuelven a como estaban.
 *  - No viajan: cola del portal, registros de diagnóstico, salud de servicios,
 *    preferencias del dispositivo (alta, aviso aceptado), metadatos de cifrado
 *    ni estados de runtime. Tampoco los PDF (ver importAppBackup).
 */
import type * as SQLite from "expo-sqlite";
import { FieldCryptoService, type FieldId } from "./FieldCryptoService";
import { KV_KEYS, LEDGER_APPEND_ONLY_TRIGGERS_SQL, SCHEMA_VERSION } from "./schema";
import { PersistenceService } from "./PersistenceService";

export type BackupCell = string | number | null;
export type BackupRow = Record<string, BackupCell>;

/** Orden de inserción (claves foráneas). El borrado va al revés. */
export const BACKUP_TABLES = ["sites", "sessions", "ledger_entries", "spatial_facts", "evidence_packs"] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];

/** Columnas cifradas en la base → fieldId de FieldCrypto. rowId = id de la fila. */
export const BACKUP_SENSITIVE: Record<BackupTable, Record<string, FieldId>> = {
  sites: { alias: "site.alias", client_name: "site.clientName", address: "site.address", notes: "site.notes", target_coords_enc: "site.coords" },
  sessions: { manual_note_sealed: "session.note" },
  ledger_entries: {},
  spatial_facts: { coords_sealed: "spatial.coords" },
  evidence_packs: {},
};

export interface BackupUnreadable {
  table: BackupTable;
  id: number | string;
  column: string;
}

export interface BackupData {
  schemaVersion: number;
  tables: Record<BackupTable, BackupRow[]>;
  kv: {
    profile: unknown;
    /** settings.company con `companyEmail` en claro en lugar de `companyEmailSealed`. */
    company: Record<string, unknown> | null;
    lastPackWeek: unknown;
  };
  unreadable: BackupUnreadable[];
}

/** Estado de runtime atado a las jornadas de ESTE teléfono: se borra al restaurar. */
const RUNTIME_KEYS_TO_CLEAR = [
  KV_KEYS.PENDING_EXIT,
  KV_KEYS.EXIT_DECISION,
  KV_KEYS.EXIT_REOPEN,
  KV_KEYS.AUTO_CLOSE_BANNER,
  KV_KEYS.MONITORING_GAP_NOTE,
  KV_KEYS.MOCK_NOTICE,
  KV_KEYS.ARRIVAL_DWELL,
  KV_KEYS.REREGISTER_EXIT_GUARD,
  KV_KEYS.STILL_GOING,
  KV_KEYS.OFFSITE_PROMPT,
  KV_KEYS.ANOMALY_LATCH,
  KV_KEYS.LAST_PACK_WEEK,
  // Marcas de verificación del libro (IntegrityLedgerService.LEDGER_KV): se recalculan.
  "ledger.verified_through",
  "ledger.broken",
];

const SAFE_IDENT = /^[a-z_][a-z0-9_]*$/;

function rowKey(table: BackupTable, row: BackupRow): number | string {
  return table === "evidence_packs" ? String(row.id) : Number(row.id);
}

async function tableColumns(d: SQLite.SQLiteDatabase, table: BackupTable): Promise<Set<string>> {
  const cols = await d.getAllAsync<{ name: string }>(`PRAGMA table_info(${table});`);
  return new Set(cols.map((c) => c.name));
}

/** Lee todo lo que viaja en la copia. No escribe. */
export async function dumpForBackup(): Promise<BackupData> {
  const d = await PersistenceService.init();
  const unreadable: BackupUnreadable[] = [];
  const tables = {} as Record<BackupTable, BackupRow[]>;
  for (const table of BACKUP_TABLES) {
    const rows = await d.getAllAsync<BackupRow>(`SELECT * FROM ${table} ORDER BY id ASC`);
    const sensitive = BACKUP_SENSITIVE[table];
    for (const row of rows) {
      for (const [column, fieldId] of Object.entries(sensitive)) {
        const stored = row[column];
        if (stored === null || stored === undefined) continue;
        try {
          row[column] = await FieldCryptoService.decrypt(fieldId, rowKey(table, row), String(stored));
        } catch {
          unreadable.push({ table, id: rowKey(table, row), column });
        }
      }
    }
    tables[table] = rows;
  }
  const profile = await PersistenceService.getKv<unknown>(KV_KEYS.PROFILE);
  const stored = await PersistenceService.getKv<Record<string, unknown>>(KV_KEYS.COMPANY);
  let company: Record<string, unknown> | null = null;
  if (stored) {
    const { companyEmailSealed, ...rest } = stored;
    const email =
      typeof companyEmailSealed === "string"
        ? await FieldCryptoService.decrypt("settings.companyEmail", KV_KEYS.COMPANY, companyEmailSealed).catch(() => null)
        : null;
    company = { ...rest, companyEmail: email ?? "" };
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    tables,
    kv: { profile, company, lastPackWeek: await PersistenceService.getKv<unknown>(KV_KEYS.LAST_PACK_WEEK) },
    unreadable,
  };
}

/**
 * Columnas de la copia que esta base no tiene (una copia de un esquema más
 * nuevo, o un archivo manipulado). Los nombres también se validan como
 * identificadores: nunca se interpola texto del archivo en el SQL.
 */
export async function unknownBackupColumns(data: BackupData): Promise<string[]> {
  const d = await PersistenceService.init();
  const out: string[] = [];
  for (const table of BACKUP_TABLES) {
    const cols = await tableColumns(d, table);
    const seen = new Set<string>();
    for (const row of data.tables[table] ?? []) {
      for (const column of Object.keys(row)) {
        if (seen.has(column)) continue;
        seen.add(column);
        if (!SAFE_IDENT.test(column) || !cols.has(column)) out.push(`${table}.${column}`);
      }
    }
  }
  return out;
}

async function insertRow(d: SQLite.SQLiteDatabase, table: BackupTable, row: BackupRow, cols: Set<string>): Promise<void> {
  const names = Object.keys(row);
  for (const n of names) if (!SAFE_IDENT.test(n) || !cols.has(n)) throw new Error(`BACKUP_UNKNOWN_COLUMN:${table}.${n}`);
  await d.runAsync(
    `INSERT INTO ${table} (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})`,
    names.map((n) => row[n] ?? null),
  );
}

/**
 * Reemplazo total. Llamar SOLO dentro de PersistenceService.transaction con su
 * `db`. Devuelve cuántos campos quedaron sin cifrar (FieldCrypto UNAVAILABLE).
 */
export async function replaceAllFromBackup(d: SQLite.SQLiteDatabase, data: BackupData): Promise<{ degradedFields: number }> {
  let degradedFields = 0;
  const unreadable = new Set(data.unreadable.map((u) => `${u.table}|${u.id}|${u.column}`));
  await d.execAsync(`DROP TRIGGER IF EXISTS trg_ledger_no_update; DROP TRIGGER IF EXISTS trg_ledger_no_delete;`);
  // Lo que depende de jornadas y expedientes primero (claves foráneas RESTRICT).
  for (const table of ["offline_queue", "offline_queue_orphans", "spatial_facts_orphans", "evidence_packs", "spatial_facts", "ledger_entries", "sessions", "sites"]) {
    await d.runAsync(`DELETE FROM ${table}`);
  }
  for (const table of BACKUP_TABLES) {
    const cols = await tableColumns(d, table);
    const sensitive = BACKUP_SENSITIVE[table];
    const splits: { id: number; from: BackupCell }[] = [];
    for (const original of data.tables[table] ?? []) {
      const row: BackupRow = { ...original };
      for (const [column, fieldId] of Object.entries(sensitive)) {
        const value = row[column];
        if (value === null || value === undefined) continue;
        if (unreadable.has(`${table}|${rowKey(table, row)}|${column}`)) continue; // sobre ilegible: tal cual
        const enc = await FieldCryptoService.encrypt(fieldId, rowKey(table, row), String(value));
        if (enc.degraded) degradedFields++;
        row[column] = enc.stored;
      }
      // Auto-referencia: se enlaza al final, cuando ya existen todas las jornadas.
      if (table === "sessions" && row.split_from_session_id != null) {
        splits.push({ id: Number(row.id), from: row.split_from_session_id });
        row.split_from_session_id = null;
      }
      await insertRow(d, table, row, cols);
    }
    for (const s of splits) await d.runAsync(`UPDATE sessions SET split_from_session_id = ? WHERE id = ?`, [s.from, s.id]);
  }
  await d.execAsync(LEDGER_APPEND_ONLY_TRIGGERS_SQL);

  const marks = RUNTIME_KEYS_TO_CLEAR.map(() => "?").join(", ");
  await d.runAsync(`DELETE FROM app_kv WHERE key IN (${marks})`, RUNTIME_KEYS_TO_CLEAR);
  await d.runAsync(`DELETE FROM app_kv WHERE key LIKE ?`, [`${KV_KEYS.EXIT_DECISION}.%`]);
  if (data.kv.profile) await PersistenceService.setKv(KV_KEYS.PROFILE, data.kv.profile, d);
  if (data.kv.company) {
    const { companyEmail, ...rest } = data.kv.company;
    const enc = await FieldCryptoService.encrypt("settings.companyEmail", KV_KEYS.COMPANY, typeof companyEmail === "string" ? companyEmail : "");
    if (enc.degraded) degradedFields++;
    await PersistenceService.setKv(KV_KEYS.COMPANY, { ...rest, companyEmailSealed: enc.stored }, d);
  }
  if (data.kv.lastPackWeek !== null && data.kv.lastPackWeek !== undefined) {
    await PersistenceService.setKv(KV_KEYS.LAST_PACK_WEEK, data.kv.lastPackWeek, d);
  }
  return { degradedFields };
}
