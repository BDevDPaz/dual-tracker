/**
 * Reportes · RR-1 / RR-2 (wireframes de Reportes, §11 RT-1 y RT-2).
 *  - RT-1: tras sellar y editar una jornada, «Exportar expediente» (EXPORT_PACK)
 *    y «Enviar por correo» (SHARE_EMPLOYER con ensureFresh) vuelven a sellar;
 *    nunca comparten el pack desactualizado.
 *  - RT-2: un pack sin PDF en este teléfono (copia restaurada) tiene salida: la
 *    reemisión regenera los PDF y compartir no se queda en «no encontrado».
 */
import * as MailComposer from "expo-mail-composer";
import * as Sharing from "expo-sharing";
import type { EvidencePack } from "../../../core/contracts";
import { Store } from "../../../core/store";
import { getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { EvidencePackService } from "../../evidence/EvidencePackService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { routeIntent } from "../intentRouter";
import { HOUR, MIN } from "../../../../test/fixtures/session.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../test/helpers";
import { time } from "../../../../test/time";

const mail = MailComposer as unknown as { __sent: unknown[] };
const sharing = Sharing as unknown as { __shared: string[] };

beforeEach(() => {
  mail.__sent.length = 0;
  sharing.__shared.length = 0;
});

async function closedWeekWithPack() {
  const { siteA } = await seedWorld();
  const s = await startAndArrive(siteA);
  time.travel(8 * HOUR);
  const closed = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 0 });
  const periodStart = getWeekStart(time.now());
  const periodEnd = getWeekEnd(time.now());
  const sealed = await routeIntent({ type: "SEAL_PACK", periodStart, periodEnd });
  if (!sealed.ok) throw new Error(`sello fallido: ${sealed.code}`);
  return { session: closed, sessionId: s.id, periodStart, periodEnd, pack: sealed.data as EvidencePack };
}

/** Edita la jornada: cambia el contenido del periodo y deja el pack desactualizado. */
async function editSession(sessionId: number, declaredStartAtMs: number, endAtMs: number | null) {
  // El reloj de los tests está congelado: sin avanzar, el pack nuevo empataría en createdAtMs con el viejo.
  time.travel(MIN);
  await mustDispatch({ type: "MANUAL_PATCH", sessionId, declaredStartAtMs: declaredStartAtMs + 5 * MIN, endAtMs, note: "Ajuste de entrada" });
}

/** Lo que deja una restauración en otro teléfono: los PDF no viajan (appBackup.ts, withLocalArtifacts). */
async function dropPdfs(packId: string) {
  const db = await PersistenceService.init();
  await db.runAsync("UPDATE evidence_packs SET employee_pdf_uri = NULL, employer_pdf_uri = NULL WHERE id = ?", [packId]);
  time.travel(MIN);
}

describe("RT-1 · pack desactualizado (RR-1)", () => {
  test("EXPORT_PACK tras editar una jornada vuelve a sellar y comparte el pack nuevo, no el viejo", async () => {
    const { session, sessionId, periodStart, periodEnd, pack: old } = await closedWeekWithPack();
    await editSession(sessionId, session.declaredStartAtMs, session.endAtMs);
    expect((await EvidencePackService.describeFreshness(periodStart, periodEnd)).matches).toBe(false);
    const share = jest.spyOn(EvidencePackService, "shareEmployee");

    const r = await routeIntent({ type: "EXPORT_PACK", periodStart, periodEnd });

    expect(r.ok).toBe(true);
    const fresh = (r.ok ? r.data : null) as EvidencePack | null;
    expect(fresh?.id).toBeDefined();
    expect(fresh!.id).not.toBe(old.id);
    expect(fresh!.manifest.contentHash).not.toBe(old.manifest.contentHash);
    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith(fresh!.id);
    expect(sharing.__shared).toEqual([fresh!.employeePdfUri]);
    expect(sharing.__shared).not.toContain(old.employeePdfUri);
    expect((await PersistenceService.listPacks()).length).toBe(2);
    expect((await EvidencePackService.describeFreshness(periodStart, periodEnd)).matches).toBe(true);
    expect(Store.getState().feedback.pending.at(-1)?.code).toBe("PACK_SEALED");
  });

  test("«Enviar por correo» (SHARE_EMPLOYER ensureFresh) tras editar envía el pack nuevo", async () => {
    const { session, sessionId, periodStart, periodEnd, pack: old } = await closedWeekWithPack();
    await editSession(sessionId, session.declaredStartAtMs, session.endAtMs);
    const send = jest.spyOn(EvidencePackService, "shareEmployer");

    const r = await routeIntent({ type: "SHARE_EMPLOYER", packId: old.id, ensureFresh: true });

    expect(r.ok).toBe(true);
    const fresh = (r.ok ? r.data : null) as EvidencePack | null;
    expect(fresh!.id).not.toBe(old.id);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe(fresh!.id);
    expect(mail.__sent.length).toBe(1);
    expect(JSON.stringify(mail.__sent[0])).not.toContain(String(old.employerPdfUri));
    expect((await EvidencePackService.describeFreshness(periodStart, periodEnd)).matches).toBe(true);
  });

  test("con el pack al día no se vuelve a sellar: se comparte el mismo pack", async () => {
    const { periodStart, periodEnd, pack } = await closedWeekWithPack();
    const seal = jest.spyOn(EvidencePackService, "seal");

    const exported = await routeIntent({ type: "EXPORT_PACK", periodStart, periodEnd });
    const sent = await routeIntent({ type: "SHARE_EMPLOYER", packId: pack.id, ensureFresh: true });

    expect(exported.ok && (exported.data as EvidencePack).id).toBe(pack.id);
    expect(sent.ok && (sent.data as EvidencePack).id).toBe(pack.id);
    expect(seal).not.toHaveBeenCalled();
    expect(sharing.__shared).toEqual([pack.employeePdfUri]);
    expect(mail.__sent.length).toBe(1);
    expect((await PersistenceService.listPacks()).length).toBe(1);
  });

  test("si el periodo ya no se puede sellar, se informa el motivo y no se comparte el pack viejo", async () => {
    const { sessionId, periodStart, periodEnd } = await closedWeekWithPack();
    await mustDispatch({ type: "DELETE_SESSION", sessionId });

    const r = await routeIntent({ type: "EXPORT_PACK", periodStart, periodEnd });

    expect(r.ok).toBe(false);
    expect(sharing.__shared).toEqual([]);
    expect((await PersistenceService.listPacks()).length).toBe(1);
  });
});

