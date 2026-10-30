/**
 * Fase 3 de la auditoría 22 oct 2026: estado de monitoreo derivado,
 * latido por componente, notificación viva, anomalías con severidad,
 * integridad del dispositivo y puntaje de confianza.
 * La nómina, la máquina de la jornada y el hash de asientos ya escritos no cambian.
 */
import * as Print from "expo-print";
import { Platform } from "react-native";
import { blockingIntegrityReason, readingLooksOk } from "../../../core/healthPolicy";
import { assessDeviceIntegrity, deviceIntegritySeverity, emulatorHitsFromProbe, type DeviceProbe } from "../../../core/deviceIntegrityAssess";
import { scoreLocationTrust } from "../../../core/locationTrust";
import { SAMPLE_STALE_MS, STALE_LOCATION_MS, deriveMonitoringState, gpsNoticeState } from "../../../core/monitoringState";
import { INITIAL_HEALTH } from "../../../core/store/initialState";
import { DOCUMENT_VERSION, PACK_MANIFEST_VERSION } from "../../../core/contracts";
import { setLanguage, t } from "../../../i18n";
import { getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { COMPANY, HOUR, MIN, MONDAY_8AM } from "../../../../test/fixtures/session.fixture";
import { makeEvidence, makeStatement } from "../../../../test/fixtures/payroll.fixture";
import { SITE_LAT, SITE_LON, makeEnter, makeExit } from "../../../../test/fixtures/spatial.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../test/helpers";
import { LocationMock } from "../../../../test/runtimeHarness";
import { time } from "../../../../test/time";
import { BREADCRUMB_TASK_NAME } from "../../../constants/geolocation";
import { EvidencePackService, computeContentHash, contentOf } from "../../evidence/EvidencePackService";
import { ReportService } from "../../evidence/ReportService";
import { LEDGER_PAYLOAD_VERSION, IntegrityLedgerService } from "../IntegrityLedgerService";
import { PayrollEngineService } from "../PayrollEngineService";
import { SessionEngineService } from "../SessionEngineService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { ANOMALY_KINDS, ANOMALY_SEVERITY, OPERATIONAL_SEVERITY, SEVERITY_LEVELS, maxSeverity } from "../../runtime/anomalyCatalog";
import { noteClockDriftAnomaly, noteSpatialAnomaly, reviewMonitoringAnomalies } from "../../runtime/anomalyEngine";
import { __setDeviceProbeForTests, observeDeviceIntegrity } from "../../runtime/deviceIntegrity";
import { ForegroundWorkService } from "../../runtime/ForegroundWorkService";
import { buildForegroundNotice, loadMonitoringObservation, locationTrustForSession } from "../../runtime/monitoringSnapshot";
import { PermissionsHealthService } from "../../runtime/PermissionsHealthService";
import { touchServiceHealth } from "../../runtime/serviceHealth";
import type { LedgerIntent, SessionRecord } from "../../../core/contracts";

function dataOf(payloadJson: string): { kind?: string; severity?: string; success?: boolean; ledgerPayloadVersion?: number } {
  return JSON.parse(payloadJson).data;
}

function fgsBody(): string {
  const opts = LocationMock.__state.locationUpdates.get(BREADCRUMB_TASK_NAME) as {
    foregroundService?: { notificationBody?: string };
  };
  return opts?.foregroundService?.notificationBody ?? "";
}

function probe(partial: Partial<DeviceProbe> = {}): DeviceProbe {
  return {
    platform: "android",
    isDevice: true,
    brand: "samsung",
    manufacturer: "samsung",
    modelName: "SM-S901U",
    productName: "o1q",
    fingerprint: "samsung/o1q/o1q:14/UP1A:user/release-keys",
    hardware: "qcom",
    product: "o1q",
    model: "SM-S901U",
    device: "o1q",
    developerOptionsEnabled: false,
    rootChecked: true,
    rootHits: [],
    ...partial,
  };
}

async function append(session: SessionRecord, intent: LedgerIntent, data: Record<string, unknown> = {}, atMs = time.now()): Promise<void> {
  await PersistenceService.transaction(async (db) => {
    await IntegrityLedgerService.append(
      {
        sessionId: session.id,
        actor: "SYSTEM",
        intent,
        fromState: session.domainStatus,
        toState: session.domainStatus,
        reason: intent,
        timestampMs: atMs,
        integrityClass: null,
        data,
      },
      db,
    );
  });
}

describe("fase 3 · 22 oct 2026", () => {
  test("el estado de monitoreo sale del fix, del heartbeat y de la recuperación", async () => {
    expect(deriveMonitoringState({ nowMs: 0, sessionStartedAtMs: null, lastHeartbeatMs: 1, lastFixMs: 1, recovery: [] })).toBe("IDLE");
    time.set(MONDAY_8AM);
    const { siteA } = await seedWorld();
    const session = await startAndArrive(siteA, 0);
    let obs = await loadMonitoringObservation(session);
    expect(deriveMonitoringState(obs)).toBe("STARTING");

    time.travel(SAMPLE_STALE_MS);
    obs = await loadMonitoringObservation(session);
    expect(deriveMonitoringState(obs)).toBe("DEGRADED");

    await PersistenceService.setLastFix({ lat: SITE_LAT, lon: SITE_LON, timestampMs: time.now(), accuracyM: 8 });
    obs = await loadMonitoringObservation(session);
    expect(deriveMonitoringState(obs)).toBe("MONITORING");

    time.travel(SAMPLE_STALE_MS);
    obs = await loadMonitoringObservation(session);
    expect(deriveMonitoringState(obs)).toBe("DEGRADED");

    await PersistenceService.setLastFix({ lat: SITE_LAT, lon: SITE_LON, timestampMs: time.now(), accuracyM: 8 });
    time.travel(1_000);
    await append(session, "MONITORING_STOPPED_DETECTED");
    obs = await loadMonitoringObservation(session);
    expect(deriveMonitoringState(obs)).toBe("RECOVERING");

    await PersistenceService.setLastFix({ lat: SITE_LAT, lon: SITE_LON, timestampMs: time.now(), accuracyM: 8 });
    time.travel(1_000);
    await append(session, "SERVICE_RECOVERY", { success: false });
    obs = await loadMonitoringObservation(session);
    expect(deriveMonitoringState(obs)).toBe("RECOVERING");

    await PersistenceService.setLastFix({ lat: SITE_LAT, lon: SITE_LON, timestampMs: time.now(), accuracyM: 8 });
    time.travel(1_000);
    await append(session, "SERVICE_RECOVERY_FAILED");
    obs = await loadMonitoringObservation(session);
    expect(deriveMonitoringState(obs)).toBe("FAILED");

    await touchServiceHealth("worker", time.now());
    obs = await loadMonitoringObservation(session);
    expect(obs.lastHeartbeatMs).toBe(time.now());
    expect(deriveMonitoringState(obs)).toBe("FAILED");

    time.travel(1_000);
    await PersistenceService.setLastFix({ lat: SITE_LAT, lon: SITE_LON, timestampMs: time.now(), accuracyM: 8 });
    obs = await loadMonitoringObservation(session);
    expect(deriveMonitoringState(obs)).toBe("MONITORING");
    expect((await PersistenceService.getSession(session.id))?.domainStatus).toBe("ACTIVA");
    expect((await PersistenceService.getSession(session.id))?.integrityClass).toBe("VALID");
  });

  test("una lectura vieja no queda verde y el latido por componente alimenta Salud", async () => {
    const now = MONDAY_8AM;
    expect(readingLooksOk(null, now, false)).toBe(true);
    expect(readingLooksOk(null, now, true)).toBe(false);
    expect(readingLooksOk(now - SAMPLE_STALE_MS, now, false)).toBe(false);
    expect(readingLooksOk(now - SAMPLE_STALE_MS + 1, now, true)).toBe(true);

    time.set(MONDAY_8AM);
    const { siteA } = await seedWorld();
    const session = await startAndArrive(siteA, 0);
    await SessionEngineService.recordSpatialFact(makeEnter({ sessionId: session.id, siteId: siteA, timestampMs: time.now(), accuracyM: 12 }));
    await PersistenceService.setLastFix({ lat: SITE_LAT, lon: SITE_LON, timestampMs: time.now(), accuracyM: 12 });
    const beat = time.now();
    await touchServiceHealth("location", beat);
    await touchServiceHealth("geofence", beat);
    await touchServiceHealth("worker", beat);
    await touchServiceHealth("watchdog", beat);
    const fresh = await PermissionsHealthService.refresh();
    expect(fresh.monitoringState).toBe("MONITORING");
    expect(fresh.lastHeartbeatAt).toBe(beat);
    expect(fresh.serviceHealth.map((row) => row.component).sort()).toEqual(["geofence", "location", "watchdog", "worker"]);
    expect(readingLooksOk(fresh.lastSpatialFactAt, time.now(), true)).toBe(true);
    expect(readingLooksOk(fresh.lastHeartbeatAt, time.now(), true)).toBe(true);

    time.travel(SAMPLE_STALE_MS);
    const stale = await PermissionsHealthService.refresh();
    expect(stale.monitoringState).toBe("DEGRADED");
    expect(readingLooksOk(stale.lastSpatialFactAt, time.now(), true)).toBe(false);
    expect(readingLooksOk(stale.lastHeartbeatAt, time.now(), false)).toBe(false);
    expect(blockingIntegrityReason({ ...stale, foregroundService: "running" }, true)).toBeNull();
  });

  test("la notificación persistente dice sitio, GPS y monitoreo", async () => {
    const originalOs = Platform.OS;
    Object.defineProperty(Platform, "OS", { configurable: true, get: () => "android" });
    setLanguage("es");
    try {
      time.set(MONDAY_8AM);
      const { siteA } = await seedWorld();
      const session = await startAndArrive(siteA, 0);
      await PersistenceService.setLastFix({ lat: SITE_LAT, lon: SITE_LON, timestampMs: time.now(), accuracyM: 9 });
      const notice = await buildForegroundNotice(session);
      expect(notice).toEqual({ site: "Sitio A", gps: "ok", monitoring: "MONITORING" });
      expect(await ForegroundWorkService.sync("ACTIVA", "BREADCRUMB")).toMatchObject({ status: "running" });
      expect(fgsBody()).toBe(t("notifications.fgsBody", {}, "es"));
      expect(await ForegroundWorkService.sync("ACTIVA", "BREADCRUMB", { notice })).toMatchObject({ status: "running", reason: "STARTED" });
      expect(fgsBody()).toBe("Sitio A · Ubicación: correcto");
      expect(await ForegroundWorkService.sync("ACTIVA", "BREADCRUMB", { notice })).toMatchObject({ reason: "UNCHANGED" });
      expect(fgsBody()).toBe("Sitio A · Ubicación: correcto");

      setLanguage("en");
      const english = { ...notice!, monitoring: "DEGRADED" as const, gps: "lost" as const };
      expect(await ForegroundWorkService.sync("ACTIVA", "BREADCRUMB", { notice: english })).toMatchObject({ reason: "STARTED" });
      expect(fgsBody()).toBe("Sitio A · Location: no signal");
      expect(t("notifications.fgsLive", { site: "Sitio A", gps: t("notifications.gps.ok", {}, "en") }, "en")).toBe(
        "Sitio A · Location: ok",
      );
    } finally {
      setLanguage("es");
      await ForegroundWorkService.stop();
      Object.defineProperty(Platform, "OS", { configurable: true, get: () => originalOs });
    }
  });

  test("el catálogo cubre LOW, MEDIUM, HIGH y CRITICAL", () => {
    expect(SEVERITY_LEVELS).toEqual(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
    expect(new Set(ANOMALY_KINDS.map((kind) => ANOMALY_SEVERITY[kind]))).toEqual(new Set(["LOW", "MEDIUM", "HIGH"]));
    expect(ANOMALY_SEVERITY.GPS_RESTORED).toBe("LOW");
    expect(ANOMALY_SEVERITY.STALE_LOCATION).toBe("MEDIUM");
    expect(ANOMALY_SEVERITY.MOCK_LOCATION).toBe("HIGH");
    expect(OPERATIONAL_SEVERITY.ROOTED).toBe("CRITICAL");
    expect(OPERATIONAL_SEVERITY.DEVELOPER_OPTIONS).toBe("LOW");
    expect(maxSeverity(["LOW", "HIGH", "MEDIUM"])).toBe("HIGH");
    expect(maxSeverity([null, "CRITICAL"])).toBe("CRITICAL");
  });

  test("las anomalías se asientan con severidad, se deduplican y no borran el hecho", async () => {
    time.set(MONDAY_8AM);
    const { siteA } = await seedWorld();
    const session = await startAndArrive(siteA, 0);
    const prior = await IntegrityLedgerService.listForSession(session.id);
    const frozen = prior[0].hash;

    await SessionEngineService.recordSpatialFact(
      makeEnter({ sessionId: session.id, siteId: siteA, reason: "MOCK_LOCATION", reliable: false, timestampMs: time.now(), accuracyM: 5 }),
    );
    await noteSpatialAnomaly({ sessionId: session.id, reason: "MOCK_LOCATION", timestampMs: time.now() });
    const mocks = (await PersistenceService.listLedger({ sessionId: session.id, intent: "ANOMALY" })).filter((e) => dataOf(e.payloadJson).kind === "MOCK_LOCATION");
    expect(mocks).toHaveLength(1);
    expect(dataOf(mocks[0].payloadJson)).toMatchObject({ severity: "HIGH", ledgerPayloadVersion: LEDGER_PAYLOAD_VERSION });
    expect(mocks[0].integrityClass).toBeNull();
    expect(await PersistenceService.listSpatialFacts(session.id)).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: "MOCK_LOCATION" })]),
    );

    const jumpAt = time.now();
    await noteSpatialAnomaly({ sessionId: session.id, reason: "LOCATION_JUMP_DETECTED", timestampMs: jumpAt });
    await noteSpatialAnomaly({ sessionId: session.id, reason: "LOCATION_JUMP_DETECTED", timestampMs: jumpAt + 1_000 });
    await noteSpatialAnomaly({ sessionId: session.id, reason: "IMPOSSIBLE_SPEED", timestampMs: jumpAt });
    await noteSpatialAnomaly({ sessionId: session.id, reason: "LOCATION_JUMP_DETECTED", timestampMs: jumpAt + 10 * MIN });
    const jumps = (await PersistenceService.listLedger({ sessionId: session.id, intent: "ANOMALY" })).filter((e) => dataOf(e.payloadJson).kind === "GPS_JUMP");
    const travel = (await PersistenceService.listLedger({ sessionId: session.id, intent: "ANOMALY" })).filter((e) => dataOf(e.payloadJson).kind === "IMPOSSIBLE_TRAVEL");
    expect(jumps).toHaveLength(2);
    expect(travel).toHaveLength(1);
    expect(dataOf(jumps[0].payloadJson).severity).toBe("HIGH");

    await noteClockDriftAnomaly(session.id, 90_000, session.domainStatus);
    await noteClockDriftAnomaly(session.id, 90_000, session.domainStatus);
    const drift = (await PersistenceService.listLedger({ sessionId: session.id, intent: "ANOMALY" })).filter((e) => dataOf(e.payloadJson).kind === "CLOCK_DRIFT");
    expect(drift).toHaveLength(1);
    expect(dataOf(drift[0].payloadJson).severity).toBe("HIGH");

    expect((await IntegrityLedgerService.listForSession(session.id)).find((e) => e.id === prior[0].id)?.hash).toBe(frozen);
    expect((await IntegrityLedgerService.verify()).valid).toBe(true);
    expect((await PersistenceService.getSession(session.id))?.integrityClass).toBe("VALID");
  });

  test("señal, aleteo, ubicación quieta y servicio parado se anotan una vez", async () => {
    time.set(MONDAY_8AM);
    const { siteA } = await seedWorld();
    const session = await startAndArrive(siteA, 0);
    await reviewMonitoringAnomalies(session);
    expect(await PersistenceService.listLedger({ sessionId: session.id, intent: "GPS_LOST" })).toHaveLength(0);

    time.travel(SAMPLE_STALE_MS);
    LocationMock.__state.servicesEnabled = false;
    await PersistenceService.setLastFix({ lat: SITE_LAT, lon: SITE_LON, timestampMs: time.now() - SAMPLE_STALE_MS, accuracyM: 10 });
    await reviewMonitoringAnomalies(session);
    expect(await PersistenceService.listLedger({ sessionId: session.id, intent: "GPS_LOST" })).toHaveLength(0);
    LocationMock.__state.servicesEnabled = true;

    await PersistenceService.setLastFix({ lat: SITE_LAT, lon: SITE_LON, timestampMs: time.now() - SAMPLE_STALE_MS, accuracyM: 10 });
    await reviewMonitoringAnomalies(session);
    await reviewMonitoringAnomalies(session);
    expect(await PersistenceService.listLedger({ sessionId: session.id, intent: "GPS_LOST" })).toHaveLength(1);
    expect(dataOf((await PersistenceService.listLedger({ sessionId: session.id, intent: "GPS_LOST" }))[0].payloadJson).severity).toBe("HIGH");

    await PersistenceService.setLastFix({ lat: SITE_LAT, lon: SITE_LON, timestampMs: time.now(), accuracyM: 10 });
    await reviewMonitoringAnomalies(session);
    await reviewMonitoringAnomalies(session);
    expect(await PersistenceService.listLedger({ sessionId: session.id, intent: "GPS_RESTORED" })).toHaveLength(1);
    expect(dataOf((await PersistenceService.listLedger({ sessionId: session.id, intent: "GPS_RESTORED" }))[0].payloadJson).severity).toBe("LOW");

    await append(session, "GPS_LOST", { kind: "GPS_LOST", severity: "HIGH" }, time.now() - 20 * MIN);
    await reviewMonitoringAnomalies(session);
    expect((await PersistenceService.listLedger({ sessionId: session.id, intent: "ANOMALY" })).some((e) => dataOf(e.payloadJson).kind === "FREQUENT_SIGNAL_LOSS")).toBe(false);
    await append(session, "GPS_LOST", { kind: "GPS_LOST", severity: "HIGH" }, time.now() - 10 * MIN);
    await reviewMonitoringAnomalies(session);
    await reviewMonitoringAnomalies(session);
    const losses = (await PersistenceService.listLedger({ sessionId: session.id, intent: "ANOMALY" })).filter((e) => dataOf(e.payloadJson).kind === "FREQUENT_SIGNAL_LOSS");
    expect(losses).toHaveLength(1);
    expect(dataOf(losses[0].payloadJson).severity).toBe("MEDIUM");

    time.travel(STALE_LOCATION_MS);
    await reviewMonitoringAnomalies(session);
    await reviewMonitoringAnomalies(session);
    const stale = await PersistenceService.listLedger({ sessionId: session.id, intent: "ANOMALY" });
    expect(stale.filter((e) => dataOf(e.payloadJson).kind === "STALE_LOCATION")).toHaveLength(1);
    expect(dataOf(stale.find((e) => dataOf(e.payloadJson).kind === "STALE_LOCATION")!.payloadJson).severity).toBe("MEDIUM");

    const base = time.now();
    for (const [index, type] of (["ENTER", "EXIT", "ENTER"] as const).entries()) {
      const fact = (type === "ENTER" ? makeEnter : makeExit)({ sessionId: session.id, siteId: siteA, timestampMs: base - (3 - index) * MIN });
      await PersistenceService.insertSpatialFact(fact);
    }
    await reviewMonitoringAnomalies(session);
    expect((await PersistenceService.listLedger({ sessionId: session.id, intent: "ANOMALY" })).some((e) => dataOf(e.payloadJson).kind === "BOUNDARY_FLAPPING")).toBe(false);
    await PersistenceService.insertSpatialFact(makeExit({ sessionId: session.id, siteId: siteA, timestampMs: base }));
    await reviewMonitoringAnomalies(session);
    await reviewMonitoringAnomalies(session);
    const flaps = (await PersistenceService.listLedger({ sessionId: session.id, intent: "ANOMALY" })).filter((e) => dataOf(e.payloadJson).kind === "BOUNDARY_FLAPPING");
    expect(flaps).toHaveLength(1);
    expect(dataOf(flaps[0].payloadJson).severity).toBe("MEDIUM");
    expect((await PersistenceService.listSpatialFacts(session.id, ["ENTER", "EXIT"])).length).toBeGreaterThanOrEqual(4);

    const originalOs = Platform.OS;
    Object.defineProperty(Platform, "OS", { configurable: true, get: () => "android" });
    try {
      await reviewMonitoringAnomalies(session);
      await reviewMonitoringAnomalies(session);
      expect((await PersistenceService.listLedger({ sessionId: session.id, intent: "ANOMALY" })).filter((e) => dataOf(e.payloadJson).kind === "SERVICE_STOPPED")).toHaveLength(1);
      expect(await ForegroundWorkService.sync(session.domainStatus, "BREADCRUMB")).toMatchObject({ status: "running" });
      await reviewMonitoringAnomalies(session);
      await ForegroundWorkService.stop();
      await reviewMonitoringAnomalies(session);
      expect((await PersistenceService.listLedger({ sessionId: session.id, intent: "ANOMALY" })).filter((e) => dataOf(e.payloadJson).kind === "SERVICE_STOPPED")).toHaveLength(2);
    } finally {
      LocationMock.__state.servicesEnabled = true;
      await ForegroundWorkService.stop();
      Object.defineProperty(Platform, "OS", { configurable: true, get: () => originalOs });
    }
    expect((await PersistenceService.getSession(session.id))?.integrityClass).toBe("VALID");
  });

  test("la integridad del dispositivo se lee sin bloquear y solo se asienta si cambia", async () => {
    expect(emulatorHitsFromProbe(probe({ fingerprint: "google/sdk_gphone64_arm64/emu:14" }))).toContain("sdk_gphone");
    expect(emulatorHitsFromProbe(probe({ hardware: "goldfish" }))).toContain("goldfish");
    expect(emulatorHitsFromProbe(probe({ product: "ranchu" }))).toContain("ranchu");
    expect(emulatorHitsFromProbe(probe({ model: "generic" }))).toContain("generic");
    expect(emulatorHitsFromProbe(probe({ isDevice: false }))).toContain("isDevice");
    expect(deviceIntegritySeverity(assessDeviceIntegrity(probe({ fingerprint: "sdk_gphone" })))).toBe("HIGH");
    expect(deviceIntegritySeverity(assessDeviceIntegrity(probe({ rootHits: ["/system/bin/su"] })))).toBe("CRITICAL");
    expect(deviceIntegritySeverity(assessDeviceIntegrity(probe({ developerOptionsEnabled: true })))).toBe("LOW");
    const ios = assessDeviceIntegrity(probe({ platform: "ios", developerOptionsEnabled: true, rootHits: ["/system/bin/su"] }));
    expect(ios.developerOptionsEnabled).toBeNull();
    expect(ios.rooted).toBeNull();

    time.set(MONDAY_8AM);
    const { siteA } = await seedWorld();
    const session = await startAndArrive(siteA, 0);
    __setDeviceProbeForTests(probe({ platform: "android", isDevice: null, brand: null, manufacturer: null, modelName: null, productName: null, fingerprint: null, hardware: null, product: null, model: null, device: null, developerOptionsEnabled: null, rootChecked: false, rootHits: [] }));
    expect(await observeDeviceIntegrity(session)).toBeNull();
    expect(await PersistenceService.listLedger({ intent: "DEVICE_INTEGRITY" })).toHaveLength(0);

    __setDeviceProbeForTests(probe());
    const clean = await observeDeviceIntegrity(session);
    expect(clean).toMatchObject({ emulator: false, rooted: false, developerOptionsEnabled: false });
    await observeDeviceIntegrity(session);
    expect(await PersistenceService.listLedger({ intent: "DEVICE_INTEGRITY" })).toHaveLength(1);

    __setDeviceProbeForTests(probe({ developerOptionsEnabled: true, rootHits: ["/sbin/.magisk", "/system/xbin/busybox"] }));
    const dirty = await observeDeviceIntegrity(session);
    expect(dirty?.rooted).toBe(true);
    expect(dirty?.rootHits).toEqual(expect.arrayContaining(["/sbin/.magisk", "/system/xbin/busybox"]));
    const rows = await PersistenceService.listLedger({ intent: "DEVICE_INTEGRITY" });
    expect(rows).toHaveLength(2);
    expect(dataOf(rows[1].payloadJson).severity).toBe("CRITICAL");
    expect(rows[1].integrityClass).toBeNull();

    const health = await PermissionsHealthService.refresh();
    expect(health.deviceIntegrity?.rooted).toBe(true);
    expect(health.deviceIntegrity?.developerOptionsEnabled).toBe(true);
    expect(blockingIntegrityReason({ ...INITIAL_HEALTH, ...health, foregroundService: "running", monitoringState: "FAILED" }, true)).toBeNull();
    expect((await PersistenceService.getSession(session.id))?.integrityClass).toBe("VALID");
  });

  test("el puntaje es informativo: entra en Salud y en el expediente, y no mueve el pago", async () => {
    expect(scoreLocationTrust({ accuraciesM: [8], mocked: false, rooted: false, jumpCount: 0, boundaryFlips: 1, signalLossCount: 0, gapCount: 0 })).toMatchObject({
      score: 100,
      label: "EXCELLENT",
    });
    expect(scoreLocationTrust({ accuraciesM: [30], mocked: false, rooted: false, jumpCount: 0, boundaryFlips: 0, signalLossCount: 0, gapCount: 0 }).label).toBe("EXCELLENT");
    expect(scoreLocationTrust({ accuraciesM: [80], mocked: false, rooted: false, jumpCount: 0, boundaryFlips: 0, signalLossCount: 0, gapCount: 0 }).label).toBe("GOOD");
    expect(scoreLocationTrust({ accuraciesM: [10], mocked: false, rooted: true, jumpCount: 0, boundaryFlips: 0, signalLossCount: 0, gapCount: 0 })).toMatchObject({ score: 65, label: "FAIR" });
    expect(scoreLocationTrust({ accuraciesM: [], mocked: true, rooted: false, jumpCount: 2, boundaryFlips: 4, signalLossCount: 3, gapCount: 2 }).label).toBe("SUSPICIOUS");
    expect(gpsNoticeState({ servicesEnabled: false, mocked: true, lastFixMs: null, nowMs: 0, sessionOpen: true })).toBe("mock");

    time.set(MONDAY_8AM);
    const { siteA } = await seedWorld();
    const open = await startAndArrive(siteA, 0);
    await SessionEngineService.recordSpatialFact(makeEnter({ sessionId: open.id, siteId: siteA, timestampMs: time.now(), accuracyM: 10 }));
    time.travel(8 * HOUR);
    const closed = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 0 });
    const paid = (sessions: SessionRecord[]) =>
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
    const lines = paid([closed]).lines;

    __setDeviceProbeForTests(probe());
    await observeDeviceIntegrity({ id: closed.id, domainStatus: closed.domainStatus });
    const openTrust = await locationTrustForSession(closed.id, false);
    expect(openTrust).toMatchObject({ score: 100, label: "EXCELLENT" });

    const period = { periodStart: getWeekStart(closed.actualStartAtMs!), periodEnd: getWeekEnd(closed.actualStartAtMs!) };
    const packed = await EvidencePackService.seal(period);
    if (!packed.ok) throw new Error(packed.code);
    expect(packed.data.manifest.manifestVersion).toBe(PACK_MANIFEST_VERSION);
    expect(packed.data.manifest.documentVersion).toBe(DOCUMENT_VERSION);
    expect(packed.data.evidence.locationTrust).toEqual([
      expect.objectContaining({ sessionId: closed.id, score: 100, label: "EXCELLENT" }),
    ]);
    expect(packed.data.evidence.deviceIntegrity).toMatchObject({ emulator: false, rooted: false, developerOptionsEnabled: false, platform: "android" });
    expect(await EvidencePackService.verify(packed.data)).toMatchObject({ valid: true, failures: [] });

    const html = (Print as unknown as { __printed: string[] }).__printed.join("\n");
    expect(html).toContain(t("comprobante.trustTitle", {}, "es"));
    expect(html).toContain(t("health.trust.labels.EXCELLENT", {}, "es"));
    expect(html).toContain(t("comprobante.trustHint", {}, "es"));
    expect(html).toContain(t("comprobante.deviceClear", {}, "es"));
    expect(html).toContain('data-location-trust="1"');
    expect(html).toContain('data-device-integrity="1"');

    const render = (locale: "es" | "en", role: "EMPLOYEE_RECEIPT" | "EMPLOYER_DOSSIER") =>
      ReportService.renderHtml(role, {
        statement: packed.data.statement,
        evidence: packed.data.evidence,
        manifest: { ...packed.data.manifest, documentLocale: locale },
        sessions: [closed],
        sites: [],
        profile: { employeeName: "Ada" } as never,
        company: COMPANY,
      });
    expect(render("en", "EMPLOYEE_RECEIPT")).toContain(t("health.trust.labels.EXCELLENT", {}, "en"));
    expect(render("en", "EMPLOYER_DOSSIER")).toContain(t("comprobante.trustHint", {}, "en"));
    expect(render("es", "EMPLOYEE_RECEIPT")).toContain("Excelente");

    const legacy = contentOf(makeStatement(), makeEvidence());
    expect(JSON.stringify(legacy)).not.toContain("locationTrust");
    expect(JSON.stringify(legacy)).not.toContain("deviceIntegrity");
    const stripped = { ...packed.data.evidence };
    delete stripped.locationTrust;
    delete stripped.deviceIntegrity;
    expect(JSON.stringify(contentOf(packed.data.statement, stripped))).not.toContain("locationTrust");
    expect(await computeContentHash(packed.data.statement, stripped)).not.toBe(packed.data.manifest.contentHash);

    const tampered = {
      ...packed.data,
      evidence: {
        ...packed.data.evidence,
        locationTrust: [{ ...packed.data.evidence.locationTrust![0], score: 1, label: "SUSPICIOUS" as const }],
      },
    };
    expect((await EvidencePackService.verify(tampered)).valid).toBe(false);

    __setDeviceProbeForTests(probe({ rootHits: ["/system/bin/su"] }));
    await observeDeviceIntegrity({ id: closed.id, domainStatus: closed.domainStatus });
    await SessionEngineService.recordSpatialFact(
      makeEnter({ sessionId: closed.id, siteId: siteA, reason: "MOCK_LOCATION", reliable: false, timestampMs: time.now(), accuracyM: 5 }),
    );
    const suspicious = await locationTrustForSession(closed.id, true);
    expect(suspicious.label).toBe("SUSPICIOUS");
    expect(suspicious.score).toBeLessThan(50);
    const reloaded = (await PersistenceService.getSession(closed.id))!;
    expect(reloaded.integrityClass).toBe("VALID");
    expect(reloaded.endAtMs).toBe(closed.endAtMs);
    expect(paid([reloaded]).grossEstimate).toBe(gross);
    expect(paid([reloaded]).lines).toEqual(lines);
    expect((await IntegrityLedgerService.verify()).valid).toBe(true);

    const salud = await PermissionsHealthService.refresh();
    expect(salud.locationTrust).toMatchObject({ sessionId: closed.id, label: "SUSPICIOUS" });
    expect(blockingIntegrityReason({ ...INITIAL_HEALTH, ...salud, foregroundService: "running" }, false)).toBeNull();
  });
});
