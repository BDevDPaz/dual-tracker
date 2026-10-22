/**
 * Fase 2 de la auditoría 21 oct 2026: antes/después en cada ajuste, sello
 * forense de la jornada, expurgo atómico y salud operacional.
 * La nómina y la clase de integridad no cambian por estas señales.
 */
import * as Battery from "expo-battery";
import * as Notifications from "expo-notifications";
import * as Print from "expo-print";
import { Platform } from "react-native";
import { blockingIntegrityReason, foregroundLocationHealth } from "../../../core/healthPolicy";
import { INITIAL_HEALTH } from "../../../core/store/initialState";
import { t } from "../../../i18n";
import { getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { COMPANY, HOUR, MIN, makeSession, MONDAY_8AM } from "../../../../test/fixtures/session.fixture";
import { makeBreadcrumb, makeEnter } from "../../../../test/fixtures/spatial.fixture";
import { mustDispatch, seedSite, seedWorld, startAndArrive } from "../../../../test/helpers";
import { LocationMock } from "../../../../test/runtimeHarness";
import { time } from "../../../../test/time";
import { EvidencePackService, contentOf } from "../../evidence/EvidencePackService";
import { ReportService } from "../../evidence/ReportService";
import { sessionEventHash } from "../../evidence/HashChain";
import { TraceRecorderService } from "../../evidence/TraceRecorderService";
import { IntegrityLedgerService } from "../IntegrityLedgerService";
import { PayrollEngineService } from "../PayrollEngineService";
import { makeEvidence, makeStatement } from "../../../../test/fixtures/payroll.fixture";
import { PersistenceService } from "../../persistence/PersistenceService";
import { locationAccuracyOf, PermissionsHealthService } from "../../runtime/PermissionsHealthService";

const NOTE_A = "primera corrección de campo";
const NOTE_B = "segunda corrección de campo";

function dataOf(payloadJson: string): {
  before?: { declaredStartAtMs: number; actualStartAtMs: number | null; endAtMs: number | null };
  after?: { declaredStartAtMs: number; actualStartAtMs: number | null; endAtMs: number | null };
  sessionHash?: string;
  eventCount?: number;
  permission?: string;
  severity?: string;
  ledgerPayloadVersion?: number;
} {
  return JSON.parse(payloadJson).data;
}

describe("fase 2 · 21 oct 2026", () => {
  test("cada MANUAL_PATCH guarda el antes y el después; la versión intermedia no depende del original", async () => {
    time.set(MONDAY_8AM);
    const { siteA } = await seedWorld();
    const open = await startAndArrive(siteA, 0);
    time.travel(8 * HOUR);
    const closed = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 0 });
    const original = {
      declaredStartAtMs: closed.declaredStartAtMs,
      actualStartAtMs: closed.actualStartAtMs,
      endAtMs: closed.endAtMs,
    };
    const midStart = original.declaredStartAtMs + 60_000;
    const midEnd = original.endAtMs! - 60_000;
    time.travel(MIN);
    const first = await mustDispatch({
      type: "MANUAL_PATCH",
      sessionId: closed.id,
      declaredStartAtMs: midStart,
      endAtMs: midEnd,
      note: NOTE_A,
    });
    const laterStart = midStart + 60_000;
    time.travel(MIN);
    const second = await mustDispatch({
      type: "MANUAL_PATCH",
      sessionId: closed.id,
      declaredStartAtMs: laterStart,
      endAtMs: midEnd,
      note: NOTE_B,
    });
    const patches = (await PersistenceService.listLedger({ intent: "MANUAL_PATCH" })).filter((e) => e.sessionId === closed.id);
    expect(patches).toHaveLength(2);
    const a = dataOf(patches[0].payloadJson);
    const b = dataOf(patches[1].payloadJson);
    expect(a.before).toEqual(original);
    expect(a.after).toEqual({ declaredStartAtMs: midStart, actualStartAtMs: midStart, endAtMs: midEnd });
    expect(b.before).toEqual(a.after);
    expect(b.after).toEqual({ declaredStartAtMs: laterStart, actualStartAtMs: laterStart, endAtMs: midEnd });
    expect(patches[0].actor).toBe("USER");
    expect(patches[1].actor).toBe("USER");
    expect(patches[1].timestampMs).toBe(time.now());
    expect(patches[1].reason).toBe("MANUAL_PATCH_WITH_NOTE");
    expect(patches[0].payloadJson).not.toContain(NOTE_A);
    expect(patches[1].payloadJson).not.toContain(NOTE_B);
    expect(a.ledgerPayloadVersion).toBe(2);
    expect(first.bookkeeping.original).toMatchObject(original);
    expect(second.bookkeeping.original).toMatchObject(original);
    expect(second.declaredStartAtMs).toBe(laterStart);
    expect((await IntegrityLedgerService.verify()).valid).toBe(true);
    expect(open.id).toBe(closed.id);
  });

  test("al cerrar queda SESSION_SEALED y el expediente lo verifica y lo muestra", async () => {
    time.set(MONDAY_8AM);
    const { siteA } = await seedWorld();
    await startAndArrive(siteA, 0);
    time.travel(8 * HOUR);
    const closed = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 0 });
    const rows = await IntegrityLedgerService.listForSession(closed.id);
    const seal = rows.find((e) => e.intent === "SESSION_SEALED");
    expect(seal).toMatchObject({ actor: "SYSTEM", reason: "SESSION_SEALED", toState: "CERRADA" });
    const prior = rows.filter((e) => e.id < seal!.id).map((e) => e.hash);
    const sessionHash = dataOf(seal!.payloadJson).sessionHash!;
    expect(sessionHash).toBe(await sessionEventHash(prior));
    expect(dataOf(seal!.payloadJson).eventCount).toBe(prior.length);
    expect(rows[rows.length - 1].intent).toBe("SESSION_SEALED");

    const period = { periodStart: getWeekStart(closed.actualStartAtMs!), periodEnd: getWeekEnd(closed.actualStartAtMs!) };
    const packed = await EvidencePackService.seal(period);
    if (!packed.ok) throw new Error(packed.code);
    expect(packed.data.evidence.sessionSeals).toEqual([{ sessionId: closed.id, sessionHash, entryId: seal!.id }]);
    expect(await EvidencePackService.verify(packed.data)).toMatchObject({ valid: true, failures: [] });
    const html = (Print as unknown as { __printed: string[] }).__printed.join("\n");
    expect(html).toContain(sessionHash);
    expect(html).toContain(t("comprobante.forensicTitle", {}, "es"));
    expect(html).toContain('data-session-seals="1"');

    const english = ReportService.renderHtml("EMPLOYER_DOSSIER", {
      statement: packed.data.statement,
      evidence: packed.data.evidence,
      manifest: { ...packed.data.manifest, documentLocale: "en" },
      sessions: [closed],
      sites: [],
      profile: { employeeName: "Ada" } as never,
      company: COMPANY,
    });
    expect(english).toContain(t("comprobante.forensicTitle", {}, "en"));
    expect(english).toContain(sessionHash);

    const tampered = {
      ...packed.data,
      evidence: {
        ...packed.data.evidence,
        sessionSeals: [{ sessionId: closed.id, sessionHash: "ab".repeat(32), entryId: seal!.id }],
      },
    };
    expect((await EvidencePackService.verify(tampered)).failures).toContain("SESSION_HASH");

    const legacy = contentOf(makeStatement(), makeEvidence());
    expect(JSON.stringify(legacy)).not.toContain("sessionSeals");
  });

  test("el expurgo y TRACE_PURGED son una transacción; fuera de ella no se borra", async () => {
    await PersistenceService.init();
    await seedSite();
    await PersistenceService.insertSession(makeSession({ domainStatus: "CERRADA", endAtMs: MONDAY_8AM }));
    const old = Date.parse("2026-01-01T00:00:00Z");
    await PersistenceService.insertSpatialFact(makeEnter({ timestampMs: old }));
    await PersistenceService.insertSpatialFact(makeBreadcrumb({ timestampMs: old }));
    const periodEnd = old + 1000;
    await PersistenceService.insertPack({
      id: "pack-old",
      manifest: {
        manifestVersion: 5,
        packId: "pack-old",
        periodStart: old - 1000,
        periodEnd,
        sealedAtMs: periodEnd,
        policyId: "CA_DAILY8_WEEKLY40_v2",
        sessionIds: [1],
        statementHash: "s",
        evidenceHash: "e",
        contentHash: "c",
        packHash: "p",
        certified: true,
        sealWarnings: [],
        files: [],
      },
      statement: {} as never,
      evidence: {} as never,
      employeePdfUri: null,
      employerPdfUri: null,
      manifestUri: null,
      createdAtMs: periodEnd,
    });
    const spy = jest.spyOn(IntegrityLedgerService, "append").mockRejectedValueOnce(new Error("boom"));
    await expect(TraceRecorderService.purgeExpired(30)).rejects.toThrow("boom");
    expect((await PersistenceService.listSpatialFacts(1)).map((f) => f.type)).toEqual(["ENTER", "BREADCRUMB"]);
    expect(await PersistenceService.listLedger({ intent: "TRACE_PURGED" })).toHaveLength(0);
    spy.mockRestore();

    expect(await TraceRecorderService.purgeExpired(30)).toBe(1);
    expect((await PersistenceService.listSpatialFacts(1)).map((f) => f.type)).toEqual(["ENTER"]);
    const purged = await PersistenceService.listLedger({ intent: "TRACE_PURGED" });
    expect(purged).toHaveLength(1);
    expect(dataOf(purged[0].payloadJson)).toMatchObject({ deleted: 1, retentionDays: 30 });
    expect((await IntegrityLedgerService.verify()).valid).toBe(true);
    await expect(PersistenceService.deleteSpatialFactsByIds([1])).rejects.toThrow("UNLOGGED_PURGE_FORBIDDEN");
  });

  test("los cambios operacionales se asientan una vez y la ubicación aproximada no baja el pago", async () => {
    await PersistenceService.init();
    const before = (await PersistenceService.listLedger()).length;
    await PermissionsHealthService.refresh();
    const first = await PersistenceService.listLedger();
    expect(first.length).toBeGreaterThan(before);
    expect(first.map((e) => e.intent)).toEqual(["PERMISSION_GRANTED", "PERMISSION_GRANTED", "PERMISSION_GRANTED", "GPS_ENABLED"]);
    expect(first.map((e) => dataOf(e.payloadJson).permission)).toEqual(["location", "background", "notifications", undefined]);
    await PermissionsHealthService.refresh();
    expect(await PersistenceService.listLedger()).toHaveLength(first.length);

    (Notifications as unknown as { __setPermission: (s: "denied") => void }).__setPermission("denied");
    await PermissionsHealthService.refresh();
    const afterNotice = await PersistenceService.listLedger();
    expect(afterNotice.slice(first.length).map((e) => e.intent)).toEqual(["PERMISSION_REVOKED", "NOTIFICATION_DISABLED"]);
    expect(dataOf(afterNotice[first.length].payloadJson).permission).toBe("notifications");
    await PermissionsHealthService.refresh();
    expect(await PersistenceService.listLedger()).toHaveLength(afterNotice.length);

    LocationMock.__state.servicesEnabled = false;
    await PermissionsHealthService.refresh();
    const gps = (await PersistenceService.listLedger()).filter((e) => e.intent === "GPS_DISABLED");
    expect(gps).toHaveLength(1);
    expect(dataOf(gps[0].payloadJson).severity).toBe("HIGH");
    LocationMock.__state.servicesEnabled = true;
    await PermissionsHealthService.refresh();
    expect((await PersistenceService.listLedger()).filter((e) => e.intent === "GPS_ENABLED")).toHaveLength(2);

    const originalOs = Platform.OS;
    Object.defineProperty(Platform, "OS", { configurable: true, get: () => "android" });
    try {
      (LocationMock as unknown as { __setAndroidAccuracy: (a: "coarse" | "fine" | null) => void }).__setAndroidAccuracy("coarse");
      (Battery as unknown as { __state: { optimizationEnabled: boolean } }).__state.optimizationEnabled = true;
      const coarse = await PermissionsHealthService.refresh();
      expect(coarse.locationForeground).toBe("granted");
      expect(coarse.locationAccuracy).toBe("coarse");
      expect(locationAccuracyOf("android", { status: "granted", android: { accuracy: "coarse" } })).toBe("coarse");
      expect(locationAccuracyOf("ios", { status: "granted", android: { accuracy: "coarse" } })).toBe("n/a");
      expect(blockingIntegrityReason({ ...coarse, foregroundService: "running" }, true)).toBeNull();
      expect(foregroundLocationHealth(coarse)).toEqual({ ok: false, blocksValid: false, approximate: true });
      expect(t("health.approximateWarning", {}, "es")).toContain("no cambia");
      expect(t("health.approximateWarning", {}, "en")).toContain("does not change");
      expect(t("health.approximateValue", {}, "es")).toContain("no concedida del todo");
      const precise = (await PersistenceService.listLedger()).filter((e) => e.reason === "PERMISSION_REVOKED_precise");
      expect(precise).toHaveLength(1);
      expect(dataOf(precise[0].payloadJson)).toMatchObject({ permission: "precise", severity: "HIGH" });
      const battery = (await PersistenceService.listLedger()).filter((e) => e.intent === "BATTERY_OPTIMIZATION_ENABLED");
      expect(battery).toHaveLength(1);
      await PermissionsHealthService.refresh();
      expect((await PersistenceService.listLedger()).filter((e) => e.intent === "BATTERY_OPTIMIZATION_ENABLED")).toHaveLength(1);

      (LocationMock as unknown as { __setAndroidAccuracy: (a: "fine" | null) => void }).__setAndroidAccuracy("fine");
      (Battery as unknown as { __state: { optimizationEnabled: boolean } }).__state.optimizationEnabled = false;
      const fine = await PermissionsHealthService.refresh();
      expect(fine.locationAccuracy).toBe("fine");
      expect(foregroundLocationHealth(fine).ok).toBe(true);
      expect((await PersistenceService.listLedger()).some((e) => e.reason === "PERMISSION_GRANTED_precise")).toBe(true);
      expect((await PersistenceService.listLedger()).some((e) => e.intent === "BATTERY_OPTIMIZATION_DISABLED")).toBe(true);
    } finally {
      Object.defineProperty(Platform, "OS", { configurable: true, get: () => originalOs });
      (LocationMock as unknown as { __setAndroidAccuracy: (a: null) => void }).__setAndroidAccuracy(null);
    }

    time.set(MONDAY_8AM);
    const { siteA } = await seedWorld();
    const session = await startAndArrive(siteA, 0);
    time.travel(8 * HOUR);
    const closed = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 0 });
    const paid = (sessions: typeof closed[]) =>
      PayrollEngineService.buildStatement({
        periodStart: getWeekStart(closed.actualStartAtMs!),
        periodEnd: getWeekEnd(closed.actualStartAtMs!),
        sessions,
        rates: { hourlyRate: 25, overtimeMultiplier: 1.5 },
        company: COMPANY,
        policyId: COMPANY.overtimePolicyId,
        nowMs: time.now(),
      });
    const gross = paid([closed]).grossEstimate;
    Object.defineProperty(Platform, "OS", { configurable: true, get: () => "android" });
    try {
      (LocationMock as unknown as { __setAndroidAccuracy: (a: "coarse" | null) => void }).__setAndroidAccuracy("coarse");
      const health = await PermissionsHealthService.refresh();
      expect(health.locationAccuracy).toBe("coarse");
      expect(blockingIntegrityReason({ ...INITIAL_HEALTH, ...health, foregroundService: "running" }, false)).toBeNull();
      const reloaded = (await PersistenceService.getSession(session.id))!;
      expect(reloaded.integrityClass).toBe(closed.integrityClass);
      expect(reloaded.endAtMs).toBe(closed.endAtMs);
      expect(paid([reloaded]).grossEstimate).toBe(gross);
      expect(paid([reloaded]).lines).toEqual(paid([closed]).lines);
    } finally {
      Object.defineProperty(Platform, "OS", { configurable: true, get: () => originalOs });
      (LocationMock as unknown as { __setAndroidAccuracy: (a: null) => void }).__setAndroidAccuracy(null);
    }
  });
});
