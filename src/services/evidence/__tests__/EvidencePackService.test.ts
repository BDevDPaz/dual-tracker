/** T3 — EvidencePack: packHash estable, packId distinto por pack, PDFs vía Print mock. */
import * as Print from "expo-print";
import * as MailComposer from "expo-mail-composer";
import * as Sharing from "expo-sharing";
import { getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { PersistenceService } from "../../persistence/PersistenceService";
import { EvidencePackService } from "../EvidencePackService";
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
  test("un pack nuevo tiene packId distinto; el statement sellado es idéntico (statementHash estable)", async () => {
    const p = await closedWeek();
    const a = await seal(p);
    time.travel(60_000);
    const b = await seal(p);
    expect(b.id).not.toBe(a.id);
    expect(a.id).toMatch(/^W\d{4}-\d{2}-\d{2}-[0-9a-f]{8}$|^[\w-]+-[0-9a-f]{8}$/);
    expect(b.manifest.statementHash).toBe(a.manifest.statementHash);
    expect(b.statement.lines).toEqual(a.statement.lines);
  });

  /**
   * TODO(ambigüedad de propuesta): la Propuesta de calidad §4.3/§9 exige
   * "mismo statement dos veces = mismo packHash", pero el contrato actual
   * (PackManifest.packHash = "SHA-256 del manifiesto canónico", Propuesta
   * Técnica) incluye packId + sealedAtMs + evidenceHash, y el propio sello
   * añade un asiento PAYROLL_SEALED que cambia la cabeza del ledger. Las dos
   * reglas ("packId distinto" y "packHash igual") solo conviven si packHash
   * pasa a ser un hash de contenido (statementHash + evidencia de sesiones,
   * sin packId/sealedAtMs/asientos de sello) y el hash del evento de sello se
   * separa. Es una decisión de negocio/auditoría (qué compara cada parte), no
   * un bug evidente: se deja marcado como failing hasta que Byron decida.
   */
  test.failing("[obligatorio #10] mismo statement sellado dos veces = mismo packHash", async () => {
    const p = await closedWeek();
    const a = await seal(p);
    time.travel(60_000);
    const b = await seal(p);
    expect(b.manifest.packHash).toBe(a.manifest.packHash);
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
