/** Inicio de jornada v1.3 — reglas que se pueden probar sin teléfono. */
import * as Notifications from "expo-notifications";
import { DEFAULT_EXIT_DEBOUNCE_MS, DEFAULT_EXIT_DECISION_WINDOW_MS, PIN_LOCKOUT_STEPS, PIN_MAX_LENGTH, PIN_MIN_LENGTH } from "../../../config/provisional";
import { getSessionStateUI } from "../../../core/selectors";
import { t } from "../../../i18n";
import { en } from "../../../i18n/en";
import { es } from "../../../i18n/es";
import { getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { CA_POLICY_ID, COMPANY, HOUR, MIN, MONDAY_8AM, RATES, makeClosedSession, makeSegment } from "../../../../test/fixtures/session.fixture";
import { SITE_LAT, SITE_LON, makeExit } from "../../../../test/fixtures/spatial.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../test/helpers";
import { LocationMock } from "../../../../test/runtimeHarness";
import { time } from "../../../../test/time";
import { pdfIntegrityBadgesHtml, pdfIntegrityMarks, PDF_INTEGRITY_COLORS } from "../../evidence/pdfIntegrity";
import { KV_KEYS } from "../../persistence/schema";
import { PersistenceService } from "../../persistence/PersistenceService";
import { DEFAULT_COMPANY_POLICY } from "../../persistence/SettingsService";
import { SecurityService, isAdminPin } from "../../runtime/SecurityService";
import { autoCloseContent } from "../../runtime/dayNotices";
import { EXIT_ACCURACY_MAX_M, EXIT_READING_INTERVAL_MS, classifyExitReading, confirmExitDecision } from "../../runtime/geofencePolicy";
import { TaskOrchestratorService } from "../../runtime/TaskOrchestratorService";
import { disarmExitFailsafeInProcess, runExitDecisionTimer } from "../../runtime/tasks/exitDecisionTimer.task";
import { runSessionWatchdog } from "../../runtime/tasks/sessionWatchdog.task";
import { PayrollEngineService, computeSessionMinutes } from "../PayrollEngineService";
import { SessionEngineService } from "../SessionEngineService";

const notes = Notifications as unknown as {
  __state: { scheduled: { content: { body?: string } }[] };
  __setPermission: (s: "granted" | "denied") => void;
};

const JARGON = /geocerca|check-in|monitoreo|no show|abandono|geofence|monitoring|tracking/i;

describe("inicio de jornada v1.3", () => {
  afterEach(() => TaskOrchestratorService.cancelExitDecision(0));

  test("D-01 tres lecturas cada 15 s y sin espera de 2 min", () => {
    expect(DEFAULT_EXIT_DEBOUNCE_MS).toBe(0);
    expect(EXIT_READING_INTERVAL_MS).toBe(15_000);
    expect(EXIT_ACCURACY_MAX_M).toBe(50);
    expect(classifyExitReading(260, 200, 40)).toBe("outside");
    expect(classifyExitReading(180, 200, 40)).toBe("inside");
    expect(classifyExitReading(230, 200, 40)).toBe("ignore");
    expect(classifyExitReading(400, 200, 80)).toBe("ignore");
    expect(confirmExitDecision({ zone: "outside", far: false, dwellMs: 3 * MIN, elapsedMs: 2 * MIN, debounceMs: 0, strikes: 2, pendingReliable: true })).toBe("wait");
    expect(confirmExitDecision({ zone: "outside", far: false, dwellMs: 3 * MIN, elapsedMs: 30_000, debounceMs: 0, strikes: 3, pendingReliable: true })).toBe("confirm");
  });

  test("D-03 el plazo sigue en 15 min y el rebote de 90 s no confirma", () => {
    expect(DEFAULT_EXIT_DECISION_WINDOW_MS).toBe(15 * MIN);
    expect(DEFAULT_COMPANY_POLICY.exitDecisionWindowMs).toBe(15 * MIN);
    expect(confirmExitDecision({ zone: "outside", far: false, dwellMs: 60_000, elapsedMs: 60_000, debounceMs: 0, strikes: 3, pendingReliable: true })).toBe("clear");
  });

  test("D-15 los dos cierres usan el mismo aviso", () => {
    expect(autoCloseContent("AUTO", MONDAY_8AM).body).toBe("Tu jornada se cerró automáticamente, revisa tus horas.");
    expect(autoCloseContent("CONFLICT", MONDAY_8AM).body).toBe(autoCloseContent("AUTO", null).body);
    expect(t("notifications.autoCloseBody", {}, "en")).toBe("Your shift was closed automatically. Please review your hours.");
  });

  test("D-08 el cierre de 12 h avisa y termina en la primera salida", async () => {
    notes.__setPermission("granted");
    notes.__state.scheduled.length = 0;
    const { siteA } = await seedWorld();
    const started = await startAndArrive(siteA);
    time.travel(4 * HOUR);
    const exitAt = time.now();
    const live = (await PersistenceService.getSession(started.id))!;
    await PersistenceService.updateSession({ ...live, bookkeeping: { ...live.bookkeeping, firstExitAtMs: exitAt, firstExitReliable: true } });
    time.travel(9 * HOUR);
    await runSessionWatchdog();
    const closed = (await PersistenceService.getSession(started.id))!;
    expect(closed.domainStatus).toBe("CERRADA");
    expect(closed.endAtMs).toBe(exitAt);
    expect(notes.__state.scheduled.map((n) => n.content.body)).toContain("Tu jornada se cerró automáticamente, revisa tus horas.");
  });

  test("D-15 sin permiso de avisos queda el banner", async () => {
    notes.__setPermission("denied");
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(13 * HOUR);
    await runSessionWatchdog();
    expect(await PersistenceService.getKv(KV_KEYS.AUTO_CLOSE_BANNER)).toBe("Tu jornada se cerró automáticamente, revisa tus horas.");
    notes.__setPermission("granted");
  });

  test("D-17 reabrir no cierra aunque hayan pasado 15 min", async () => {
    const { siteA } = await seedWorld();
    const started = await startAndArrive(siteA);
    time.travel(2 * HOUR);
    const firstExit = time.now();
    await mustDispatch({ type: "EXIT_DETECTED", fact: makeExit({ sessionId: started.id, timestampMs: firstExit }) }, "GEOFENCE");
    await TaskOrchestratorService.scheduleExitDecision(started.id, firstExit, 15 * MIN);
    disarmExitFailsafeInProcess();
    time.travel(20 * MIN);
    LocationMock.__setPosition(SITE_LAT + 0.05, SITE_LON, 10);
    expect(await runExitDecisionTimer()).toBe(false);
    const open = (await PersistenceService.getSession(started.id))!;
    expect(open.domainStatus).toBe("SALIDA");
    expect(open.bookkeeping.firstExitAtMs).toBe(firstExit);
  });

  test("D-16 corregir la hora exige motivo y conserva la original", async () => {
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(8 * HOUR);
    const closed = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 0 });
    const originalEnd = closed.endAtMs!;
    const rejected = await SessionEngineService.dispatch(
      { type: "MANUAL_PATCH", sessionId: closed.id, declaredStartAtMs: closed.declaredStartAtMs, endAtMs: originalEnd - HOUR, note: "   " },
      "UI",
    );
    expect(rejected.ok).toBe(false);
    const edited = await mustDispatch({
      type: "MANUAL_PATCH",
      sessionId: closed.id,
      declaredStartAtMs: closed.declaredStartAtMs,
      endAtMs: originalEnd - HOUR,
      note: "salí antes",
    });
    expect(edited.integrityClass).toBe("MANUAL");
    expect(edited.bookkeeping.original?.endAtMs).toBe(originalEnd);
    expect(pdfIntegrityBadgesHtml(edited, "es")).toContain("Editada");
    expect(pdfIntegrityBadgesHtml(edited, "es")).toContain(PDF_INTEGRITY_COLORS.EDITADA.bg);
  });

  test("el PIN de administración es de 4 a 8 dígitos y se bloquea 5 minutos", async () => {
    expect(PIN_MIN_LENGTH).toBe(4);
    expect(PIN_MAX_LENGTH).toBe(8);
    expect(PIN_LOCKOUT_STEPS).toEqual([[5, 5 * MIN]]);
    expect(isAdminPin("1234")).toBe(true);
    expect(isAdminPin("12345678")).toBe(true);
    expect(isAdminPin("123")).toBe(false);
    expect(isAdminPin("123456789")).toBe(false);
    expect((await SecurityService.setPin("123")).ok).toBe(false);
    expect((await SecurityService.setPin("1234")).ok).toBe(true);
  });

  test("D-18 Ya llegué y Terminar son la acción principal", () => {
    expect(getSessionStateUI("ESPERANDO").primary.labelKey).toBe("cta.confirmArrival");
    expect(getSessionStateUI("ESPERANDO").secondary?.labelKey).toBe("cta.cancelDay");
    expect(getSessionStateUI("ACTIVA").primary.labelKey).toBe("cta.closeDay");
    expect(t("cta.confirmArrival")).toBe("Ya llegué");
    expect(t("cta.closeDay")).toBe("Terminar jornada");
    expect(t("cta.confirmArrival", {}, "en")).toBe("I'm here");
  });

  test("D-21 y D-25 el almuerzo y el descanso tienen el copy del blueprint", () => {
    expect([t("modals.lunchNo"), t("modals.lunch30"), t("modals.lunch45"), t("modals.lunch60")]).toEqual(["No tomé almuerzo", "30 min", "45 min", "60 min"]);
    expect(t("modals.pickLunch")).toBe("Elige una opción para ver el total.");
    expect(t("modals.pauseLunch")).toBe("Almuerzo (sin pago)");
    expect(t("modals.pauseRest")).toBe("Descanso (pagado)");
    expect(t("modals.pauseStateNote")).toContain("California");
    expect(t("modals.lunchSub", {}, "en")).toBe("Lunch is deducted only once a day.");
  });

  test("D-24 las horas salen de la llegada y un traslado de 45 min se paga", () => {
    const waiting = computeSessionMinutes(
      { ...makeClosedSession(MONDAY_8AM, 1), domainStatus: "ESPERANDO", actualStartAtMs: null, endAtMs: null },
      COMPANY,
      MONDAY_8AM + 2 * HOUR,
    );
    expect(waiting?.spanMinutes).toBe(0);
    const arrived = makeClosedSession(MONDAY_8AM, 8, {
      actualStartAtMs: MONDAY_8AM + 20 * MIN,
      transitSegments: [makeSegment({ startAtMs: MONDAY_8AM + 3 * HOUR, endAtMs: MONDAY_8AM + 3 * HOUR + 45 * MIN, paid: true, rateMultiplier: 1, countsTowardOvertime: true })],
    });
    const minutes = computeSessionMinutes(arrived, { ...COMPANY, transitPaid: true }, arrived.endAtMs ?? MONDAY_8AM);
    expect(minutes?.startMs).toBe(MONDAY_8AM + 20 * MIN);
    expect(minutes?.transitPaidMinutes).toBe(45);
  });

  test("D-25 el descanso no se descuenta", async () => {
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(2 * HOUR);
    await mustDispatch({ type: "LUNCH_START", kind: "REST" });
    time.travel(10 * MIN);
    const resumed = await mustDispatch({ type: "RESUME" });
    expect(computeSessionMinutes(resumed, COMPANY, time.now())?.pauseMinutes).toBe(0);
    time.travel(3 * HOUR);
    const closed = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 30 });
    expect(computeSessionMinutes(closed, COMPANY, closed.endAtMs ?? time.now())?.lunchMinutes).toBe(30);
  });

  test("D-26 el traslado hereda la tarifa fijada al iniciar", () => {
    const session = makeClosedSession(MONDAY_8AM, 8, {
      bookkeeping: { hourlyRateSnapshot: 25 },
      transitSegments: [makeSegment({ startAtMs: MONDAY_8AM + HOUR, endAtMs: MONDAY_8AM + 2 * HOUR, paid: true, rateMultiplier: 1, countsTowardOvertime: true })],
    });
    const statement = PayrollEngineService.buildStatement({
      periodStart: getWeekStart(MONDAY_8AM),
      periodEnd: getWeekEnd(MONDAY_8AM),
      sessions: [session],
      rates: { ...RATES, hourlyRate: 99 },
      company: COMPANY,
      policyId: CA_POLICY_ID,
      nowMs: MONDAY_8AM + 8 * 24 * HOUR,
    });
    expect(statement.lines.find((line) => line.kind === "TRANSIT")?.rate).toBe(25);
  });

  test("D-10 el PDF nombra las seis clases", () => {
    expect(PDF_INTEGRITY_COLORS.EDITADA.bg).toBe("#FF9C00");
    expect(PDF_INTEGRITY_COLORS.ELIMINADA.bg).toBe("#FF3D63");
    expect(PDF_INTEGRITY_COLORS.AUTO).toEqual({ bg: "#8A00FF", fg: "#FFFFFF" });
    expect(PDF_INTEGRITY_COLORS.TRANSITO.bg).toBe("#00E5FF");
    expect(PDF_INTEGRITY_COLORS.CANCELADA).toEqual({ bg: "#2B2BFF", fg: "#FFFFFF" });
    const intact = makeClosedSession(MONDAY_8AM, 8);
    expect(pdfIntegrityMarks(intact)).toContain("INTACTA");
    expect(pdfIntegrityBadgesHtml(intact, "es")).toContain("Intacta");
    expect(pdfIntegrityMarks(makeClosedSession(MONDAY_8AM, 1, { bookkeeping: { cancelled: true } }))).toContain("CANCELADA");
  });

  test("D-28 las claves de la tabla no llevan jerga", () => {
    const pairs: [string, string][] = [
      [es.states.ESPERANDO.sub, en.states.ESPERANDO.sub],
      [es.gps.noShowTitle, en.gps.noShowTitle],
      [es.gps.zoneExitTitle, en.gps.zoneExitTitle],
      [es.notifications.fgsBody, en.notifications.fgsBody],
      [es.notifications.fgsLive, en.notifications.fgsLive],
      [es.onboarding.permFgBody, en.onboarding.permFgBody],
      [es.today.geofenceOn, en.today.geofenceOn],
      [es.today.geofenceOff, en.today.geofenceOff],
      [es.notifications.monitoringStoppedTitle, en.notifications.monitoringStoppedTitle],
      [es.notifications.exitDecisionExpiredBody, en.notifications.exitDecisionExpiredBody],
      [es.health.coverage.title, en.health.coverage.title],
      [es.health.sensors.isMonitoring, en.health.sensors.isMonitoring],
      [es.ledger.SERVICE_RECOVERY, en.ledger.SERVICE_RECOVERY],
      [es.ledger.MONITORING_GAP, en.ledger.MONITORING_GAP],
      [es.ledger.TRACE_PURGED, en.ledger.TRACE_PURGED],
      [es.comprobante.coverageLine, en.comprobante.coverageLine],
    ];
    for (const [spanish, english] of pairs) {
      expect(spanish).not.toMatch(JARGON);
      expect(english).not.toMatch(JARGON);
    }
  });
});
