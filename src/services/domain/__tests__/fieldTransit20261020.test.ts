/**
 * Jornada real del 20 oct 2026 (expediente W2026-10-19-3ccdb038).
 * 11:51:12–14:18:14 PT, $25/h. El tránsito pagado era 10 min; el trayecto
 * fiable es 5. El segundo traslado se canceló a las 14:18.
 */
import { DEFAULT_PROFILE } from "../../persistence/SettingsService";
import { COMPANY, makeSession } from "../../../../test/fixtures/session.fixture";
import { getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { ReportService } from "../../evidence/ReportService";
import { PayrollEngineService } from "../PayrollEngineService";
import { CA_DAILY8_WEEKLY40_V2 } from "../payrollPolicies";
import { siteMinutesFromSession } from "../siteMinutes";
import { exportSessionTransits } from "../transitExport";

const START = 1792522272826;
const TRANSIT_START = 1792526661172;
const TRANSIT_END = 1792526974145;
const CANCEL_START = 1792529637024;
const END = 1792531094456;

const company = {
  ...COMPANY,
  overtimePolicyId: CA_DAILY8_WEEKLY40_V2.id,
  transitPaid: true,
  transitRateMultiplier: 1,
  transitCountsTowardOvertime: true,
};

function fieldSession() {
  return makeSession({
    id: 2,
    siteId: 3,
    declaredStartAtMs: START,
    actualStartAtMs: START,
    endAtMs: END,
    domainStatus: "CERRADA",
    policyId: CA_DAILY8_WEEKLY40_V2.id,
    transitSegments: [
      {
        id: "llegada",
        fromSiteId: 2,
        toSiteId: 3,
        startAtMs: TRANSIT_START,
        endAtMs: TRANSIT_END,
        cancelled: false,
        paid: true,
        rateMultiplier: 1,
        countsTowardOvertime: true,
      },
      {
        id: "vuelta",
        fromSiteId: 3,
        toSiteId: 4,
        startAtMs: CANCEL_START,
        endAtMs: END,
        cancelled: true,
        paid: true,
        rateMultiplier: 1,
        countsTowardOvertime: false,
        cancelNote: "llamó el encargado",
      },
    ],
    bookkeeping: { dateString: "2026-10-20", recordedTimeZone: "America/Los_Angeles" },
  });
}

describe("jornada de campo 20 oct 2026", () => {
  test("5 min de tránsito, 24 de cancelado, 73 y 44 por sitio; el anexo los lista", () => {
    const session = fieldSession();
    const statement = PayrollEngineService.buildStatement({
      segmentedLedgerTimestamps: [],
      periodStart: getWeekStart(START),
      periodEnd: getWeekEnd(START),
      sessions: [session],
      rates: { hourlyRate: 25, overtimeMultiplier: 1.5 },
      company,
      policyId: CA_DAILY8_WEEKLY40_V2.id,
      nowMs: END,
    });
    const regular = statement.lines.find((l) => l.kind === "REGULAR");
    const transit = statement.lines.filter((l) => l.kind === "TRANSIT");
    expect(regular?.minutes).toBe(118);
    expect(transit.map((l) => l.minutes)).toEqual([5, 24]);
    expect(transit[0].rate).toBe(25);
    expect(transit[1].rate).toBe(25);
    expect(transit[1].transitCancel).toEqual({ endAtMs: END, note: "llamó el encargado" });
    expect(transit[0].transitCancel).toBeUndefined();
    expect(siteMinutesFromSession(session, END)).toEqual([
      { siteId: 2, minutes: 73 },
      { siteId: 3, minutes: 44 },
    ]);

    const html = ReportService.renderHtml("EMPLOYER_DOSSIER", {
      statement: { ...statement, packHash: "ab".repeat(32) },
      evidence: {
        ledgerEntryCount: 1,
        ledgerHeadHash: "cd".repeat(32),
        ledgerChainValid: true,
        ledgerHashes: [{ id: 8, sessionId: 2, hash: "ee".repeat(32), prevHash: "ff".repeat(32), payloadJson: "{}" }],
        traces: [],
        conflicts: [],
        transitSegments: exportSessionTransits(session, company),
      },
      manifest: {
        packId: "W2026-10-19-3ccdb038",
        packHash: "ab".repeat(32),
        sealedAtMs: END,
        certified: true,
        policyId: CA_DAILY8_WEEKLY40_V2.id,
        manifestVersion: 5,
        documentVersion: 3,
        documentLocale: "es",
        documentTheme: "light",
        appVersion: "1.0.0",
        versionCode: 3,
        gitCommit: "2801b5b0",
        sessionTimeZones: [{ sessionId: 2, timeZone: "America/Los_Angeles" }],
      },
      sessions: [session],
      sites: [],
      profile: { ...DEFAULT_PROFILE, employeeName: "Byron" },
      company,
    });
    expect(html).toContain('data-annex="transit"');
    expect(html).toContain('data-document-version="3"');
    expect(html).toContain("Tránsito (cancelado)");
    expect(html).toContain("llamó el encargado");
    expect(html).toContain("App 1.0.0");
    expect(html).toContain("2801b5b");
    expect(html).toContain("America/Los_Angeles");
    const employee = ReportService.renderHtml("EMPLOYEE_RECEIPT", {
      statement: { ...statement, packHash: "ab".repeat(32) },
      evidence: {
        ledgerEntryCount: 0,
        ledgerHeadHash: "cd".repeat(32),
        ledgerChainValid: true,
        ledgerHashes: [],
        traces: [],
        conflicts: [],
        transitSegments: exportSessionTransits(session, company),
      },
      manifest: {
        packId: "W2026-10-19-3ccdb038",
        packHash: "ab".repeat(32),
        sealedAtMs: END,
        certified: true,
        policyId: CA_DAILY8_WEEKLY40_V2.id,
        manifestVersion: 5,
        documentVersion: 3,
        documentLocale: "es",
        documentTheme: "light",
      },
      sessions: [session],
      sites: [],
      profile: DEFAULT_PROFILE,
      company,
    });
    expect(employee).toContain('data-annex="transit"');
  });
});
