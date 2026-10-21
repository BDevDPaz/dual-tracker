/**
 * C6 (spec FieldCryptoService v1.3 §14, §15, §17 "Pérdida de clave").
 * Restauración simulada: la base (con crypto.kids = [k1]) se conserva y el
 * llavero llega vacío (los slots son THIS_DEVICE_ONLY).
 */
import * as SecureStore from "expo-secure-store";
import type { EvidencePack, SessionRecord, SpatialFact } from "../../../core/contracts";
import { PACK_MANIFEST_VERSION } from "../../../core/contracts";
import { Store } from "../../../core/store";
import { getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { refreshFieldCryptoHealth } from "../../application/useCases/fieldCryptoHealth";
import { previewPayroll } from "../../application/useCases/generateWeeklyPayroll";
import { EvidencePackService } from "../../evidence/EvidencePackService";
import { __resetPackSignatureForTests } from "../../evidence/packSignature";
import { fingerprintFromB64url } from "../../runtime/keyFingerprint";
import { renderEmployeeReceipt, renderEmployerDossier, SEAL_WARNING_TEXT } from "../../evidence/reportTemplates";
import { TraceRecorderService } from "../../evidence/TraceRecorderService";
import { runIntegritySweep } from "../../runtime/tasks/integritySweep.task";
import { FieldCryptoService } from "../FieldCryptoService";
import { PersistenceService } from "../PersistenceService";
import { bootFieldCrypto } from "../cryptoMigrations";
import { DEFAULT_COMPANY_POLICY, DEFAULT_PROFILE } from "../SettingsService";
import { HOUR, MONDAY_8AM } from "../../../../test/fixtures/session.fixture";
import { makeBreadcrumb, makeEnter } from "../../../../test/fixtures/spatial.fixture";
import { mustDispatch, seedWorld } from "../../../../test/helpers";
import { time } from "../../../../test/time";

const WEEK = 7 * 24 * HOUR;
const secure = SecureStore as unknown as { store: Map<string, string> };

/** Jornada completa por el motor: nota + ENTER + miga, cerrada tras 8 h. */
async function workDay(startMs: number, siteId: number, note: string): Promise<SessionRecord> {
  time.set(startMs);
  const s = await mustDispatch({ type: "START_DAY", siteId, note });
  await mustDispatch({ type: "ARRIVAL_CONFIRMED", fact: makeEnter({ sessionId: s.id, siteId, timestampMs: time.now() }) }, "GEOFENCE");
  time.travel(HOUR);
  await PersistenceService.insertSpatialFact({ ...makeBreadcrumb({ sessionId: s.id, timestampMs: time.now() }), siteId });
  time.travel(7 * HOUR);
  return mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 0 });
}

/** "Restaurar en otro equipo": mismo SQLite, llavero vacío, proceso nuevo. */
async function restoreWithoutKey(): Promise<void> {
  secure.store.clear();
  FieldCryptoService.__forgetCache();
  __resetPackSignatureForTests();
  await bootFieldCrypto();
}

const week = (ms: number) => ({ periodStart: getWeekStart(ms), periodEnd: getWeekEnd(ms) });