describe("RT-2 · pack sin PDF tras restaurar en otro teléfono (RR-2)", () => {
  test("compartir un pack sin PDF da PACK_PDF_MISSING (no «no encontrado») y la reemisión regenera los PDF", async () => {
    const { periodStart, periodEnd, pack } = await closedWeekWithPack();
    await dropPdfs(pack.id);

    expect(await EvidencePackService.shareEmployee(pack.id)).toEqual({ ok: false, code: "PACK_PDF_MISSING" });
    expect(await EvidencePackService.shareEmployer(pack.id)).toEqual({ ok: false, code: "PACK_PDF_MISSING" });
    expect(await EvidencePackService.shareEmployee("nope")).toEqual({ ok: false, code: "PACK_NOT_FOUND" });

    // Volver a sellar sin reemisión devuelve el mismo pack, todavía sin PDF (por eso hace falta «Volver a emitir»).
    const resealed = await routeIntent({ type: "SEAL_PACK", periodStart, periodEnd });
    expect(resealed.ok && (resealed.data as EvidencePack).id).toBe(pack.id);
    expect(resealed.ok && (resealed.data as EvidencePack).employeePdfUri).toBeNull();

    // «Volver a emitir» = SEAL_PACK con reissue (lo que emiten Reportes y el expediente).
    const reissued = await routeIntent({ type: "SEAL_PACK", periodStart, periodEnd, allowUncertified: !pack.manifest.certified, reissue: true });
    expect(reissued.ok).toBe(true);
    const next = (reissued.ok ? reissued.data : null) as EvidencePack;
    expect(next.id).not.toBe(pack.id);
    expect(next.employeePdfUri).toBeTruthy();
    expect(next.employerPdfUri).toBeTruthy();
    expect(next.manifest.contentHash).toBe(pack.manifest.contentHash);
    const entry = (await PersistenceService.listLedger()).filter((e) => e.intent === "PAYROLL_SEALED").at(-1)!;
    expect(entry.reason).toBe("PACK_REISSUED");
    expect(JSON.parse(entry.payloadJson).data).toMatchObject({ packId: next.id, reissueOf: pack.id });

    expect((await routeIntent({ type: "SHARE_EMPLOYEE", packId: next.id })).ok).toBe(true);
    expect(sharing.__shared).toEqual([next.employeePdfUri]);
  });

  test("«Exportar expediente» y «Enviar por correo» con el pack sin PDF lo reemiten y comparten, sin error sin salida", async () => {
    const { periodStart, periodEnd, pack } = await closedWeekWithPack();
    await dropPdfs(pack.id);

    const exported = await routeIntent({ type: "EXPORT_PACK", periodStart, periodEnd });
    expect(exported.ok).toBe(true);
    const reissued = (exported.ok ? exported.data : null) as EvidencePack;
    expect(reissued.id).not.toBe(pack.id);
    expect(sharing.__shared).toEqual([reissued.employeePdfUri]);

    // El pack reemitido ya tiene PDF: «Enviar por correo» lo usa sin otro sello.
    const seal = jest.spyOn(EvidencePackService, "seal");
    const sent = await routeIntent({ type: "SHARE_EMPLOYER", packId: pack.id, ensureFresh: true });
    expect(sent.ok && (sent.data as EvidencePack).id).toBe(reissued.id);
    expect(seal).not.toHaveBeenCalled();
    expect(mail.__sent.length).toBe(1);
  });
});
