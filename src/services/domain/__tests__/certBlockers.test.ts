/** C5 (spec v1.3 §12, §17 #11) — escrituras degradadas: bloqueo de certificación, no CONFLICT. */
import type { SessionIntent } from "../../../core/contracts";
import { Store } from "../../../core/store";
import { selectCertification } from "../../../core/selectors";
import { getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { EvidencePackService } from "../../evidence/EvidencePackService";
import { bootFieldCrypto, sweepPlaintext } from "../../persistence/cryptoMigrations";
import { FieldCryptoService } from "../../persistence/FieldCryptoService";
import { KeyStore } from "../../persistence/keyStore";
import { PersistenceService } from "../../persistence/PersistenceService";
import { rollupIntegrity } from "../PayrollEngineService";
import { SessionEngineService } from "../SessionEngineService";
import { HOUR, MONDAY_8AM, makeClosedSession } from "../../../../test/fixtures/session.fixture";
import { makeBreadcrumb, makeEnter } from "../../../../test/fixtures/spatial.fixture";
import { mustDispatch, seedWorld } from "../../../../test/helpers";
import { time } from "../../../../test/time";

async function workday(note?: string) {
  const { siteA } = await seedWorld();
  const s = await mustDispatch({ type: "START_DAY", siteId: siteA, note: note ?? null });
  await mustDispatch({ type: "ARRIVAL_CONFIRMED", fact: makeEnter({ sessionId: s.id, siteId: siteA, timestampMs: time.now() }) }, "GEOFENCE");
  return { s, siteA };
}
const blockerEntries = async (sessionId: number) => (await PersistenceService.listLedger({ sessionId })).filter((e) => e.intent === "CERT_BLOCKER_ADDED");

beforeEach(() => {
  time.set(MONDAY_8AM);
  SessionEngineService.setCryptoAvailability(async () => {
    await FieldCryptoService.ensureMasterKey();
    return FieldCryptoService.status() !== "UNAVAILABLE";
  });
});
afterEach(() => SessionEngineService.setCryptoAvailability(null));

describe("C5 — bloqueo de certificación FIELD_CRYPTO_UNAVAILABLE", () => {
  test("#11 sin llavero: el arranque no lanza; jornada con nota → bloqueo una sola vez, clase sin cambios (no CONFLICT)", async () => {
    KeyStore.__setFailure(new Error("keystore caído"));
    await expect(bootFieldCrypto()).resolves.toMatchObject({ status: "UNAVAILABLE" });
    const { s } = await workday("nota degradada");
    time.travel(8 * HOUR);
    const closed = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 0 });
    expect(closed.integrityClass).not.toBe("CONFLICT");
    expect(closed.bookkeeping.certificationBlockers).toEqual(["FIELD_CRYPTO_UNAVAILABLE"]);
    const entries = await blockerEntries(s.id);
    expect(entries).toHaveLength(1);
    expect(JSON.parse(entries[0].payloadJson).data).toMatchObject({ blocker: "FIELD_CRYPTO_UNAVAILABLE", field: "session.note" });
    expect(selectCertification(Store.getState(), closed)).toMatchObject({ blocked: true, certifiable: false });
  });

  test("#11 sin llavero y sin escritura sensible (sin nota ni rastro) → sin bloqueo", async () => {
    KeyStore.__setFailure(new Error("keystore caído"));
    const { s } = await workday();
    time.travel(8 * HOUR);
    const closed = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 0 });
    expect(closed.bookkeeping.certificationBlockers).toBeUndefined();
    expect(await blockerEntries(s.id)).toHaveLength(0);
  });

  test("rastro degradado (recordSpatialFact) → bloqueo en la jornada", async () => {
    const { s, siteA } = await workday();
    KeyStore.__setFailure(new Error("keystore caído"));
    FieldCryptoService.__forgetCache();
    await SessionEngineService.recordSpatialFact({ ...makeBreadcrumb({ sessionId: s.id, timestampMs: time.now() }), siteId: siteA });
    const after = (await PersistenceService.getSession(s.id))!;
    expect(after.bookkeeping.certificationBlockers).toEqual(["FIELD_CRYPTO_UNAVAILABLE"]);
    expect(after.integrityClass).not.toBe("CONFLICT");
    expect(JSON.parse((await blockerEntries(s.id))[0].payloadJson).data.field).toBe("spatial.coords");
    // Una segunda escritura degradada no duplica el bloqueo ni el asiento.
    await SessionEngineService.recordSpatialFact({ ...makeBreadcrumb({ sessionId: s.id, timestampMs: time.now() + 1 }), siteId: siteA });
    expect(await blockerEntries(s.id)).toHaveLength(1);
  });

  test("#11 nota en sesión cerrada rechazada con FIELD_CRYPTO_UNAVAILABLE (las 5 intenciones)", async () => {
    const { s } = await workday();
    time.travel(8 * HOUR);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 0 });
    KeyStore.__setFailure(new Error("keystore caído"));
    FieldCryptoService.__forgetCache();
    const intents: SessionIntent[] = [
      { type: "ADD_NOTE", sessionId: s.id, note: "n" },
      { type: "MANUAL_PATCH", sessionId: s.id, declaredStartAtMs: MONDAY_8AM, endAtMs: MONDAY_8AM + 7 * HOUR, note: "n" },
      { type: "RESOLVE_KEEP_GPS", sessionId: s.id, note: "n" },
      { type: "RESOLVE_MANUAL", sessionId: s.id, note: "n" },
      { type: "RESOLVE_SPLIT", sessionId: s.id, splitAtMs: MONDAY_8AM + 4 * HOUR, note: "n" },
    ];
    for (const intent of intents) {
      expect(await SessionEngineService.dispatch(intent, "UI")).toMatchObject({ ok: false, code: "FIELD_CRYPTO_UNAVAILABLE" });
    }
  });

  test("no regresión de la vía de deriva: CLOCK_DRIFT sigue escalando a CONFLICT; FIELD_CRYPTO_UNAVAILABLE no", async () => {
    KeyStore.__setFailure(new Error("keystore caído"));
    const { s } = await workday("n");
    expect((await PersistenceService.getSession(s.id))!.integrityClass).not.toBe("CONFLICT");
    const drift = await mustDispatch({ type: "INTEGRITY_DEGRADE", cause: "CLOCK_DRIFT" });
    expect(drift.integrityClass).toBe("CONFLICT");
  });

  test("rollup.blockedCount y seal → PERIOD_NOT_CERTIFIABLE (solo no certificado con allowUncertified)", async () => {
    const blocked = makeClosedSession(MONDAY_8AM, 8, { id: 1, bookkeeping: { certificationBlockers: ["FIELD_CRYPTO_UNAVAILABLE"] } });
    const clean = makeClosedSession(MONDAY_8AM + 24 * HOUR, 8, { id: 2 });
    expect(rollupIntegrity([blocked, clean])).toMatchObject({ blockedCount: 1, hasConflict: false, certified: false });
    expect(rollupIntegrity([clean])).not.toHaveProperty("blockedCount");

    KeyStore.__setFailure(new Error("keystore caído"));
    await workday("n");
    time.travel(8 * HOUR);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 0 });
    const period = { periodStart: getWeekStart(MONDAY_8AM), periodEnd: getWeekEnd(MONDAY_8AM) };
    expect(await EvidencePackService.seal(period)).toMatchObject({ ok: false, code: "PERIOD_NOT_CERTIFIABLE" });
    const r = await EvidencePackService.seal({ ...period, allowUncertified: true });
    expect(r.ok && r.data.manifest.certified).toBe(false);
  });

  test("permanencia: el bloqueo sigue tras volver a READY y cifrar el texto plano con el barrido", async () => {
    KeyStore.__setFailure(new Error("keystore caído"));
    const { s } = await workday("n");
    KeyStore.__setFailure(null);
    FieldCryptoService.__forgetCache();
    await bootFieldCrypto();
    expect(FieldCryptoService.status()).toBe("READY");
    await sweepPlaintext();
    time.travel(8 * HOUR);
    const closed = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 0 });
    expect(closed.bookkeeping.certificationBlockers).toEqual(["FIELD_CRYPTO_UNAVAILABLE"]);
    const db = await PersistenceService.init();
    expect((await db.getFirstAsync<{ n: string }>(`SELECT manual_note_sealed AS n FROM sessions WHERE id = ?`, [s.id]))!.n).toMatch(/^enc:v1:/);
  });

  test("RESOLVE_SPLIT copia los bloqueos a ambas mitades", async () => {
    KeyStore.__setFailure(new Error("keystore caído"));
    const { s } = await workday("n");
    time.travel(8 * HOUR);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 0 });
    KeyStore.__setFailure(null);
    FieldCryptoService.__forgetCache();
    await mustDispatch({ type: "RESOLVE_SPLIT", sessionId: s.id, splitAtMs: MONDAY_8AM + 4 * HOUR, note: "dos turnos" });
    const all = await PersistenceService.listSessions();
    expect(all).toHaveLength(2);
    for (const x of all) expect(x.bookkeeping.certificationBlockers).toEqual(["FIELD_CRYPTO_UNAVAILABLE"]);
  });
});
