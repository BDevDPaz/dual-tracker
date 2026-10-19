/** T3 — ReportService: recibe un PayrollStatement cerrado y no calcula OT. */
import * as MailComposer from "expo-mail-composer";
import * as Sharing from "expo-sharing";
import type { Site } from "../../../core/contracts";
import { makeEvidence, makeStatement } from "../../../../test/fixtures/payroll.fixture";
import { COMPANY, HOUR, makeClosedSession, makeSegment, MONDAY_8AM } from "../../../../test/fixtures/session.fixture";
import { fromWallClock, getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { setLanguage } from "../../../i18n";
import { PayrollEngineService } from "../../domain/PayrollEngineService";
import { CA_DAILY8_WEEKLY40_V2 } from "../../domain/payrollPolicies";
import { DEFAULT_PROFILE } from "../../persistence/SettingsService";
import { ReportService } from "../ReportService";

function site(o: Partial<Site> & Pick<Site, "id" | "alias" | "address">): Site {
  return {
    clientName: null,
    notes: null,
    targetLat: 1,
    targetLon: 1,
    radiusM: 100,
    active: true,
    createdAtMs: 0,
    archivedAtMs: null,
    ...o,
  };
}

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
    expect(html).toContain("Obra Norte");
    expect(html).toContain("Obra Sur");
    expect(html).toContain("→");
    expect(html).not.toContain(">Obra Sur<");
  });

  test("v2: cada semana muestra solo su tramo y de dónde continúa", () => {
    const start = fromWallClock(2026, 10, 18, 19, 50);
    const end = fromWallClock(2026, 10, 19, 0, 25);
    const session = makeClosedSession(start, 0, {
      id: 9,
      endAtMs: end,
      bookkeeping: { manualNote: "  Not Sure  " },
    });
    const company = { ...COMPANY, overtimePolicyId: CA_DAILY8_WEEKLY40_V2.id };
    const rates = { hourlyRate: 35, overtimeMultiplier: 1.5 };
    const build = (ts: number) =>
      PayrollEngineService.buildStatement({
        periodStart: getWeekStart(ts),
        periodEnd: getWeekEnd(ts),
        sessions: [session],
        rates,
        company,
        policyId: CA_DAILY8_WEEKLY40_V2.id,
        nowMs: end,
      });
    const paint = (ts: number, kind: "EMPLOYEE_RECEIPT" | "EMPLOYER_DOSSIER") => {
      const st = build(ts);
      return ReportService.renderHtml(kind, {
        ...input(st),
        sessions: [session],
        company,
        sites: [site({ id: 1, alias: "Tarzana", address: "Tarzana" })],
      });
    };
    const week1 = paint(start, "EMPLOYEE_RECEIPT");
    const week2 = paint(end, "EMPLOYEE_RECEIPT");
    expect(week1).toContain("07:50 PM - 12:00 AM");
    expect(week1).toContain("continúa el lun, 19 oct 2026");
    expect(week1).toContain("<strong>4.17</strong>");
    expect(week1).toContain("250 min");
    expect(week1).toContain("$145.83");
    expect(week1).not.toContain("12:25 AM");
    expect(week1).toContain('"Not Sure"');
    expect(week1).not.toContain('"  Not Sure');
    expect(week2).toContain("lun, 19 oct 2026");
    expect(week2).toContain("12:00 AM - 12:25 AM");
    expect(week2).toContain("continúa de dom, 18 oct 2026");
    expect(week2).toContain("<strong>0.42</strong>");
    expect(week2).toContain("25 min");
    expect(week2).toContain("$14.58");
    expect(week2).not.toContain("07:50 PM");
    const employer = paint(end, "EMPLOYER_DOSSIER");
    expect(employer).toContain("12:00 AM - 12:25 AM");
    expect(employer).toContain("continúa de dom, 18 oct 2026");
    expect(employer).toContain("2026-10-19");
  });

  test("nota con bandera: el emoji no baja de línea y no quedan espacios dentro de las comillas", () => {
    const session = makeClosedSession(MONDAY_8AM, 0, {
      endAtMs: MONDAY_8AM + 60_000,
      bookkeeping: { manualNote: "Desde El Salvador 🇸🇻   " },
    });
    const html = ReportService.renderHtml("EMPLOYEE_RECEIPT", { ...input(), sessions: [session] });
    expect(html).toContain('"Desde El Salvador\u2060 \u2060<span class="grapheme">🇸🇻</span>"');
    expect(html).not.toContain("🇸🇻   ");
    expect(html).not.toContain("\n🇸🇻");
  });

  test("duración cero se conserva en el comprobante, con nota y sin pago", () => {
    const t0 = fromWallClock(2026, 10, 18, 4, 45);
    const session = makeClosedSession(t0, 0, { endAtMs: t0, integrityClass: "AUTO" });
    const html = ReportService.renderHtml("EMPLOYEE_RECEIPT", {
      ...input(makeStatement({ regularHours: 0 })),
      sessions: [session],
    });
    expect(html).toContain("04:45 AM - 04:45 AM");
    expect(html).toContain("Duración cero: no suma al pago. Conservada para auditoría.");
    expect(html).toContain("Cierre automático");
    expect(html).toContain("$0.00");
  });

  test("sin alias se ve la dirección; si el alias no es la dirección, se ven las dos", () => {
    const bare = ReportService.renderHtml("EMPLOYEE_RECEIPT", {
      ...input(),
      sites: [site({ id: 1, alias: "", address: "604 W Huntington Dr" })],
    });
    expect(bare).toContain("604 W Huntington Dr");
    expect(bare).not.toContain('class="addr"');
    const both = ReportService.renderHtml("EMPLOYEE_RECEIPT", {
      ...input(),
      sites: [site({ id: 1, alias: "Apt.", address: "18144 Burbank Blvd" })],
    });
    expect(both).toContain("Apt.");
    expect(both).toContain("18144 Burbank Blvd");
  });

  test("share y email degradan con elegancia cuando no hay destino", async () => {
    jest.spyOn(Sharing, "isAvailableAsync").mockResolvedValue(false);
    expect(await ReportService.share("file:///x.pdf")).toBe(false);
    jest.spyOn(MailComposer, "isAvailableAsync").mockResolvedValue(false);
    expect(await ReportService.email([], "a@b.c", "Byron", "W1")).toBe(false);
  });
});
