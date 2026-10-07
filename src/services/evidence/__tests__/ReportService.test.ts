/** T3 — ReportService: recibe un PayrollStatement cerrado y no calcula OT. */
import * as MailComposer from "expo-mail-composer";
import * as Sharing from "expo-sharing";
import { makeEvidence, makeStatement } from "../../../../test/fixtures/payroll.fixture";
import { COMPANY, HOUR, makeClosedSession, makeSegment, MONDAY_8AM } from "../../../../test/fixtures/session.fixture";
import { setLanguage } from "../../../i18n";
import { DEFAULT_PROFILE } from "../../persistence/SettingsService";
import { ReportService } from "../ReportService";

const input = (st = makeStatement({ regularHours: 8, overtimeHours: 1 })) => ({
  statement: { ...st, packHash: "f".repeat(64) },
  evidence: makeEvidence(),
  manifest: { packId: "W2026-09-21-abcdef12", packHash: "f".repeat(64), sealedAtMs: MONDAY_8AM, certified: true, policyId: st.policyId },
  sessions: [makeClosedSession(MONDAY_8AM, 9)],
  sites: [],
  profile: DEFAULT_PROFILE,
  company: COMPANY,
});

describe("ReportService", () => {
  test("el HTML refleja las horas del statement tal cual (no recalcula OT)", () => {
    // Statement deliberadamente "imposible" para la política: si el servicio
    // recalculara, 9 h darían 8+1; aquí debe imprimir 3 h OT tal como llegan.
    const html = ReportService.renderHtml("EMPLOYEE_RECEIPT", input(makeStatement({ regularHours: 6, overtimeHours: 3 })));
    expect(html).toContain("f".repeat(12));
    expect(html).toContain('<div class="stat-num">6.00</div><div class="stat-desc">Regulares</div>');
    expect(html).toContain('<div class="stat-num">3.00</div><div class="stat-desc">Horas extra</div>');
    expect(ReportService.renderHtml("EMPLOYER_DOSSIER", input())).toContain("W2026-09-21-abcdef12");
  });

  test("el HTML sellado no cambia con el idioma de la UI y sigue en español", () => {
    setLanguage("es");
    const esHtml = ReportService.renderHtml("EMPLOYER_DOSSIER", input());
    const esReceipt = ReportService.renderHtml("EMPLOYEE_RECEIPT", input());
    setLanguage("en");
    expect(ReportService.renderHtml("EMPLOYER_DOSSIER", input())).toBe(esHtml);
    expect(ReportService.renderHtml("EMPLOYEE_RECEIPT", input())).toBe(esReceipt);
    expect(esHtml).toContain("Expediente del empleador");
    expect(esHtml).toContain("Regulares");
    expect(esReceipt).toContain("Comprobante del empleado");
    expect(esHtml).not.toContain("Employer dossier");
    setLanguage("es");
  });

  test("renderPdf devuelve un nombre de archivo seguro con el packId", async () => {
    const r = await ReportService.renderPdf("EMPLOYER_DOSSIER", input());
    expect(r.name).toMatch(/^DualTracker_Expediente_W2026-09-21-abcdef12\.pdf$/);
    expect(r.uri).toContain("/packs/");
  });

  test("un día con dos destinos lista la cadena y no solo el último sitio", () => {
    const session = makeClosedSession(MONDAY_8AM, 8, {
      siteId: 2,
      transitSegments: [makeSegment({ fromSiteId: 1, toSiteId: 2, startAtMs: MONDAY_8AM + 2 * HOUR, endAtMs: MONDAY_8AM + 3 * HOUR })],
    });
    const html = ReportService.renderHtml("EMPLOYEE_RECEIPT", {
      ...input(),
      sessions: [session],
      sites: [
        { id: 1, alias: "Obra Norte", address: "1", clientName: null, notes: null, targetLat: 1, targetLon: 1, radiusM: 100, active: true, createdAtMs: 0, archivedAtMs: null },
        { id: 2, alias: "Obra Sur", address: "2", clientName: null, notes: null, targetLat: 2, targetLon: 2, radiusM: 100, active: true, createdAtMs: 0, archivedAtMs: null },
      ],
    });
    expect(html).toContain("Obra Norte → Obra Sur");
    expect(html).not.toContain(">Obra Sur<");
  });

  test("share y email degradan con elegancia cuando no hay destino", async () => {
    jest.spyOn(Sharing, "isAvailableAsync").mockResolvedValue(false);
    expect(await ReportService.share("file:///x.pdf")).toBe(false);
    jest.spyOn(MailComposer, "isAvailableAsync").mockResolvedValue(false);
    expect(await ReportService.email([], "a@b.c", "Byron", "W1")).toBe(false);
  });
});
