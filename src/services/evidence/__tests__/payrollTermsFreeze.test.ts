/**
 * Congelado de términos de nómina en el manifiesto v6 (decisiones de Byron del
 * 2026-11-26): al resellar o reemitir un periodo con pack previo se usan el
 * multiplicador OT y las banderas legales de ese pack; el primer sello guarda
 * los vigentes; las semanas sin sellar usan los vigentes (spec v1.3 §5.2 N3).
 * payrollTerms entra en packHash solo en v6; v1–v5 verifican como antes y se
 * leen con los términos vigentes («términos no congelados»).
 */
import type { EvidencePack, PackManifest, PayrollStatement, PayrollTerms } from "../../../core/contracts";
import { PACK_MANIFEST_VERSION } from "../../../core/contracts";
import { Store, StoreActions } from "../../../core/store";
import { selectPackTermsFrozen, selectPeriodTerms } from "../../../core/selectors";
import { canonicalJson } from "../../../utils/canonicalJson";
import { getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { routeIntent } from "../../application/intentRouter";
import { previewPayroll } from "../../application/useCases";
import { termsFromPack } from "../../domain/payrollTerms";
import { PersistenceService } from "../../persistence/PersistenceService";
import { SettingsService } from "../../persistence/SettingsService";
import { SecurityService } from "../../runtime/SecurityService";
import { EvidencePackService, packHashBody } from "../EvidencePackService";
import { sha256Hex } from "../HashChain";
import { signCanonicalBody } from "../packSignature";
import { HOUR, MIN } from "../../../../test/fixtures/session.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../test/helpers";
import { time } from "../../../../test/time";

const ORIGINAL: PayrollTerms = {
  overtimeMultiplier: 1.5,
  payrollLegalFlags: { transitionWeeklyThreshold: "FULL", caDoubleTime: false, caSeventhDay: false },
};
const CHANGED: PayrollTerms = {
  overtimeMultiplier: 2,
  payrollLegalFlags: { transitionWeeklyThreshold: "PRORATED", caDoubleTime: true, caSeventhDay: true },
};

async function loadStore(): Promise<void> {
  StoreActions.settingsReplaced(await SettingsService.load());
}

/** Una jornada de 14 h con 1 h de almuerzo (13 h netas): hay OT diario y, con caDoubleTime, doble tiempo. */
async function longWeek() {
  const { siteA } = await seedWorld();
  await loadStore();
  await startAndArrive(siteA);
  time.travel(14 * HOUR);
  const closed = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 60 });
  return { session: closed, periodStart: getWeekStart(time.now()), periodEnd: getWeekEnd(time.now()) };
}

async function seal(p: { periodStart: number; periodEnd: number }, reissue = false): Promise<{ pack: EvidencePack; reused: boolean }> {
  const r = await EvidencePackService.seal({ ...p, reissue });
  if (!r.ok || !r.data) throw new Error(`seal: ${r.ok ? "sin datos" : r.code}`);
  return { pack: r.data, reused: !!r.reused };
}

let pinSet = false;
beforeEach(() => {
  pinSet = false;
});

/** Ajustes con PIN: multiplicador 2 y las tres banderas cambiadas. */
async function changeTerms(): Promise<void> {
  if (!pinSet) {
    expect((await SecurityService.setPin("123456")).ok).toBe(true);
    pinSet = true;
  }
  expect((await SecurityService.unlock("123456")).ok).toBe(true);
  time.travel(MIN);
  const r = await routeIntent({
    type: "SAVE_SETTINGS",
    patch: { company: { overtimeMultiplier: CHANGED.overtimeMultiplier, payrollLegalFlags: { ...CHANGED.payrollLegalFlags } } },
  });
  expect(r.ok).toBe(true);
  const company = (await SettingsService.load()).company;
  expect(company.overtimeMultiplier).toBe(2);
  expect(company.payrollLegalFlags).toMatchObject(CHANGED.payrollLegalFlags);
}

function otRatio(st: PayrollStatement): number {
  const regular = st.lines.find((l) => l.kind === "REGULAR")!;
  const ot = st.lines.find((l) => l.kind === "OVERTIME_DAILY")!;
  return ot.rate / regular.rate;
}

function hasDouble(st: PayrollStatement): boolean {
  return st.lines.some((l) => l.kind === "OVERTIME_DOUBLE" && l.minutes > 0);
}

