/**
 * Migraciones de FieldCrypto que necesitan clave (spec v1.3 §7 y §11).
 * ============================================================================
 *  - runCryptoDataMigrations(): sites.target_lat/lon (REAL) → target_coords_enc,
 *    una transacción por fila con relectura y verificación |Δ| ≤ 5e-8; si no
 *    coincide → ROLLBACK, log ROJO y NEEDS_MIGRATE. Idempotente
 *    (KV crypto.backfill.v3 = true al terminar sin fallos).
 *  - sweepPlaintext(limit): barrido plain:v1:/legado → enc:v1: en todas las
 *    columnas del inventario (hasta `limit` filas por llamada; el resto lo
 *    sigue integritySweep). KV crypto.sweep.v1 = "done" cuando no queda nada.
 * Los sobres enc:v1: (incluidos los de kids perdidos) nunca se tocan.
 */
import type { FieldCryptoHealth } from "../../core/contracts";
import { FieldCryptoService, type FieldId } from "./FieldCryptoService";
import { LoggingService } from "./LoggingService";
import { PersistenceService } from "./PersistenceService";
import { KV_KEYS } from "./schema";

const COORD_TOLERANCE = 5e-8;

/** §14 integritySweep: añade a lostKids los kids de sobres presentes sin slot. */
export async function detectKeyLoss(): Promise<string[]> {
  return FieldCryptoService.detectLostKids();
}

export interface CryptoMigrationResult {
  migrated: number;
  failed: number[];
  skipped: boolean;
}

/** Solo tests: fuerza que la verificación de una fila falle (simula un sobre corrupto). */
let verifyHook: ((siteId: number) => boolean) | null = null;
export function __setCoordsVerifyHook(fn: ((siteId: number) => boolean) | null): void {
  verifyHook = fn;
}

export async function runCryptoDataMigrations(): Promise<CryptoMigrationResult> {
  const db = await PersistenceService.init();
  if (!FieldCryptoService.activeKid()) return { migrated: 0, failed: [], skipped: true };
  const rows = await db.getAllAsync<{ id: number; target_lat: number; target_lon: number }>(
    `SELECT id, target_lat, target_lon FROM sites WHERE target_lat IS NOT NULL AND target_lon IS NOT NULL`,
  );
  let migrated = 0;
  const failed: number[] = [];
  for (const r of rows) {
    try {
      await PersistenceService.transaction(async (tx) => {
        const enc = await FieldCryptoService.encryptJson("site.coords", r.id, { lat: r.target_lat, lon: r.target_lon });
        await tx.runAsync(`UPDATE sites SET target_coords_enc = ? WHERE id = ?`, [enc.stored, r.id]);
        const back = await tx.getFirstAsync<{ c: string }>(`SELECT target_coords_enc AS c FROM sites WHERE id = ?`, [r.id]);
        const c = await FieldCryptoService.decryptJson<{ lat: number; lon: number }>("site.coords", r.id, back?.c ?? null);
        const ok =
          !!c && Math.abs(c.lat - r.target_lat) <= COORD_TOLERANCE && Math.abs(c.lon - r.target_lon) <= COORD_TOLERANCE && (verifyHook?.(r.id) ?? true);
        if (!ok) throw new Error("verificación de coordenadas fallida");
        await tx.runAsync(`UPDATE sites SET target_lat = NULL, target_lon = NULL WHERE id = ?`, [r.id]);
      });
      migrated++;
    } catch (e) {
      failed.push(r.id);
      LoggingService.system({
        color: "ROJO",
        category: "INTEGRIDAD_COMPROMETIDA",
        severity: "ERROR",
        message: "Migración de coordenadas del destino revertida (NEEDS_MIGRATE)",
        metadata: { siteId: r.id, error: e instanceof Error ? e.message : String(e) },
      });
    }
  }
  FieldCryptoService.setNeedsMigrate(failed.length > 0);
  if (!failed.length) await PersistenceService.setKv(KV_KEYS.CRYPTO_BACKFILL, true);
  return { migrated, failed, skipped: false };
}

const SWEEP_COLUMNS: { table: string; column: string; fieldId: FieldId; json?: boolean }[] = [
  { table: "sessions", column: "manual_note_sealed", fieldId: "session.note" },
  { table: "sites", column: "alias", fieldId: "site.alias" },
  { table: "sites", column: "client_name", fieldId: "site.clientName" },
  { table: "sites", column: "address", fieldId: "site.address" },
  { table: "sites", column: "notes", fieldId: "site.notes" },
  { table: "sites", column: "target_coords_enc", fieldId: "site.coords", json: true },
  { table: "spatial_facts", column: "coords_sealed", fieldId: "spatial.coords", json: true },
];

export interface SweepResult {
  rewritten: number;
  remaining: number;
}

