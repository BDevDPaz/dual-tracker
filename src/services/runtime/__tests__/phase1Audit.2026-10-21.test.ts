/**
 * Fase 1 de la auditoría 21 oct 2026: ubicación simulada, salto imposible
 * con el error de los dos fixes, y relanzamiento del servicio.
 * Nada de esto cambia la nómina ni la clase de una llegada hecha a mano.
 */
import * as Notifications from "expo-notifications";
import type { Site, TraceSummary } from "../../../core/contracts";
import { blockingIntegrityReason } from "../../../core/healthPolicy";
import { BREADCRUMB_TASK_NAME, GEOFENCE_TASK_NAME } from "../../../constants/geolocation";
import { t } from "../../../i18n";
import { IntegrityLedgerService } from "../../domain/IntegrityLedgerService";
import { ReportService } from "../../evidence/ReportService";
import { TraceRecorderService } from "../../evidence/TraceRecorderService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { DEFAULT_COMPANY_POLICY, DEFAULT_PROFILE, SettingsService } from "../../persistence/SettingsService";
import { makeEvidence, makeStatement } from "../../../../test/fixtures/payroll.fixture";
import { COMPANY, MIN, makeClosedSession, MONDAY_8AM } from "../../../../test/fixtures/session.fixture";
import { SITE_LAT, SITE_LON, makeEnter } from "../../../../test/fixtures/spatial.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../test/helpers";
import { LocationMock, TaskManagerMock } from "../../../../test/runtimeHarness";
import { time } from "../../../../test/time";
import { GeofenceRuntimeService, geofenceIdentifier } from "../GeofenceRuntimeService";
import { PermissionsHealthService } from "../PermissionsHealthService";
import { TaskOrchestratorService } from "../TaskOrchestratorService";
import { recoverMonitoring } from "../monitoringRecovery";
import { runSessionWatchdog } from "../tasks/sessionWatchdog.task";
import { touchHeartbeat } from "../heartbeat";

const M_PER_DEG = 111_320;
const region = (sessionId: number, siteId: number) => ({
  identifier: geofenceIdentifier(sessionId, siteId),
  latitude: SITE_LAT,
  longitude: SITE_LON,
  radius: 100,
});

function dataOf(payloadJson: string): { success?: boolean; severity?: string; gapSeconds?: number; mocked?: boolean; errorName?: string } {
  return (JSON.parse(payloadJson) as { data?: { success?: boolean; severity?: string; gapSeconds?: number; mocked?: boolean; errorName?: string } }).data ?? {};
}

async function closeOpen(): Promise<void> {
  const open = await PersistenceService.getOpenSession();
  if (!open) return;
  if (open.domainStatus === "ESPERANDO") await mustDispatch({ type: "CANCEL_DAY" });
  else await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
}

function notices(): { title?: string; body?: string }[] {
  const n = Notifications as unknown as { __state: { scheduled: { content?: { title?: string; body?: string } }[] } };
  return n.__state.scheduled.map((item) => item.content ?? {});
}