/** Rehace un pack como v5 válido (sin payrollTerms), firmado con la clave del teléfono. */
async function asV5(pack: EvidencePack): Promise<EvidencePack> {
  const { payrollTerms: _t, packHash: _h, signature: _s, files, ...rest } = pack.manifest;
  const unsigned = { ...rest, manifestVersion: 5 };
  const body = packHashBody(unsigned);
  const packHash = await sha256Hex(canonicalJson(body));
  const signature = await signCanonicalBody(body, packHash);
  const manifest: PackManifest = { ...unsigned, packHash, files, ...(signature ? { signature } : {}) };
  return { ...pack, manifest, statement: { ...pack.statement, packHash } };
}

async function storeAsV5(pack: EvidencePack): Promise<EvidencePack> {
  const v5 = await asV5(pack);
  const db = await PersistenceService.init();
  await db.runAsync("UPDATE evidence_packs SET manifest_json = ?, statement_json = ?, pack_hash = ? WHERE id = ?", [
    JSON.stringify(v5.manifest),
    JSON.stringify(v5.statement),
    v5.manifest.packHash,
    pack.id,
  ]);
  return v5;
}

describe("congelado de términos · manifiesto v6", () => {
  test("el primer sello guarda los términos vigentes en el manifiesto v6 y dentro de packHash", async () => {
    const p = await longWeek();
    const { pack } = await seal(p);
    expect(PACK_MANIFEST_VERSION).toBe(6);
    expect(pack.manifest.manifestVersion).toBe(6);
    expect(pack.manifest.payrollTerms).toEqual(ORIGINAL);
    expect(packHashBody(pack.manifest).payrollTerms).toEqual(ORIGINAL);
    expect(otRatio(pack.statement)).toBe(1.5);
    expect(hasDouble(pack.statement)).toBe(false);
    // También en la base (lo que leen el resello y la copia de seguridad).
    expect((await PersistenceService.getPack(pack.id))!.manifest.payrollTerms).toEqual(ORIGINAL);
    expect(await EvidencePackService.verify(pack)).toMatchObject({ valid: true, failures: [] });
  });

  test("flujo RR-1: tras cambiar multiplicador y banderas, el pack recién sellado sigue al día y se reutiliza", async () => {
    const p = await longWeek();
    const { pack } = await seal(p);
    await changeTerms();
    const fresh = await EvidencePackService.describeFreshness(p.periodStart, p.periodEnd);
    expect(fresh).toMatchObject({ latestPackId: pack.id, matches: true, liveContentHash: pack.manifest.contentHash });
    // EXPORT_PACK pasa por currentPackFor (RR-1): no vuelve a sellar.
    const exported = await routeIntent({ type: "EXPORT_PACK", periodStart: p.periodStart, periodEnd: p.periodEnd });
    expect(exported.ok).toBe(true);
    expect(exported.ok && (exported.data as EvidencePack).id).toBe(pack.id);
    const again = await seal(p);
    expect(again.reused).toBe(true);
    expect(again.pack.id).toBe(pack.id);
    expect(await PersistenceService.listPacks()).toHaveLength(1);
    // La vista previa del periodo sellado usa los mismos términos.
    const preview = await previewPayroll(p.periodStart, p.periodEnd);
    expect(otRatio(preview)).toBe(1.5);
    expect(hasDouble(preview)).toBe(false);
    expect(selectPeriodTerms(Store.getState(), p.periodStart, p.periodEnd)).toEqual({ terms: ORIGINAL, source: "PACK" });
  });

  test("resellar con contenido nuevo tras cambiar los términos conserva los del pack original", async () => {
    const p = await longWeek();
    const { pack: first } = await seal(p);
    await changeTerms();
    time.travel(MIN);
    await mustDispatch({ type: "MANUAL_PATCH", sessionId: p.session.id, declaredStartAtMs: p.session.declaredStartAtMs + 5 * MIN, endAtMs: p.session.endAtMs, note: "Ajuste" });
    expect((await EvidencePackService.describeFreshness(p.periodStart, p.periodEnd)).matches).toBe(false);
    const { pack: second, reused } = await seal(p);
    expect(reused).toBe(false);
    expect(second.id).not.toBe(first.id);
    expect(second.manifest.payrollTerms).toEqual(ORIGINAL);
    expect(otRatio(second.statement)).toBe(1.5);
    expect(hasDouble(second.statement)).toBe(false);
    // Se propagan: un tercer sello hereda los del segundo (los mismos).
    time.travel(MIN);
    const third = await seal(p, true);
    expect(third.pack.manifest.payrollTerms).toEqual(ORIGINAL);
  });

  test("reemitir tras cambiar los términos crea un pack con los originales y el mismo contenido", async () => {
    const p = await longWeek();
    const { pack: first } = await seal(p);
    await changeTerms();
    time.travel(MIN);
    const { pack: reissued } = await seal(p, true);
    expect(reissued.id).not.toBe(first.id);
    expect(reissued.manifest.payrollTerms).toEqual(ORIGINAL);
    expect(reissued.manifest.contentHash).toBe(first.manifest.contentHash);
    expect(reissued.manifest.statementHash).toBe(first.manifest.statementHash);
    const reasons = (await PersistenceService.listLedger({ intent: "PAYROLL_SEALED" })).map((e) => e.reason);
    expect(reasons).toEqual(["PACK_SEALED", "PACK_REISSUED"]);
  });

  test("una semana sin sellar usa los términos vigentes (SS-1, spec §5.2 N3)", async () => {
    const p = await longWeek();
    await changeTerms();
    expect(selectPeriodTerms(Store.getState(), p.periodStart, p.periodEnd)).toEqual({ terms: CHANGED, source: "CURRENT" });
    const preview = await previewPayroll(p.periodStart, p.periodEnd);
    expect(otRatio(preview)).toBe(2);
    expect(hasDouble(preview)).toBe(true);
    const { pack } = await seal(p);
    expect(pack.manifest.payrollTerms).toEqual(CHANGED);
    expect(otRatio(pack.statement)).toBe(2);
    expect(hasDouble(pack.statement)).toBe(true);
  });
});