describe("C6 — pérdida de clave (§14)", () => {
  test("KEY_MISSING, k2 activo, slot k1 nunca escrito; cerradas conservan clase; statement idéntico; resello reutiliza; pack nuevo v3 con sealWarnings", async () => {
    const { siteA } = await seedWorld();
    const w1 = await workDay(MONDAY_8AM, siteA, "nota semana 1");
    const w2 = await workDay(MONDAY_8AM + WEEK, siteA, "nota semana 2");
    const p1 = week(MONDAY_8AM);
    const p2 = week(MONDAY_8AM + WEEK);
    time.set(MONDAY_8AM + 2 * WEEK);
    const sealed = await EvidencePackService.seal(p1);
    if (!sealed.ok) throw new Error(String(sealed.code));
    expect(sealed.data.manifest.manifestVersion).toBe(PACK_MANIFEST_VERSION);
    expect(sealed.data.manifest.sealWarnings).toEqual([]);
    const before1 = await previewPayroll(p1.periodStart, p1.periodEnd);
    const before2 = await previewPayroll(p2.periodStart, p2.periodEnd);
    const classesBefore = (await PersistenceService.listSessions({})).map((s) => [s.id, s.integrityClass]);

    await restoreWithoutKey();
    expect(FieldCryptoService.status()).toBe("KEY_MISSING");
    expect(FieldCryptoService.lostKids()).toEqual(["k1"]);
    expect(FieldCryptoService.activeKid()).toBe("k2");
    expect(secure.store.has("dt.mk.k1")).toBe(false);
    expect(secure.store.has("dt.mk.k2")).toBe(true);

    // Store.health.fieldCrypto: sesiones afectadas.
    const health = await refreshFieldCryptoHealth();
    expect(health.affectedSessionIds).toEqual([w1.id, w2.id]);
    expect(Store.getState().health.fieldCrypto.status).toBe("KEY_MISSING");

    // Hidratación: nota → null + ["note"]; hechos → lat/lon null + unreadable.
    const r1 = (await PersistenceService.getSession(w1.id))!;
    expect(r1.bookkeeping.manualNote).toBeNull();
    expect(r1.bookkeeping.unreadableFields).toContain("note");
    const facts = await PersistenceService.listSpatialFacts(w1.id);
    expect(facts.length).toBeGreaterThan(0);
    expect(facts.every((f) => f.lat === null && f.lon === null && f.unreadable)).toBe(true);
    const site = (await PersistenceService.getSite(siteA))!;
    expect(site.unreadableFields).toEqual(expect.arrayContaining(["alias", "address", "coords"]));
    expect(site.targetLat).toBeNull();

    // Cerradas: clase sin cambios; statement idéntico.
    expect((await PersistenceService.listSessions({})).map((s) => [s.id, s.integrityClass])).toEqual(classesBefore);
    expect(await previewPayroll(p1.periodStart, p1.periodEnd)).toEqual(before1);
    expect(await previewPayroll(p2.periodStart, p2.periodEnd)).toEqual(before2);

    // Sin la clave del llavero la firma sigue cuadrando, pero no identifica al teléfono.
    const fingerprint = fingerprintFromB64url(sealed.data.manifest.signature!.publicKey)!;
    const bare = await EvidencePackService.verify(sealed.data);
    expect(bare.valid).toBe(false);
    expect(bare.identity).toBe("unverified");
    expect(bare.identityNote?.es).toBe("firma válida pero identidad no verificada");
    expect((await EvidencePackService.verify(sealed.data, { fingerprint })).valid).toBe(true);
    // Resello → reutiliza (mismo contentHash).
    const again = await EvidencePackService.seal(p1);
    if (!again.ok) throw new Error(String(again.code));
    expect(again.reused).toBe(true);
    expect(again.data.id).toBe(sealed.data.id);

    // Periodo sin pack → pack nuevo certificado con sealWarnings.
    const fresh = await EvidencePackService.seal(p2);
    if (!fresh.ok) throw new Error(String(fresh.code));
    expect(fresh.reused).toBe(false);
    expect(fresh.data.manifest.certified).toBe(true);
    expect(fresh.data.manifest.sealWarnings).toEqual([{ code: "FIELD_CRYPTO_KEY_LOST", sessionIds: [w2.id] }]);
    expect((await EvidencePackService.verify(fresh.data)).valid).toBe(true);

    // Nada se reescribió con otra clave: los sobres k1 siguen ahí; lo nuevo usa k2.
    const db = await PersistenceService.init();
    const notes = await db.getAllAsync<{ n: string }>(`SELECT manual_note_sealed AS n FROM sessions ORDER BY id`);
    expect(notes.every((r) => r.n.startsWith("enc:v1:k1:"))).toBe(true);
    const w3 = await workDay(MONDAY_8AM + 2 * WEEK + HOUR, siteA, "nota nueva");
    const row3 = await db.getFirstAsync<{ n: string }>(`SELECT manual_note_sealed AS n FROM sessions WHERE id = ?`, [w3.id]);
    expect(row3!.n).toMatch(/^enc:v1:k2:session\.note:/);
    expect((await PersistenceService.getSession(w3.id))!.bookkeeping.manualNote).toBe("nota nueva");
    expect(secure.store.has("dt.mk.k1")).toBe(false);

    // integritySweep conserva el estado y refresca la salud.
    await runIntegritySweep(true);
    expect(FieldCryptoService.status()).toBe("KEY_MISSING");
    expect(Store.getState().health.fieldCrypto.affectedSessionIds).toEqual([w1.id, w2.id]);
  });

  test("sealWarnings entra en packHash y no en contentHash; verify acepta v1, v2 y v3", async () => {
    const { siteA } = await seedWorld();
    await workDay(MONDAY_8AM, siteA, "nota");
    time.set(MONDAY_8AM + WEEK);
    const r = await EvidencePackService.seal(week(MONDAY_8AM));
    if (!r.ok) throw new Error(String(r.code));
    const v3 = r.data;
    expect((await EvidencePackService.verify(v3)).valid).toBe(true);
    // Manipular sealWarnings rompe packHash, no contentHash.
    const tampered: EvidencePack = { ...v3, manifest: { ...v3.manifest, sealWarnings: [{ code: "FIELD_CRYPTO_KEY_LOST", sessionIds: [1] }] } };
    expect((await EvidencePackService.verify(tampered)).failures.sort()).toEqual(["PACK_HASH", "SIGNATURE"]);
    // v2 y v1 (legado) con sus propios packHash: se reconstruyen con el formato antiguo.
    const { createHash } = jest.requireActual<typeof import("crypto")>("crypto");
    const canon = (v: unknown): string =>
      Array.isArray(v) ? `[${v.map(canon).join(",")}]` : v && typeof v === "object"
        ? `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(",")}}`
        : JSON.stringify(v);
    const m = v3.manifest;
    const base = { packId: m.packId, periodStart: m.periodStart, periodEnd: m.periodEnd, sealedAtMs: m.sealedAtMs, policyId: m.policyId, sessionIds: m.sessionIds, statementHash: m.statementHash, evidenceHash: m.evidenceHash, certified: m.certified };
    const sha = (o: unknown) => createHash("sha256").update(canon(o)).digest("hex");
    const v2Hash = sha({ ...base, manifestVersion: 2, contentHash: m.contentHash });
    const { sealWarnings: _w, ...m2 } = m;
    const v2: EvidencePack = { ...v3, manifest: { ...m2, manifestVersion: 2, packHash: v2Hash }, statement: { ...v3.statement, packHash: v2Hash } };
    const v1Hash = sha(base);
    const { contentHash: _c, manifestVersion: _v, ...m1 } = m2;
    const v1: EvidencePack = { ...v3, manifest: { ...m1, packHash: v1Hash }, statement: { ...v3.statement, packHash: v1Hash } };
    // statementHash se calcula con packHash: null, así que sigue valiendo.
    const r2 = await EvidencePackService.verify(v2);
    const r1 = await EvidencePackService.verify(v1);
    expect(r2).toEqual({ valid: true, legacy: false, scheme: "unsigned-v1", failures: [], identity: "unsigned", identityNote: null });
    expect(r1).toEqual({ valid: true, legacy: true, scheme: "unsigned-v1", failures: [], identity: "unsigned", identityNote: null });
  });

  test("la jornada ABIERTA afectada pasa a CONFLICT con FIELD_CRYPTO_KEY_LOST (idempotente)", async () => {
    const { siteA } = await seedWorld();
    time.set(MONDAY_8AM);
    const s = await mustDispatch({ type: "START_DAY", siteId: siteA, note: "abierta con nota" });
    await restoreWithoutKey();
    await refreshFieldCryptoHealth();
    const after = (await PersistenceService.getSession(s.id))!;
    expect(after.integrityClass).toBe("CONFLICT");
    expect(after.bookkeeping.integrityReason).toBe("FIELD_CRYPTO_KEY_LOST");
    // Idempotente: una segunda pasada no vuelve a despachar.
    await refreshFieldCryptoHealth();
    expect((await PersistenceService.getSession(s.id))!.integrityClass).toBe("CONFLICT");
  });

  test("jornada abierta sin nota ni rastro de k1 → sin degradar", async () => {
    const { siteA } = await seedWorld();
    time.set(MONDAY_8AM);
    const s = await mustDispatch({ type: "START_DAY", siteId: siteA });
    await restoreWithoutKey();
    await refreshFieldCryptoHealth();
    expect((await PersistenceService.getSession(s.id))!.integrityClass).not.toBe("CONFLICT");
  });

  test("guarda: TraceRecorderService.summarize no lee lat/lon", async () => {
    const touched: string[] = [];
    const trap = (f: SpatialFact): SpatialFact => {
      const o = { ...f } as Record<string, unknown>;
      for (const k of ["lat", "lon"]) {
        delete o[k];
        Object.defineProperty(o, k, { enumerable: true, get: () => (touched.push(k), null) });
      }
      return o as unknown as SpatialFact;
    };
    const facts = [makeEnter({ sessionId: 1, timestampMs: MONDAY_8AM }), makeBreadcrumb({ sessionId: 1, timestampMs: MONDAY_8AM + HOUR }), makeBreadcrumb({ sessionId: 1, timestampMs: MONDAY_8AM + 2 * HOUR })].map(trap);
    const spy = jest.spyOn(PersistenceService, "listSpatialFacts").mockResolvedValue(facts);
    const summary = await TraceRecorderService.summarize({ id: 1 } as SessionRecord);
    spy.mockRestore();
    expect(summary.pointCount).toBe(2);
    expect(touched).toEqual([]);
  });

  test("PDF: la advertencia del sello aparece solo con sealWarnings (microcopy exacta)", async () => {
    const { siteA } = await seedWorld();
    await workDay(MONDAY_8AM, siteA, "nota");
    time.set(MONDAY_8AM + WEEK);
    const r = await EvidencePackService.seal(week(MONDAY_8AM));
    if (!r.ok) throw new Error(String(r.code));
    const input = { statement: r.data.statement, evidence: r.data.evidence, manifest: r.data.manifest, sessions: [], sites: [], profile: DEFAULT_PROFILE, company: DEFAULT_COMPANY_POLICY };
    expect(renderEmployeeReceipt(input)).not.toContain(SEAL_WARNING_TEXT);
    const warned = { ...input, manifest: { ...input.manifest, sealWarnings: [{ code: "FIELD_CRYPTO_KEY_LOST" as const, sessionIds: [7] }] } };
    expect(renderEmployeeReceipt(warned)).toContain(SEAL_WARNING_TEXT);
    expect(renderEmployerDossier(warned)).toContain(SEAL_WARNING_TEXT);
    expect(SEAL_WARNING_TEXT).toBe(
      "Advertencia: en el dispositivo que emitió este expediente, las notas y ubicaciones de algunas jornadas no eran legibles. Las horas y la integridad no se ven afectadas.",
    );
  });
});