describe("fase 1 · 21 oct 2026", () => {
  beforeAll(() => TaskOrchestratorService.defineTasks(async () => {}));

  test("una lectura simulada no ficha; el registro a mano sí, y el pago sigue VALID", async () => {
    const { siteA } = await seedWorld();
    const s = await mustDispatch({ type: "START_DAY", siteId: siteA });
    const before = await IntegrityLedgerService.listForSession(s.id);
    expect((await IntegrityLedgerService.verify()).valid).toBe(true);
    LocationMock.__setPosition(SITE_LAT, SITE_LON, 10, 0, { mocked: true });
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: 1, region: region(s.id, siteA) });
    const waiting = (await PersistenceService.getSession(s.id))!;
    expect(waiting.domainStatus).toBe("ESPERANDO");
    expect(waiting.integrityClass).toBe("VALID");
    const [enter] = await PersistenceService.listSpatialFacts(s.id, ["ENTER"]);
    expect(enter).toMatchObject({ reliable: false, reason: "MOCK_LOCATION", mocked: true });
    const spatial = (await IntegrityLedgerService.listForSession(s.id)).find((e) => e.intent === "SPATIAL_FACT")!;
    expect(dataOf(spatial.payloadJson)).toMatchObject({ mocked: true, severity: "HIGH" });
    expect((await IntegrityLedgerService.listForSession(s.id)).some((e) => e.intent === "ARRIVAL_CONFIRMED")).toBe(false);
    expect(notices().some((n) => n.body === "Se detectó ubicación simulada. La llegada automática fue suspendida.")).toBe(true);
    expect(notices().some((n) => n.body === t("notifications.mockLocationBody"))).toBe(true);

    const arrived = await mustDispatch(
      { type: "ARRIVAL_CONFIRMED", fact: makeEnter({ sessionId: s.id, siteId: siteA, timestampMs: time.now() }) },
      "UI",
    );
    expect(arrived.domainStatus).toBe("ACTIVA");
    expect(arrived.integrityClass).toBe("VALID");
    const kept = await IntegrityLedgerService.listForSession(s.id);
    for (const old of before) {
      const again = kept.find((e) => e.id === old.id)!;
      expect(again.hash).toBe(old.hash);
      expect(again.payloadJson).toBe(old.payloadJson);
      expect(again.payloadJson).not.toContain("mocked");
    }
    expect((await IntegrityLedgerService.verify()).valid).toBe(true);
  });

  test("una muestra simulada dentro del sitio no hace check-in ni se guarda como rastro personal en Solo geocerca", async () => {
    const { siteA } = await seedWorld();
    const s = await mustDispatch({ type: "START_DAY", siteId: siteA });
    await GeofenceRuntimeService.observeSample({ lat: SITE_LAT, lon: SITE_LON, accuracyM: 10, timestampMs: time.now(), mocked: true });
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ESPERANDO");

    await SettingsService.saveCompany({ ...DEFAULT_COMPANY_POLICY, traceMode: "BREADCRUMB" });
    await TaskManagerMock.__run(BREADCRUMB_TASK_NAME, {
      locations: [
        {
          coords: { latitude: SITE_LAT, longitude: SITE_LON, accuracy: 8, speed: 0, altitude: 0, heading: 0, altitudeAccuracy: 0 },
          timestamp: time.now(),
          mocked: true,
        },
      ],
    });
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ESPERANDO");
    const drops = await PersistenceService.listSpatialFacts(s.id, ["ACCURACY_DROP"]);
    expect(drops.some((f) => f.mocked === true && f.reason === "MOCK_LOCATION" && f.lat === null)).toBe(true);
    expect(await PersistenceService.listSpatialFacts(s.id, ["BREADCRUMB"])).toHaveLength(0);
  });

  test("en modo rastro la miga simulada se guarda y no ficha", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    await SettingsService.saveCompany({ ...DEFAULT_COMPANY_POLICY, traceMode: "BREADCRUMB" });
    const result = await TraceRecorderService.ingest(
      (await PersistenceService.getSession(s.id))!,
      [
        {
          lat: SITE_LAT,
          lon: SITE_LON,
          accuracyM: 8,
          speedMps: 0,
          altitudeM: null,
          timestampMs: time.now(),
          source: "gps",
          mocked: true,
        },
      ],
      { mode: "BREADCRUMB", radiusM: 100, battery: 0.8 },
    );
    expect(result.stored).toBe(1);
    const [crumb] = await PersistenceService.listSpatialFacts(s.id, ["BREADCRUMB"]);
    expect(crumb).toMatchObject({ mocked: true, reliable: false, reason: "MOCK_LOCATION", lat: SITE_LAT });
    const summary = await TraceRecorderService.summarize((await PersistenceService.getSession(s.id))!);
    expect(summary.mockedFacts).toBeGreaterThan(0);
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ACTIVA");
  });

  test("60 m en 1 s con ±40 m, el mismo instante a 10 m y 300 m en 5 s con holgura sí entran; 120 km en 5 min no", async () => {
    const { siteA } = await seedWorld();
    const near = await mustDispatch({ type: "START_DAY", siteId: siteA });
    await PersistenceService.setLastFix({
      lat: SITE_LAT + 60 / M_PER_DEG,
      lon: SITE_LON,
      timestampMs: time.now() - 1_000,
      accuracyM: 40,
    });
    LocationMock.__setPosition(SITE_LAT, SITE_LON, 40, 0, { timestamp: time.now() });
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: 1, region: region(near.id, siteA) });
    expect((await PersistenceService.getSession(near.id))?.domainStatus).toBe("ACTIVA");
    await closeOpen();

    const same = await mustDispatch({ type: "START_DAY", siteId: siteA });
    const at = time.now();
    await PersistenceService.setLastFix({ lat: SITE_LAT + 10 / M_PER_DEG, lon: SITE_LON, timestampMs: at, accuracyM: 1 });
    LocationMock.__setPosition(SITE_LAT, SITE_LON, 1, 0, { timestamp: at });
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: 1, region: region(same.id, siteA) });
    expect((await PersistenceService.getSession(same.id))?.domainStatus).toBe("ACTIVA");
    await closeOpen();

    const saved = await mustDispatch({ type: "START_DAY", siteId: siteA });
    await PersistenceService.setLastFix({
      lat: SITE_LAT + 300 / M_PER_DEG,
      lon: SITE_LON,
      timestampMs: time.now() - 5_000,
      accuracyM: 40,
    });
    LocationMock.__setPosition(SITE_LAT, SITE_LON, 40, 0, { timestamp: time.now() });
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: 1, region: region(saved.id, siteA) });
    expect((await PersistenceService.getSession(saved.id))?.domainStatus).toBe("ACTIVA");
    await closeOpen();

    const far = await mustDispatch({ type: "START_DAY", siteId: siteA });
    await PersistenceService.setLastFix({
      lat: SITE_LAT + 120_000 / M_PER_DEG,
      lon: SITE_LON,
      timestampMs: time.now() - 5 * MIN,
      accuracyM: 10,
    });
    LocationMock.__setPosition(SITE_LAT, SITE_LON, 10, 0, { timestamp: time.now() });
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: 1, region: region(far.id, siteA) });
    expect((await PersistenceService.getSession(far.id))?.domainStatus).toBe("ESPERANDO");
    const [rejected] = await PersistenceService.listSpatialFacts(far.id, ["ENTER"]);
    expect(rejected).toMatchObject({ reliable: false, reason: "LOCATION_JUMP_DETECTED" });
    expect(dataOf((await IntegrityLedgerService.listForSession(far.id)).find((e) => e.intent === "SPATIAL_FACT")!.payloadJson).severity).toBe("MEDIUM");
  });

  test("el último fix guarda la hora del GPS y su precisión, no la hora del proceso", async () => {
    const { siteA } = await seedWorld();
    const s = await mustDispatch({ type: "START_DAY", siteId: siteA });
    const at = time.now() - 2_500;
    LocationMock.__setPosition(SITE_LAT, SITE_LON, 12, 0, { timestamp: at });
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: 1, region: region(s.id, siteA) });
    expect(await PersistenceService.getLastFix()).toMatchObject({ timestampMs: at, accuracyM: 12, lat: SITE_LAT });
    expect((await PersistenceService.getLastFix())!.timestampMs).not.toBe(time.now());
  });

  test("si el servicio no corre, el vigilante lo relanza y la jornada sigue igual", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    await touchHeartbeat();
    await runSessionWatchdog();
    const rows = await IntegrityLedgerService.listForSession(s.id);
    expect(rows.some((e) => e.intent === "MONITORING_STOPPED_DETECTED")).toBe(true);
    const recovery = rows.filter((e) => e.intent === "SERVICE_RECOVERY");
    expect(recovery).toHaveLength(1);
    expect(dataOf(recovery[0].payloadJson).success).toBe(true);
    expect(recovery[0].fromState).toBe("ACTIVA");
    expect(recovery[0].toState).toBe("ACTIVA");
    const after = (await PersistenceService.getSession(s.id))!;
    expect(after.domainStatus).toBe("ACTIVA");
    expect(after.integrityClass).toBe("VALID");
    expect(await LocationMock.hasStartedLocationUpdatesAsync(BREADCRUMB_TASK_NAME)).toBe(true);
    await TaskOrchestratorService.runWorker();
    expect((await IntegrityLedgerService.listForSession(s.id)).filter((e) => e.intent === "SERVICE_RECOVERY")).toHaveLength(1);
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ACTIVA");
  });

  test("tres fallos de arranque quedan en el ledger, avisan y no cierran la jornada", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    const err = new Error("not allowed");
    err.name = "ForegroundServiceStartNotAllowedException";
    LocationMock.__setStartLocationUpdatesError(err);
    await runSessionWatchdog();
    const rows = await IntegrityLedgerService.listForSession(s.id);
    const tries = rows.filter((e) => e.intent === "SERVICE_RECOVERY");
    expect(tries).toHaveLength(3);
    expect(tries.every((e) => dataOf(e.payloadJson).success === false)).toBe(true);
    expect(tries.every((e) => dataOf(e.payloadJson).errorName === "ForegroundServiceStartNotAllowedException")).toBe(true);
    const failed = rows.find((e) => e.intent === "SERVICE_RECOVERY_FAILED")!;
    expect(dataOf(failed.payloadJson)).toMatchObject({ severity: "HIGH" });
    const starts = rows.filter((e) => e.intent === "FOREGROUND_SERVICE_START_FAILED");
    expect(starts).toHaveLength(1);
    expect(dataOf(starts[0].payloadJson).severity).toBe("HIGH");
    expect(notices().some((n) => n.body === "El monitoreo se detuvo; abre Dual Tracker")).toBe(true);
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ACTIVA");
    expect((await PersistenceService.getSession(s.id))?.integrityClass).toBe("VALID");
    await TaskOrchestratorService.runWorker();
    expect((await IntegrityLedgerService.listForSession(s.id)).filter((e) => e.intent === "SERVICE_RECOVERY_FAILED")).toHaveLength(1);
  });

  test("sin jornada abierta no se relanza nada", async () => {
    await seedWorld();
    await recoverMonitoring("background");
    const rows = await PersistenceService.listLedger();
    expect(rows.some((e) => e.intent === "SERVICE_RECOVERY" || e.intent === "MONITORING_STOPPED_DETECTED")).toBe(false);
  });

  test("un hueco de 6 min se anota y no es huérfana; 44 min tampoco; 50 min sí, una sola vez", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    await touchHeartbeat();
    time.travel(6 * MIN);
    await runSessionWatchdog();
    let rows = await IntegrityLedgerService.listForSession(s.id);
    const gap = rows.find((e) => e.intent === "MONITORING_GAP")!;
    expect(dataOf(gap.payloadJson).gapSeconds).toBe(360);
    expect((await PersistenceService.getSession(s.id))?.integrityClass).toBe("VALID");
    expect((await PersistenceService.getSession(s.id))?.bookkeeping.integrityReason).not.toBe("ORPHAN_SESSION");
    await closeOpen();

    const early = await startAndArrive(siteA);
    await touchHeartbeat();
    time.travel(44 * MIN);
    LocationMock.__setPosition(SITE_LAT + 0.05, SITE_LON, 10);
    await runSessionWatchdog();
    expect((await PersistenceService.getSession(early.id))?.bookkeeping.integrityReason).not.toBe("ORPHAN_SESSION");
    await closeOpen();

    const late = await startAndArrive(siteA);
    await touchHeartbeat();
    time.travel(50 * MIN);
    LocationMock.__setPosition(SITE_LAT + 0.05, SITE_LON, 10);
    await runSessionWatchdog();
    await runSessionWatchdog();
    rows = await IntegrityLedgerService.listForSession(late.id);
    expect(rows.filter((e) => e.intent === "MONITORING_GAP")).toHaveLength(1);
    expect(dataOf(rows.find((e) => e.intent === "MONITORING_GAP")!.payloadJson).gapSeconds).toBeGreaterThanOrEqual(300);
    const after = (await PersistenceService.getSession(late.id))!;
    expect(after.domainStatus).toBe("ACTIVA");
    expect(after.integrityClass).toBe("CONFLICT");
    expect(after.bookkeeping.integrityReason).toBe("ORPHAN_SESSION");
  });

  test("Salud avisa la simulación y no bloquea VALIDADA", async () => {
    const { siteA } = await seedWorld();
    const s = await mustDispatch({ type: "START_DAY", siteId: siteA });
    LocationMock.__setPosition(SITE_LAT, SITE_LON, 10, 0, { mocked: true });
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: 1, region: region(s.id, siteA) });
    const snapshot = await PermissionsHealthService.refresh();
    expect(snapshot.mockLocation).toBe(true);
    expect(PermissionsHealthService.blocksValid({ ...snapshot, foregroundService: "running" }, true)).toBe(false);
    expect(blockingIntegrityReason({ ...snapshot, foregroundService: "running" }, true)).toBeNull();
  });

  test("el PDF avisa si hubo lecturas simuladas y calla si no", () => {
    const html = ReportService.renderHtml("EMPLOYEE_RECEIPT", report({ mockedFacts: 2 }));
    const dossier = ReportService.renderHtml("EMPLOYER_DOSSIER", report({ mockedFacts: 2 }));
    expect(html).toContain('data-mock-location="1"');
    expect(html).toContain("2 lecturas");
    expect(dossier).toContain('data-mock-location="1"');
    const clean = ReportService.renderHtml("EMPLOYEE_RECEIPT", report({}));
    expect(clean).not.toContain("data-mock-location");
    const english = ReportService.renderHtml("EMPLOYER_DOSSIER", report({ mockedFacts: 2, locale: "en" }));
    expect(english).toContain("2 readings");
    const legacy = ReportService.renderHtml("EMPLOYEE_RECEIPT", report({ mockedFacts: 3, documentVersion: 1 }));
    expect(legacy).toContain('data-mock-location="1"');
    expect(legacy).not.toContain("data-document-version");
    expect(ReportService.renderHtml("EMPLOYER_DOSSIER", report({ documentVersion: 1 }))).not.toContain("data-mock-location");
  });
});

