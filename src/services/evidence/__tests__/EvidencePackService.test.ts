/** T3 — EvidencePack: contentHash estable entre sellos, packHash por sello, idempotencia, verificación (v2 y legado). */
import * as Print from "expo-print";
import * as MailComposer from "expo-mail-composer";
import * as Sharing from "expo-sharing";
import { getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { PersistenceService } from "../../persistence/PersistenceService";
import { PACK_MANIFEST_VERSION } from "../../../core/contracts";
import { Store } from "../../../core/store";
import { MICROCOPY } from "../../../i18n/microcopy";
import { canonicalJson } from "../../../utils/canonicalJson";
import { routeIntent } from "../../application/intentRouter";
import { EvidencePackService, computeContentHash } from "../EvidencePackService";
import { sha256Hex } from "../HashChain";
import { HOUR } from "../../../../test/fixtures/session.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../test/helpers";
import { time } from "../../../../test/time";

async function closedWeek() {
  const { siteA } = await seedWorld();
  await startAndArrive(siteA);
  time.travel(9 * HOUR);
  await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 60 });
  return { periodStart: getWeekStart(time.now()), periodEnd: getWeekEnd(time.now()) };
}
async function seal(p: { periodStart: number; periodEnd: number }) {
  const r = await EvidencePackService.seal(p);
  if (!r.ok || !r.data) throw new Error(`seal: ${r.ok ? "sin datos" : r.code}`);
  return r.data;
}