/** Barrido plain → enc (§11 paso 5). Sin clave activa no hace nada. */
export async function sweepPlaintext(limit = 500): Promise<SweepResult> {
  const db = await PersistenceService.init();
  if (!FieldCryptoService.activeKid()) return { rewritten: 0, remaining: -1 };
  let budget = limit;
  let rewritten = 0;
  for (const col of SWEEP_COLUMNS) {
    if (budget <= 0) break;
    const rows = await db.getAllAsync<{ id: number; v: string }>(
      `SELECT id, ${col.column} AS v FROM ${col.table} WHERE ${col.column} IS NOT NULL AND ${col.column} NOT LIKE 'enc:%' AND ${col.column} NOT LIKE 'aesgcm:%' ORDER BY id LIMIT ?`,
      [budget],
    );
    for (const r of rows) {
      const plain = await FieldCryptoService.decrypt(col.fieldId, r.id, r.v);
      const enc = col.json
        ? await FieldCryptoService.encryptJson(col.fieldId, r.id, plain === null ? null : safeJson(plain))
        : await FieldCryptoService.encrypt(col.fieldId, r.id, plain);
      if (enc.degraded) return { rewritten, remaining: -1 };
      await db.runAsync(`UPDATE ${col.table} SET ${col.column} = ? WHERE id = ?`, [enc.stored, r.id]);
      rewritten++;
      budget--;
    }
  }
  // app_kv: settings.company.companyEmailSealed y runtime.last_fix.
  if (budget > 0) {
    const company = await PersistenceService.getKv<Record<string, unknown>>(KV_KEYS.COMPANY);
    const sealed = company?.companyEmailSealed;
    if (typeof sealed === "string" && !FieldCryptoService.isCipher(sealed)) {
      const plain = await FieldCryptoService.decrypt("settings.companyEmail", KV_KEYS.COMPANY, sealed);
      const enc = await FieldCryptoService.encrypt("settings.companyEmail", KV_KEYS.COMPANY, plain);
      await PersistenceService.setKv(KV_KEYS.COMPANY, { ...company, companyEmailSealed: enc.stored });
      rewritten++;
    }
    const fix = await PersistenceService.getKv<unknown>(KV_KEYS.LAST_FIX);
    if (fix !== null && !(typeof fix === "string" && FieldCryptoService.isCipher(fix))) {
      const value = typeof fix === "string" ? safeJson((await FieldCryptoService.decrypt("kv.lastFix", KV_KEYS.LAST_FIX, fix)) ?? "null") : fix;
      if (value && typeof value === "object") await PersistenceService.setLastFix(value as { lat: number; lon: number; timestampMs: number });
      rewritten++;
    }
  }
  const remaining = await countPlaintext();
  if (remaining === 0) await PersistenceService.setKv(KV_KEYS.CRYPTO_SWEEP, "done");
  return { rewritten, remaining };
}

async function countPlaintext(): Promise<number> {
  const db = await PersistenceService.init();
  let n = 0;
  for (const col of SWEEP_COLUMNS) {
    const r = await db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM ${col.table} WHERE ${col.column} IS NOT NULL AND ${col.column} NOT LIKE 'enc:%' AND ${col.column} NOT LIKE 'aesgcm:%'`,
    );
    n += r?.n ?? 0;
  }
  return n;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * Pasos 2–5 del arranque (§11), en orden: ensureMasterKey → pérdida de clave →
 * paso de datos con clave → barrido único. Nunca lanza.
 */
export async function bootFieldCrypto(): Promise<{ status: string; migration: CryptoMigrationResult | null; sweep: SweepResult | null }> {
  await FieldCryptoService.ensureMasterKey();
  await FieldCryptoService.detectLostKids().catch(() => undefined);
  let migration: CryptoMigrationResult | null = null;
  let sweep: SweepResult | null = null;
  if (FieldCryptoService.activeKid()) {
    migration = await runCryptoDataMigrations().catch((e) => {
      LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "Migración de datos cifrados falló", { error: String(e) });
      return null;
    });
    if ((await PersistenceService.getKv<string>(KV_KEYS.CRYPTO_SWEEP)) !== "done") {
      sweep = await sweepPlaintext(500).catch((e) => {
        LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "Barrido de cifrado falló", { error: String(e) });
        return null;
      });
    }
  }
  return { status: FieldCryptoService.status(), migration, sweep };
}

/**
 * Sesiones afectadas por una pérdida de clave (§14): session_id con nota o
 * hechos espaciales cifrados con un kid perdido.
 */
export async function affectedSessionIds(lostKids: string[]): Promise<number[]> {
  if (!lostKids.length) return [];
  const db = await PersistenceService.init();
  const ids = new Set<number>();
  for (const kid of lostKids) {
    const prefix = `enc:v1:${kid}:%`;
    const a = await db.getAllAsync<{ id: number }>(`SELECT id FROM sessions WHERE manual_note_sealed LIKE ?`, [prefix]);
    const b = await db.getAllAsync<{ id: number }>(`SELECT DISTINCT session_id AS id FROM spatial_facts WHERE coords_sealed LIKE ?`, [prefix]);
    for (const r of [...a, ...b]) ids.add(Number(r.id));
  }
  return [...ids].sort((x, y) => x - y);
}

/** Reflejo para Store.health.fieldCrypto (§11 paso 7). */
export async function cryptoHealthSnapshot(): Promise<FieldCryptoHealth> {
  const lostKids = FieldCryptoService.lostKids();
  return {
    status: FieldCryptoService.status(),
    lostKids,
    affectedSessionIds: await affectedSessionIds(lostKids),
    platformSupported: FieldCryptoService.platformSupported(),
  };
}