function report(opts: { mockedFacts?: number; locale?: "es" | "en"; documentVersion?: number }) {
  const st = makeStatement({ regularHours: 8 });
  const trace: TraceSummary = {
    sessionId: 1,
    pointCount: 0,
    firstAtMs: null,
    lastAtMs: null,
    unreliableCount: opts.mockedFacts ? 1 : 0,
    dwellBySite: [],
    enterExit: [],
    ...(opts.mockedFacts ? { mockedFacts: opts.mockedFacts } : {}),
  };
  const site: Site = {
    id: 1,
    alias: "Obra Norte",
    address: "1 Main St",
    clientName: null,
    notes: null,
    targetLat: SITE_LAT,
    targetLon: SITE_LON,
    radiusM: 100,
    active: true,
    createdAtMs: 0,
    archivedAtMs: null,
  };
  return {
    statement: { ...st, packHash: "ab".repeat(32) },
    evidence: makeEvidence({ traces: [trace] }),
    manifest: {
      packId: "W2026-09-21-abcdef12",
      packHash: "ab".repeat(32),
      sealedAtMs: MONDAY_8AM,
      certified: true,
      policyId: st.policyId,
      manifestVersion: 5,
      documentVersion: opts.documentVersion ?? 2,
      documentTheme: "light" as const,
      documentLocale: opts.locale ?? ("es" as const),
    },
    sessions: [makeClosedSession(MONDAY_8AM, 8)],
    sites: [site],
    profile: { ...DEFAULT_PROFILE, employeeName: "Ana" },
    company: { ...COMPANY, employerName: "Taller Norte" },
  };
}
