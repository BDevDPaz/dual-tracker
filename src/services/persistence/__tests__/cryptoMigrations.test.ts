/** C4 (spec v1.3 §7, §11) — target_coords_enc, orden de arranque, backfill con ROLLBACK, barrido de 500 filas. */
import { getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { EvidencePackService } from "../../evidence/EvidencePackService";
import { runIntegritySweep } from "../../runtime/tasks/integritySweep.task";
import { FieldCryptoService } from "../FieldCryptoService";
import { KeyStore } from "../keyStore";
import { PersistenceService } from "../PersistenceService";
import { __setCoordsVerifyHook, bootFieldCrypto, runCryptoDataMigrations, sweepPlaintext } from "../cryptoMigrations";
import { KV_KEYS } from "../schema";
import { HOUR, MONDAY_8AM } from "../../../../test/fixtures/session.fixture";
import { mustDispatch, seedWorld } from "../../../../test/helpers";
import { makeEnter } from "../../../../test/fixtures/spatial.fixture";
import { time } from "../../../../test/time";

/** Fila de destino tal como la dejaba 8df2b9a (texto en claro y REAL). */
async function legacySite(alias: string, lat: number, lon: number): Promise<number> {
  const db = await PersistenceService.init();
  const r = await db.runAsync(
    `INSERT INTO sites (alias, address, client_name, notes, target_lat, target_lon, radius_m, active, created_at_ms) VALUES (?, 'Dir', 'Cliente', NULL, ?, ?, 100, 1, 1)`,
    [alias, lat, lon],
  );
  return Number(r.lastInsertRowId);
}

afterEach(() => __setCoordsVerifyHook(null));

describe("C4 — migraciones con clave y barrido", () => {
  test("arranque: REAL → target_coords_enc verificado, REAL en NULL, alias/cliente cifrados; idempotente", async () => {
    const id = await legacySite("Álamo", 34.0522123, -118.2437456);
    const out = await bootFieldCrypto();
    expect(out.status).toBe("READY");
    expect(out.migration).toEqual({ migrated: 1, failed: [], skipped: false });
    const db = await PersistenceService.init();
    const raw = (await db.getFirstAsync<Record<string, unknown>>(`SELECT * FROM sites WHERE id = ?`, [id]))!;
    expect(raw.target_lat).toBeNull();
    expect(raw.target_lon).toBeNull();
    expect(raw.target_coords_enc).toMatch(/^enc:v1:k1:site\.coords:/);
    expect(raw.alias).toMatch(/^enc:v1:k1:site\.alias:/);
    expect(raw.client_name).toMatch(/^enc:v1:k1:site\.clientName:/);
    const site = (await PersistenceService.getSite(id))!;
    expect(Math.abs(site.targetLat! - 34.0522123)).toBeLessThanOrEqual(5e-8);
    expect(site.alias).toBe("Álamo");
    expect(await PersistenceService.getKv(KV_KEYS.CRYPTO_BACKFILL)).toBe(true);
    expect(await runCryptoDataMigrations()).toEqual({ migrated: 0, failed: [], skipped: false });
  });

  test("backfill con ROLLBACK: una fila que no verifica queda intacta y el estado pasa a NEEDS_MIGRATE", async () => {
    const bad = await legacySite("Malo", 1.5, 2.5);
    const good = await legacySite("Bueno", 3.5, 4.5);
    __setCoordsVerifyHook((siteId) => siteId !== bad);
    await FieldCryptoService.ensureMasterKey();
    const r = await runCryptoDataMigrations();
    expect(r).toEqual({ migrated: 1, failed: [bad], skipped: false });
    const db = await PersistenceService.init();
    const rowBad = (await db.getFirstAsync<Record<string, unknown>>(`SELECT target_lat, target_coords_enc FROM sites WHERE id = ?`, [bad]))!;
    expect(rowBad).toEqual({ target_lat: 1.5, target_coords_enc: null });
    expect((await db.getFirstAsync<Record<string, unknown>>(`SELECT target_lat FROM sites WHERE id = ?`, [good]))!.target_lat).toBeNull();
    expect(FieldCryptoService.status()).toBe("NEEDS_MIGRATE");
    expect(await PersistenceService.getKv(KV_KEYS.CRYPTO_BACKFILL)).toBeNull();
    // NEEDS_MIGRATE sigue cifrando con el kid activo.
    expect((await FieldCryptoService.encrypt("session.note", 1, "x")).degraded).toBe(false);
    __setCoordsVerifyHook(null);
    await runCryptoDataMigrations();
    expect(FieldCryptoService.status()).toBe("READY");
  });

  test("sin kid activo (UNAVAILABLE) el paso de datos no corre y el arranque no lanza", async () => {
    await legacySite("X", 1, 2);
    KeyStore.__setFailure(new Error("sin llavero"));
    const out = await bootFieldCrypto();
    expect(out).toEqual({ status: "UNAVAILABLE", migration: null, sweep: null });
  });

  test("barrido: 500 filas por arranque; integritySweep continúa y marca crypto.sweep.v1 = done", async () => {
    const db = await PersistenceService.init();
    for (let i = 0; i < 620; i++) {
      await db.runAsync(
        `INSERT INTO spatial_facts (session_id, type, coords_sealed, source, reliable, timestamp_ms) VALUES (1, 'BREADCRUMB', ?, 'gps', 1, ?)`,
        [`plain:v1:${JSON.stringify({ lat: 34 + i / 1e5, lon: -118 })}`, MONDAY_8AM + i],
      );
    }
    const boot = await bootFieldCrypto();
    expect(boot.sweep).toEqual({ rewritten: 500, remaining: 120 });
    expect(await PersistenceService.getKv(KV_KEYS.CRYPTO_SWEEP)).toBeNull();
    await runIntegritySweep(true);
    expect(await PersistenceService.getKv(KV_KEYS.CRYPTO_SWEEP)).toBe("done");
    const left = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM spatial_facts WHERE coords_sealed NOT LIKE 'enc:v1:%'`);
    expect(left!.n).toBe(0);
    expect((await PersistenceService.listSpatialFacts(1))[619].lat).toBe(34.00619);
  });

  test("#13 contentHash estable: datos escritos en claro, barrido plain → enc, resello → reutiliza", async () => {
    KeyStore.__setFailure(new Error("sin llavero"));
    time.set(MONDAY_8AM);
    const { siteA } = await seedWorld();
    const s = await mustDispatch({ type: "START_DAY", siteId: siteA, note: "nota inicial" });
    await mustDispatch({ type: "ARRIVAL_CONFIRMED", fact: makeEnter({ sessionId: s.id, siteId: siteA, timestampMs: time.now() }) }, "GEOFENCE");
    time.travel(8 * HOUR);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 0 });
    const db = await PersistenceService.init();
    expect((await db.getFirstAsync<{ n: string }>(`SELECT manual_note_sealed AS n FROM sessions`))!.n).toBe("plain:v1:nota inicial");
    const period = { periodStart: getWeekStart(MONDAY_8AM), periodEnd: getWeekEnd(MONDAY_8AM), allowUncertified: true };
    const first = await EvidencePackService.seal(period);
    if (!first.ok) throw new Error(first.code);
    // Vuelve el llavero (nuevo proceso): barrido plain → enc.
    KeyStore.__setFailure(null);
    FieldCryptoService.__forgetCache();
    await bootFieldCrypto();
    expect((await db.getFirstAsync<{ n: string }>(`SELECT manual_note_sealed AS n FROM sessions`))!.n).toMatch(/^enc:v1:/);
    const again = await EvidencePackService.seal(period);
    if (!again.ok) throw new Error(again.code);
    expect(again.reused).toBe(true);
    expect(again.data.manifest.contentHash).toBe(first.data.manifest.contentHash);
    expect((await EvidencePackService.verify(first.data)).valid).toBe(true);
    await sweepPlaintext();
  });
});