describe("congelado de términos · verificación", () => {
  test("un v6 con los términos alterados, quitados o degradado a v5 falla con PACK_HASH", async () => {
    const { pack } = await seal(await longWeek());
    expect(await EvidencePackService.verify(pack)).toMatchObject({ valid: true, failures: [] });
    const altered = (terms: unknown): EvidencePack => ({ ...pack, manifest: { ...pack.manifest, payrollTerms: terms as PayrollTerms } });
    for (const forged of [
      altered({ ...ORIGINAL, overtimeMultiplier: 2 }),
      altered({ ...ORIGINAL, payrollLegalFlags: { ...ORIGINAL.payrollLegalFlags, caDoubleTime: true } }),
      altered({ ...ORIGINAL, payrollLegalFlags: { ...ORIGINAL.payrollLegalFlags, transitionWeeklyThreshold: "PRORATED" } }),
      altered(undefined),
      { ...pack, manifest: { ...pack.manifest, manifestVersion: 5 } },
    ]) {
      const v = await EvidencePackService.verify(forged);
      expect(v.valid).toBe(false);
      expect(v.failures).toContain("PACK_HASH");
    }
  });

  test("v1–v5 conservan su cuerpo de hash y siguen verificando igual que antes", async () => {
    const { pack } = await seal(await longWeek());
    const v5 = await asV5(pack);
    expect(Object.keys(packHashBody(v5.manifest))).not.toContain("payrollTerms");
    expect(Object.keys(packHashBody({ ...v5.manifest, manifestVersion: 3 }))).not.toContain("payrollTerms");
    // Un payrollTerms suelto en un v5 no entra en su hash (v5 no lo conoce).
    expect(packHashBody({ ...v5.manifest, payrollTerms: CHANGED })).toEqual(packHashBody(v5.manifest));
    expect(await EvidencePackService.verify(v5)).toEqual({ valid: true, legacy: false, scheme: "Ed25519", failures: [], identity: "device", identityNote: null });
    expect(selectPackTermsFrozen(v5)).toBe(false);
    expect(selectPackTermsFrozen(pack)).toBe(true);
  });

  test("periodo con pack v5: términos vigentes con UNFROZEN_PACK; el resello nuevo es v6 con los vigentes", async () => {
    const p = await longWeek();
    const { pack } = await seal(p);
    const v5 = await storeAsV5(pack);
    expect(await EvidencePackService.verify((await PersistenceService.getPack(pack.id))!)).toMatchObject({ valid: true, failures: [] });
    await changeTerms();
    const basis = await PersistenceService.packBasisForPeriod(p.periodStart, p.periodEnd);
    expect(termsFromPack(basis, (await SettingsService.load()).company)).toEqual({ terms: CHANGED, source: "UNFROZEN_PACK" });
    StoreActions.packUpserted(v5);
    expect(selectPeriodTerms(Store.getState(), p.periodStart, p.periodEnd).source).toBe("UNFROZEN_PACK");
    // Sin términos en el v5 no hay de dónde congelar: con los vigentes, el pack ya no coincide.
    expect((await EvidencePackService.describeFreshness(p.periodStart, p.periodEnd)).matches).toBe(false);
    time.travel(MIN);
    const { pack: resealed, reused } = await seal(p);
    expect(reused).toBe(false);
    expect(resealed.manifest.manifestVersion).toBe(6);
    expect(resealed.manifest.payrollTerms).toEqual(CHANGED);
    // El v5 queda tal cual en el registro.
    expect((await PersistenceService.getPack(pack.id))!.manifest).toEqual(v5.manifest);
  });
});