describe("EvidencePackService", () => {
  /**
   * Diseño: dos packs distintos con contenido idéntico solo existen por
   * REEMISIÓN explícita (`reissue: true`): sin ella el sello es idempotente.
   */
  test("[obligatorio #10] mismo statement sellado dos veces = mismo contentHash; packHash distinto; ambos verifican", async () => {
    const p = await closedWeek();
    const a = await seal(p);
    time.travel(60_000);
    const r = await EvidencePackService.seal({ ...p, reissue: true });
    if (!r.ok) throw new Error(r.code);
    const b = r.data;
    expect(r.reused).toBe(false);
    expect(b.id).not.toBe(a.id);
    expect(b.manifest.sealedAtMs).not.toBe(a.manifest.sealedAtMs);
    expect(b.manifest.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(b.manifest.contentHash).toBe(a.manifest.contentHash);
    expect(b.manifest.statementHash).toBe(a.manifest.statementHash);
    expect(b.manifest.packHash).not.toBe(a.manifest.packHash);
    expect(b.manifest.manifestVersion).toBe(PACK_MANIFEST_VERSION);
    // La cabeza del ledger cambió entre sellos (asiento de sello) y no afecta al contenido.
    expect(b.evidence.ledgerHeadHash).not.toBe(a.evidence.ledgerHeadHash);
    for (const pack of [a, b, (await EvidencePackService.get(a.id))!, (await EvidencePackService.get(b.id))!]) {
      expect(await EvidencePackService.verify(pack)).toEqual({ valid: true, legacy: false, failures: [] });
    }
    const reasons = (await PersistenceService.listLedger()).filter((e) => e.intent === "PAYROLL_SEALED").map((e) => e.reason);
    expect(reasons).toEqual(["PACK_SEALED", "PACK_REISSUED"]);
  });

  test("contentHash no depende de packId, hora de sello, cabeza del ledger ni asientos de sello", async () => {
    const pack = await seal(await closedWeek());
    const volatile = {
      ...pack.evidence,
      ledgerHeadHash: "f".repeat(64),
      ledgerChainValid: false,
      ledgerHashes: [...pack.evidence.ledgerHashes, { id: 999, sessionId: null, hash: "a".repeat(64) }],
    };
    expect(await computeContentHash({ ...pack.statement, packHash: "otro" }, volatile)).toBe(pack.manifest.contentHash);
  });

  test("idempotencia: segundo sello con el mismo contenido reutiliza el pack (sin packId ni asiento nuevos)", async () => {
    const p = await closedWeek();
    const a = await seal(p);
    const ledgerBefore = (await PersistenceService.listLedger()).length;
    time.travel(5 * 60_000);
    const r = await EvidencePackService.seal(p);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.reused).toBe(true);
    expect(r.data.id).toBe(a.id);
    expect(r.data.manifest.packHash).toBe(a.manifest.packHash);
    expect((await PersistenceService.listLedger()).length).toBe(ledgerBefore);
    expect(await EvidencePackService.list()).toHaveLength(1);
    expect((Print as unknown as { __printed: string[] }).__printed).toHaveLength(2); // no se regeneran PDFs
  });

  test("idempotencia vía router: feedback PACK_REUSED con microcopy en español", async () => {
    const p = await closedWeek();
    await routeIntent({ type: "SEAL_PACK", ...p });
    const r = await routeIntent({ type: "SEAL_PACK", ...p });
    expect(r.ok).toBe(true);
    expect(Store.getState().feedback.pending.at(-1)?.code).toBe("PACK_REUSED");
    expect(MICROCOPY.PACK_REUSED.es.message).toContain("El expediente ya estaba sellado con este mismo contenido; se reutilizó.");
  });

  test("cambiar un campo del statement cambia contentHash y rompe la verificación", async () => {
    const pack = await seal(await closedWeek());
    const tampered = { ...pack, statement: { ...pack.statement, regularHours: pack.statement.regularHours + 1 } };
    expect(await computeContentHash(tampered.statement, tampered.evidence)).not.toBe(pack.manifest.contentHash);
    const v = await EvidencePackService.verify(tampered);
    expect(v.valid).toBe(false);
    expect(v.failures).toEqual(expect.arrayContaining(["CONTENT_HASH", "STATEMENT_HASH"]));
    // Reescribir contentHash en el manifiesto no basta: packHash lo cubre.
    const forged = { ...tampered, manifest: { ...tampered.manifest, contentHash: await computeContentHash(tampered.statement, tampered.evidence) } };
    expect((await EvidencePackService.verify(forged)).failures).toContain("PACK_HASH");
  });

  test("pack legado (v1, sin contentHash) sigue verificando y se marca legacy", async () => {
    const pack = await seal(await closedWeek());
    const { contentHash: _c, manifestVersion: _v, ...m } = pack.manifest;
    // Formato de packHash v1 (antes de este cambio): manifiesto canónico sin versión ni contentHash.
    const legacyHash = await sha256Hex(
      canonicalJson({
        packId: m.packId, periodStart: m.periodStart, periodEnd: m.periodEnd, sealedAtMs: m.sealedAtMs, policyId: m.policyId,
        sessionIds: m.sessionIds, statementHash: m.statementHash, evidenceHash: m.evidenceHash, certified: m.certified,
      }),
    );
    const legacy = { ...pack, manifest: { ...m, packHash: legacyHash }, statement: { ...pack.statement, packHash: legacyHash } };
    expect(await EvidencePackService.verify(legacy)).toEqual({ valid: true, legacy: true, failures: [] });
    // A un v2 no se le puede "degradar" a legado quitándole contentHash: su packHash deja de cuadrar.
    expect((await EvidencePackService.verify({ ...pack, manifest: m })).failures).toContain("PACK_HASH");
  });

  test("un pack legado del periodo no se reutiliza: el nuevo sello crea pack v2", async () => {
    const p = await closedWeek();
    const a = await seal(p);
    const db = await PersistenceService.init();
    const { contentHash: _c, manifestVersion: _v, ...m } = a.manifest;
    await db.runAsync(`UPDATE evidence_packs SET manifest_json = ? WHERE id = ?`, [JSON.stringify(m), a.id]);
    time.travel(60_000);
    const r = await EvidencePackService.seal(p);
    expect(r.ok && r.reused).toBe(false);
    expect(r.ok && r.data.id).not.toBe(a.id);
  });

  test("packHash cubre el manifiesto: cambia si cambia el statement", async () => {
    const p = await closedWeek();
    const a = await seal(p);
    await startAndArrive((await PersistenceService.listSites())[0].id);
    time.travel(2 * HOUR);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    const b = await seal(p);
    expect(b.manifest.statementHash).not.toBe(a.manifest.statementHash);
    expect(b.manifest.packHash).not.toBe(a.manifest.packHash);
  });

  test("genera dos PDF por Print (sin recalcular OT en el HTML) y persiste pack + asiento PAYROLL_SEALED", async () => {
    const p = await closedWeek();
    const pack = await seal(p);
    expect((Print as unknown as { __printed: string[] }).__printed).toHaveLength(2);
    expect(pack.employeePdfUri).toMatch(/\.pdf$/);
    expect(pack.manifestUri).toMatch(/\.json$/);
    expect((await EvidencePackService.get(pack.id))?.manifest.packHash).toBe(pack.manifest.packHash);
    expect(await EvidencePackService.list()).toHaveLength(1);
    expect((await EvidencePackService.findForPeriod(p.periodStart, p.periodEnd))?.id).toBe(pack.id);
    expect((await EvidencePackService.sessionsOf(pack)).map((s) => s.id)).toEqual(pack.manifest.sessionIds);
    const sealed = (await PersistenceService.listLedger()).filter((e) => e.intent === "PAYROLL_SEALED");
    expect(sealed).toHaveLength(1);
    expect(sealed[0].payloadJson).toContain(pack.manifest.packHash);
  });

  test("compartir: empleado por Sharing, empleador por correo; pack inexistente → PACK_NOT_FOUND", async () => {
    const pack = await seal(await closedWeek());
    expect(await EvidencePackService.shareEmployee(pack.id)).toEqual({ ok: true });
    expect((Sharing as unknown as { __shared: string[] }).__shared).toEqual([pack.employeePdfUri]);
    expect(await EvidencePackService.shareEmployer(pack.id)).toEqual({ ok: true });
    expect((MailComposer as unknown as { __sent: unknown[] }).__sent).toHaveLength(1);
    expect(await EvidencePackService.shareEmployee("nope")).toEqual({ ok: false, code: "PACK_NOT_FOUND" });
    expect(await EvidencePackService.shareEmployer("nope")).toEqual({ ok: false, code: "PACK_NOT_FOUND" });
  });
});
