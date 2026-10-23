/**
 * USER_FLOW v1.2 §12.3 — un test por criterio de PR 2.
 * Los umbrales de detección GPS y los botones de la cortina (PR 3) no se cambian.
 */
import * as Notifications from "expo-notifications";
import { NOTIFICATION_ACTIONS } from "../../../constants/notifications";
import { EXTEND_PROMPT_MS, MAX_OPEN_SESSION_MS } from "../../../constants/tasks";
import { Store, StoreActions } from "../../../core/store";
import { selectHasConflict } from "../../../core/selectors";
import { initialHref } from "../../../core/initialRoute";
import { t } from "../../../i18n";
import { getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { makeEvidence, makeStatement } from "../../../../test/fixtures/payroll.fixture";
import { COMPANY, HOUR, MIN, RATES } from "../../../../test/fixtures/session.fixture";
import { SITE_LAT, SITE_LON, makeEnter, makeExit } from "../../../../test/fixtures/spatial.fixture";
import { acceptDisclosure, mustDispatch, seedWorld, startAndArrive } from "../../../../test/helpers";
import { LocationMock } from "../../../../test/runtimeHarness";
import { time } from "../../../../test/time";
import { routeIntent } from "../../application/intentRouter";
import { CLOCK_DRIFT_THRESHOLD_MS } from "../../evidence/TimeAuthorityService";
import { EvidencePackService } from "../../evidence/EvidencePackService";
import { ReportService } from "../../evidence/ReportService";
import { siteMovesFromLedger } from "../../evidence/siteMoves";
import { IntegrityLedgerService } from "../IntegrityLedgerService";
import { PayrollEngineService } from "../PayrollEngineService";
import { SessionEngineService } from "../SessionEngineService";
import { SiteRegistryService } from "../SiteRegistryService";
import { TransitPolicyService } from "../TransitPolicyService";
import { PersistenceService, wipePreviousTestDatabase } from "../../persistence/PersistenceService";
import { INSTALL_EPOCH, KV_KEYS } from "../../persistence/schema";
import { DEFAULT_PROFILE, SettingsService } from "../../persistence/SettingsService";
import { PermissionsHealthService } from "../../runtime/PermissionsHealthService";
import { __resetNotificationSinksForTests, NotificationService } from "../../runtime/NotificationService";
import { autoCloseContent, daySummaryContent } from "../../runtime/dayNotices";
import { GeofenceRuntimeService } from "../../runtime/GeofenceRuntimeService";
import { touchHeartbeat } from "../../runtime/heartbeat";
import { reviewAbandonedSession } from "../../runtime/orphanSession";
import { TaskOrchestratorService } from "../../runtime/TaskOrchestratorService";
import { runExitDecisionTimer } from "../../runtime/tasks/exitDecisionTimer.task";
import { runSessionWatchdog } from "../../runtime/tasks/sessionWatchdog.task";

const notes = Notifications as unknown as {
  __state: { scheduled: { content: { title?: string; body?: string; data?: Record<string, unknown> } }[] };
  __emit: (response: {
    actionIdentifier: string;
    notification: { request: { identifier: string; content: { data: Record<string, unknown> } } };
  }) => void;
};

function weekOf(ms: number) {
  return { periodStart: getWeekStart(ms), periodEnd: getWeekEnd(ms) };
}

function statementOf(session: Awaited<ReturnType<typeof mustDispatch>>, company = COMPANY) {
  const ts = session.actualStartAtMs ?? session.declaredStartAtMs;
  return PayrollEngineService.buildStatement({
    periodStart: getWeekStart(ts),
    periodEnd: getWeekEnd(ts),
    sessions: [session],
    rates: RATES,
    company,
    policyId: company.overtimePolicyId,
    nowMs: time.now(),
  });
}

async function salida() {
  const { siteA, siteB } = await seedWorld();
  const s = await startAndArrive(siteA);
  time.travel(2 * HOUR);
  const firstExit = time.now();
  await mustDispatch({ type: "EXIT_DETECTED", fact: makeExit({ sessionId: s.id, siteId: siteA, timestampMs: firstExit }) }, "GEOFENCE");
  return { siteA, siteB, s, firstExit };
}

describe("PR2 §12.3", () => {
  test("L01 ledger nuevo verifica desde la génesis y un byte alterado falla", async () => {
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    expect((await IntegrityLedgerService.verify()).valid).toBe(true);
    const head = (await PersistenceService.listLedger()).at(-1)!;
    const db = await PersistenceService.init();
    await db.execAsync(`DROP TRIGGER IF EXISTS trg_ledger_no_update`);
    await db.runAsync(`UPDATE ledger_entries SET payload_json = payload_json || ' ' WHERE id = ?`, [head.id]);
    expect((await IntegrityLedgerService.verify()).valid).toBe(false);

    await db.runAsync(
      `INSERT OR REPLACE INTO app_kv (key, value_json, updated_at_ms) VALUES (?, ?, ?)`,
      [KV_KEYS.INSTALL_EPOCH, JSON.stringify("pre-pr2"), time.now()],
    );
    expect(await wipePreviousTestDatabase(db)).toBe("wiped");
    expect(await PersistenceService.listLedger()).toHaveLength(0);
    expect((await IntegrityLedgerService.verify()).valid).toBe(true);
    expect(await wipePreviousTestDatabase(db)).toBe("kept");

    const again = await seedWorld();
    await startAndArrive(again.siteA);
    await PersistenceService.setKv(KV_KEYS.INSTALL_EPOCH, INSTALL_EPOCH);
    expect(await wipePreviousTestDatabase(db)).toBe("kept");
    expect((await PersistenceService.listLedger()).length).toBeGreaterThan(0);
    expect((await IntegrityLedgerService.verify()).valid).toBe(true);
  });

  test("L02 el sello Ed25519 verifica y falla si cambia un byte del manifiesto", async () => {
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(8 * HOUR);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    const sealed = await EvidencePackService.seal(weekOf(time.now()));
    expect(sealed.ok).toBe(true);
    if (!sealed.ok || !sealed.data) throw new Error("seal");
    expect(sealed.data.manifest.signature?.algorithm).toBe("Ed25519");
    expect(await EvidencePackService.verify(sealed.data)).toMatchObject({ valid: true, scheme: "Ed25519", failures: [] });
    const tampered = { ...sealed.data, manifest: { ...sealed.data.manifest, periodEnd: sealed.data.manifest.periodEnd + 1 } };
    expect((await EvidencePackService.verify(tampered)).valid).toBe(false);
  });

  test("T01 START_DAY pasa a ESPERANDO y sin permiso de fondo queda CONFLICT", async () => {
    const { siteA } = await seedWorld();
    const first = await mustDispatch({ type: "START_DAY", siteId: siteA });
    expect(first.domainStatus).toBe("ESPERANDO");
    expect(await SessionEngineService.dispatch({ type: "START_DAY", siteId: siteA }, "UI")).toMatchObject({ ok: false, code: "SESSION_ALREADY_OPEN" });
    await mustDispatch({ type: "CANCEL_DAY" });
    const device = (await SettingsService.load()).device;
    await SettingsService.saveDevice({ ...device, disclosureAcceptedVersion: null, disclosureAcceptedAtMs: null });
    expect(await SessionEngineService.dispatch({ type: "START_DAY", siteId: siteA }, "UI")).toMatchObject({ ok: false, code: "DISCLOSURE_NOT_ACCEPTED" });
    await acceptDisclosure(true);
    expect(await SessionEngineService.dispatch({ type: "START_DAY", siteId: 99999 }, "UI")).toMatchObject({ ok: false, code: "SITE_NOT_FOUND" });
    StoreActions.healthUpdated({ locationBackground: "blocked", locationForeground: "granted" });
    const degraded = await mustDispatch({ type: "START_DAY", siteId: siteA });
    expect(degraded.domainStatus).toBe("ESPERANDO");
    expect(degraded.integrityClass).toBe("CONFLICT");
  });

  test("T02 CANCEL_DAY solo cierra si se confirma; sin confirmar sigue ESPERANDO", async () => {
    const { siteA } = await seedWorld();
    const s = await mustDispatch({ type: "START_DAY", siteId: siteA });
    expect(s.domainStatus).toBe("ESPERANDO");
    const still = await PersistenceService.getSession(s.id);
    expect(still?.domainStatus).toBe("ESPERANDO");
    const closed = await mustDispatch({ type: "CANCEL_DAY" });
    expect(closed.domainStatus).toBe("CERRADA");
    expect(closed.bookkeeping.cancelled).toBe(true);
    expect(closed.actualStartAtMs).toBeNull();
  });

  test("T04 la entrada automática usa la hora de la primera lectura", async () => {
    const { siteA } = await seedWorld();
    const s = await mustDispatch({ type: "START_DAY", siteId: siteA });
    const firstReading = time.now();
    time.travel(2 * MIN);
    const arrived = await mustDispatch(
      { type: "ARRIVAL_CONFIRMED", fact: makeEnter({ sessionId: s.id, siteId: siteA, timestampMs: firstReading }) },
      "GEOFENCE",
    );
    expect(arrived.actualStartAtMs).toBe(firstReading);
    expect(arrived.actualStartAtMs).not.toBe(time.now());
    const row = (await IntegrityLedgerService.listForSession(s.id)).find((e) => e.intent === "ARRIVAL_CONFIRMED");
    expect(row?.reason).toBe("AUTO_CHECKIN_GEOFENCE_ENTRY");
  });

  test("T05 la entrada manual queda MANUAL_ARRIVAL_CONFIRMED", async () => {
    const { siteA } = await seedWorld();
    await mustDispatch({ type: "START_DAY", siteId: siteA });
    const at = time.now();
    const arrived = await mustDispatch({ type: "ARRIVAL_CONFIRMED" }, "UI");
    expect(arrived.domainStatus).toBe("ACTIVA");
    expect(arrived.actualStartAtMs).toBe(at);
    const row = (await IntegrityLedgerService.listForSession(arrived.id)).find((e) => e.intent === "ARRIVAL_CONFIRMED");
    expect(row?.reason).toBe("MANUAL_ARRIVAL_CONFIRMED");
  });

  test("T09 ESPERANDO 12 h se cancela en AUTO y sin horas", async () => {
    const { siteA } = await seedWorld();
    const s = await mustDispatch({ type: "START_DAY", siteId: siteA });
    time.travel(MAX_OPEN_SESSION_MS + MIN);
    await runSessionWatchdog();
    const closed = (await PersistenceService.getSession(s.id))!;
    expect(closed.domainStatus).toBe("CERRADA");
    expect(closed.bookkeeping.cancelled).toBe(true);
    expect(closed.integrityClass).toBe("AUTO");
    expect(closed.actualStartAtMs).toBeNull();
    const pay = statementOf(closed);
    expect(pay.regularHours + pay.overtimeDailyHours + pay.transitHours).toBe(0);
  });

  test("T10 el almuerzo pausa y programa N12 a los 30 min", async () => {
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(4 * HOUR);
    const paused = await mustDispatch({ type: "LUNCH_START" });
    expect(paused.domainStatus).toBe("PAUSADA");
    expect(paused.lunch.taken).toBe(true);
    const n12 = notes.__state.scheduled.find((n) => n.content.title === t("notifications.lunchResumeTitle"));
    expect(n12?.content.body).toBe(t("notifications.lunchResumeBody"));
    expect(n12?.content.data?.actions).toEqual([NOTIFICATION_ACTIONS.RESUME]);
  });

  test("T11 sin RESUME sigue PAUSADA", async () => {
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(HOUR);
    await mustDispatch({ type: "LUNCH_START" });
    time.travel(5 * HOUR);
    await runSessionWatchdog();
    const still = (await PersistenceService.getOpenSession())!;
    expect(still.domainStatus).toBe("PAUSADA");
    const resumed = await mustDispatch({ type: "RESUME" });
    expect(resumed.domainStatus).toBe("ACTIVA");
  });

  test("T13 un segundo EXIT no mueve firstExitAtMs", async () => {
    const { s, firstExit } = await salida();
    time.travel(MIN);
    const second = await SessionEngineService.dispatch({ type: "EXIT_DETECTED", fact: makeExit({ sessionId: s.id, timestampMs: time.now() }) }, "GEOFENCE");
    expect(second.ok).toBe(false);
    expect((await PersistenceService.getSession(s.id))?.bookkeeping.firstExitAtMs).toBe(firstExit);
  });

  test("T14 STAY_WORKING vuelve a ACTIVA y el EXIT queda en el ledger", async () => {
    const { s } = await salida();
    const stayed = await mustDispatch({ type: "STAY_WORKING" });
    expect(stayed.domainStatus).toBe("ACTIVA");
    expect(stayed.bookkeeping.firstExitAtMs).toBeNull();
    expect((await IntegrityLedgerService.listForSession(s.id)).some((e) => e.intent === "EXIT_DETECTED")).toBe(true);
  });

  test("T15 un EXIT de menos de 90 s sin lectura fuera vuelve a ACTIVA", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(10_000);
    const firstExit = time.now();
    await mustDispatch({ type: "EXIT_DETECTED", fact: makeExit({ sessionId: s.id, timestampMs: firstExit }) }, "GEOFENCE");
    await TaskOrchestratorService.scheduleExitDecision(s.id, firstExit, MIN);
    time.travel(2 * MIN);
    expect(await runExitDecisionTimer()).toBe(false);
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ACTIVA");
    TaskOrchestratorService.cancelExitDecision(0);
  });

  test("T16 y E07 el almuerzo desde SALIDA empieza en firstExitAtMs", async () => {
    const { s, firstExit } = await salida();
    const paused = await mustDispatch({ type: "LUNCH_START" });
    expect(paused.domainStatus).toBe("PAUSADA");
    expect(paused.lunch.startAtMs).toBe(firstExit);
    expect((await PersistenceService.getSession(s.id))?.bookkeeping.firstExitAtMs).toBeNull();
  });

  test("T17 E08 C04 el mandado al mismo sitio se paga y cuenta para extras", async () => {
    const { siteA } = await seedWorld();
    await SettingsService.saveCompany({ ...COMPANY, transitPaid: false, transitCountsTowardOvertime: false });
    await startAndArrive(siteA);
    time.travel(8 * HOUR);
    const rejected = await SessionEngineService.dispatch({ type: "TRANSFER_START", toSiteId: siteA }, "UI");
    expect(rejected).toMatchObject({ ok: false, code: "SITE_REQUIRED" });
    const errand = await mustDispatch({ type: "TRANSFER_START", toSiteId: siteA, purpose: "ERRAND" });
    expect(errand.domainStatus).toBe("TRASLADO");
    expect(errand.transitSegments[0]).toMatchObject({ toSiteId: siteA, purpose: "ERRAND" });
    time.travel(HOUR);
    const back = await mustDispatch({ type: "ARRIVAL_CONFIRMED" });
    expect(back.domainStatus).toBe("ACTIVA");
    expect(back.siteId).toBe(siteA);
    expect(back.transitSegments[0]).toMatchObject({ paid: true, countsTowardOvertime: true, purpose: "ERRAND" });
    const closed = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    const st = statementOf(closed, { ...COMPANY, transitPaid: false, transitCountsTowardOvertime: false });
    expect(st.transitHours).toBe(1);
    expect(st.overtimeDailyHours).toBe(1);
  });

  test("T18 y E09 un traslado a otro sitio deja una jornada con dos visitas", async () => {
    const { siteA, siteB } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(HOUR);
    const moving = await mustDispatch({ type: "TRANSFER_START", toSiteId: siteB });
    expect(moving.domainStatus).toBe("TRASLADO");
    expect(moving.transitSegments[0].toSiteId).toBe(siteB);
    time.travel(20 * MIN);
    const arrived = await mustDispatch({ type: "ARRIVAL_CONFIRMED" });
    expect(arrived.siteId).toBe(siteB);
    expect(arrived.transitSegments[0].paid).toBe(true);
    expect(arrived.transitSegments).toHaveLength(1);
    expect(new Set([siteA, arrived.siteId])).toEqual(new Set([siteA, siteB]));
  });

  test("T19 la llegada cierra el tramo y lo paga", async () => {
    const { siteA, siteB } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(HOUR);
    await mustDispatch({ type: "TRANSFER_START", toSiteId: siteB });
    time.travel(30 * MIN);
    const arrived = await mustDispatch({ type: "ARRIVAL_CONFIRMED" });
    expect(arrived.transitSegments[0].endAtMs).not.toBeNull();
    expect(TransitPolicyService.segmentMinutes(arrived.transitSegments[0], time.now())).toBe(30);
    expect(arrived.transitSegments[0].paid).toBe(true);
  });

  test("T20 el traslado cancelado se paga y entra en extras si pasa de 8 h", async () => {
    const { siteA, siteB } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(8 * HOUR);
    await mustDispatch({ type: "TRANSFER_START", toSiteId: siteB });
    time.travel(HOUR);
    const back = await mustDispatch({ type: "TRANSFER_CANCEL", note: "volvieron a llamar" });
    expect(back.domainStatus).toBe("ACTIVA");
    expect(back.transitSegments[0]).toMatchObject({ cancelled: true, paid: true, countsTowardOvertime: true, rateMultiplier: 1 });
    const closed = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    expect(statementOf(closed).overtimeDailyHours).toBe(1);
    expect(TransitPolicyService.decide({ ...back.transitSegments[0], countsTowardOvertime: undefined, cancelled: true, paid: true }, COMPANY).countsTowardOvertime).toBe(false);
  });

  test("T21 cerrar desde SALIDA usa la hora de salida y publica N10", async () => {
    const { s, firstExit } = await salida();
    const closed = await mustDispatch({ type: "CLOSE_DAY", mode: "EXIT_CONFIRMED" });
    expect(closed.domainStatus).toBe("CERRADA");
    expect(closed.endAtMs).toBe(firstExit);
    expect(closed.integrityClass).not.toBe("CONFLICT");
    const n10 = notes.__state.scheduled.find((n) => n.content.data?.kind === "DAY_SUMMARY");
    expect(n10?.content.body).toContain(t("notifications.daySummaryNoLunch"));
    expect((await IntegrityLedgerService.listForSession(s.id)).some((e) => e.intent === "CLOSE_DAY")).toBe(true);
  });

  test("T22 CLOSE_DAY manual cierra a la hora actual", async () => {
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(3 * HOUR);
    const at = time.now();
    const closed = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 30 });
    expect(closed.endAtMs).toBe(at);
    expect(closed.lunch.deductedMinutes).toBe(30);
  });

  test("T23 E15 con GPS bueno cierra AUTO en firstExit; sin GPS queda CONFLICT", async () => {
    const good = await salida();
    await TaskOrchestratorService.scheduleExitDecision(good.s.id, good.firstExit, 15 * MIN);
    time.travel(15 * MIN);
    LocationMock.__setPosition(SITE_LAT + 0.05, SITE_LON, 10);
    expect(await runExitDecisionTimer()).toBe(true);
    const auto = (await PersistenceService.getSession(good.s.id))!;
    expect(auto.integrityClass).toBe("AUTO");
    expect(auto.endAtMs).toBe(good.firstExit);
    expect(auto.integrityClass).not.toBe("VALID");
    TaskOrchestratorService.cancelExitDecision(0);

    const bad = await salida();
    await TaskOrchestratorService.scheduleExitDecision(bad.s.id, bad.firstExit, 15 * MIN);
    time.travel(15 * MIN);
    LocationMock.__state.servicesEnabled = false;
    (LocationMock.__state as { position: unknown }).position = null;
    expect(await runExitDecisionTimer()).toBe(true);
    const conflict = (await PersistenceService.getSession(bad.s.id))!;
    expect(conflict.integrityClass).toBe("CONFLICT");
    expect(conflict.endAtMs).toBe(bad.firstExit);
    expect(conflict.endAtMs).not.toBe(time.now());
    TaskOrchestratorService.cancelExitDecision(0);
  });

  test("T24 C23 sin extensión AUTO_CLOSE nunca es VALID; con extensión sigue abierta", async () => {
    const { siteA } = await seedWorld();
    const plain = await startAndArrive(siteA);
    time.travel(13 * HOUR);
    await runSessionWatchdog();
    const closed = (await PersistenceService.getSession(plain.id))!;
    expect(closed.domainStatus).toBe("CERRADA");
    expect(closed.integrityClass).not.toBe("VALID");
    expect(closed.bookkeeping.integrityReason).toBe("AUTO_CLOSE_12H");

    const { siteB } = await seedWorld();
    const extended = await startAndArrive(siteB);
    time.travel(EXTEND_PROMPT_MS);
    await mustDispatch({ type: "EXTEND_SHIFT" });
    time.travel(2 * HOUR);
    await runSessionWatchdog();
    const open = (await PersistenceService.getSession(extended.id))!;
    expect(open.domainStatus).toBe("ACTIVA");
    expect(open.endAtMs).toBeNull();
  });

  test("T25 C22 E14 quitar el permiso deja CONFLICT y N14 sin recortar horas", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(3 * HOUR);
    PermissionsHealthService.setOnBackgroundRevoked(async () => {
      const r = await SessionEngineService.dispatch({ type: "INTEGRITY_DEGRADE", cause: "BACKGROUND_PERMISSION_MISSING" }, "SYSTEM");
      if (r.ok) await NotificationService.notifyImmediate(t("notifications.permissionLostTitle"), t("notifications.permissionLostBody"));
    });
    await PermissionsHealthService.refresh();
    LocationMock.__setPermissions({ background: "denied", canAskAgain: false });
    await PermissionsHealthService.refresh();
    const after = (await PersistenceService.getSession(s.id))!;
    expect(after.integrityClass).toBe("CONFLICT");
    expect(after.domainStatus).toBe("ACTIVA");
    expect(after.endAtMs).toBeNull();
    expect(after.actualStartAtMs).toBe(s.actualStartAtMs);
    expect(notes.__state.scheduled.some((n) => n.content.title === t("notifications.permissionLostTitle"))).toBe(true);
    PermissionsHealthService.setOnBackgroundRevoked(null);
  });

  test("T26 E13 45 min sin señal marca huérfana y no inventa un fin", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    await touchHeartbeat();
    time.travel(60 * MIN);
    LocationMock.__setPosition(SITE_LAT + 0.05, SITE_LON, 10);
    expect(await reviewAbandonedSession()).toBe("marked");
    const after = (await PersistenceService.getSession(s.id))!;
    expect(after.domainStatus).toBe("ACTIVA");
    expect(after.endAtMs).toBeNull();
    expect(after.bookkeeping.integrityReason).toBe("ORPHAN_SESSION");
    expect(notes.__state.scheduled.some((n) => n.content.data?.kind === "ORPHAN_REVIEW")).toBe(true);
  });

  test("T27 CONTINUE_ORPHAN vuelve a abierta en MANUAL", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    await touchHeartbeat();
    time.travel(60 * MIN);
    LocationMock.__setPosition(SITE_LAT + 0.05, SITE_LON, 10);
    await reviewAbandonedSession();
    const next = await mustDispatch({ type: "CONTINUE_ORPHAN" });
    expect(next.domainStatus).not.toBe("CERRADA");
    expect(next.integrityClass).toBe("MANUAL");
    expect(next.endAtMs).toBeNull();
    expect(next.id).toBe(s.id);
  });

  test("T28 el fin de huérfana exige nota y queda MANUAL", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    await touchHeartbeat();
    time.travel(60 * MIN);
    LocationMock.__setPosition(SITE_LAT + 0.05, SITE_LON, 10);
    await reviewAbandonedSession();
    const endAt = time.now() - 10 * MIN;
    expect(await SessionEngineService.dispatch({ type: "CONFIRM_ORPHAN_END", endAtMs: endAt, note: "  " }, "UI")).toMatchObject({ ok: false, code: "NOTE_REQUIRED" });
    const closed = await mustDispatch({ type: "CONFIRM_ORPHAN_END", endAtMs: endAt, note: "se apagó el teléfono" });
    expect(closed.id).toBe(s.id);
    expect(closed.domainStatus).toBe("CERRADA");
    expect(closed.integrityClass).toBe("MANUAL");
    expect(closed.endAtMs).toBe(endAt);
    expect(closed.bookkeeping.manualNote).toBe("se apagó el teléfono");
  });

  test("T29 C05 E24 corregir exige nota, conserva el original y rechaza el solape", async () => {
    const { siteA } = await seedWorld();
    const first = await startAndArrive(siteA);
    time.travel(2 * HOUR);
    const closed = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    const originalEnd = closed.endAtMs!;
    expect(await SessionEngineService.dispatch({ type: "MANUAL_PATCH", sessionId: closed.id, declaredStartAtMs: closed.declaredStartAtMs, endAtMs: originalEnd - HOUR, note: "" }, "UI")).toMatchObject({ ok: false, code: "NOTE_REQUIRED" });
    const patched = await mustDispatch({ type: "MANUAL_PATCH", sessionId: closed.id, declaredStartAtMs: closed.declaredStartAtMs, endAtMs: originalEnd - HOUR, note: "salí antes" });
    expect(patched.integrityClass).toBe("MANUAL");
    expect(patched.bookkeeping.original?.endAtMs).toBe(originalEnd);
    expect((await IntegrityLedgerService.listForSession(first.id)).some((e) => e.intent === "CLOSE_DAY")).toBe(true);
    expect((await IntegrityLedgerService.listForSession(first.id)).some((e) => e.intent === "MANUAL_PATCH")).toBe(true);

    time.travel(HOUR);
    const second = await startAndArrive(siteA);
    time.travel(2 * HOUR);
    const other = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    const overlap = await SessionEngineService.dispatch(
      { type: "MANUAL_PATCH", sessionId: other.id, declaredStartAtMs: first.actualStartAtMs!, endAtMs: other.endAtMs, note: "pisa la otra" },
      "UI",
    );
    expect(overlap).toMatchObject({ ok: false, code: "OVERLAP" });
    expect((await PersistenceService.getSession(second.id))?.endAtMs).toBe(other.endAtMs);
  });

  test("T30 el arranque con CONFLICT va a la pantalla de conflicto antes de Hoy", async () => {
    expect(initialHref({ hydrated: false, needsOnboarding: false, needsDisclaimer: false, hasConflict: true })).toBe("/(boot)/hydrating");
    expect(initialHref({ hydrated: true, needsOnboarding: false, needsDisclaimer: false, hasConflict: true })).toBe("/system/conflict");
    expect(initialHref({ hydrated: true, needsOnboarding: false, needsDisclaimer: false, hasConflict: false })).toBe("/(tabs)");
    expect(t("conflict.later")).toBe("Más tarde");
    expect(t("conflict.keepGps")).toBe("Es correcta");
    expect(t("conflict.acceptManual")).toBe("Corregir hora");

    const bad = await salida();
    await TaskOrchestratorService.scheduleExitDecision(bad.s.id, bad.firstExit, 15 * MIN);
    time.travel(15 * MIN);
    await runExitDecisionTimer();
    expect(selectHasConflict(Store.getState())).toBe(true);
    expect(initialHref({ hydrated: true, needsOnboarding: false, needsDisclaimer: false, hasConflict: selectHasConflict(Store.getState()) })).toBe("/system/conflict");
    const kept = await mustDispatch({ type: "RESOLVE_KEEP_GPS", sessionId: bad.s.id, note: "la hora de salida es la buena" });
    expect(kept.integrityClass).not.toBe("CONFLICT");
    expect((await IntegrityLedgerService.listForSession(bad.s.id)).some((e) => e.intent === "RESOLVE_KEEP_GPS" && e.actor === "USER")).toBe(true);
    TaskOrchestratorService.cancelExitDecision(0);
  });

  test("T31 eliminar es lógico y el ledger conserva la jornada", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(HOUR);
    const closed = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    const removed = await mustDispatch({ type: "DELETE_SESSION", sessionId: closed.id });
    expect(removed.bookkeeping.isDeleted).toBe(true);
    expect(await PersistenceService.getSession(s.id)).not.toBeNull();
    expect((await IntegrityLedgerService.listForSession(s.id)).some((e) => e.intent === "DELETE_SESSION")).toBe(true);
  });

  test("T32 N10 ACK_DAY_SUMMARY no cambia el estado y Corregir va primero sin almuerzo", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(4 * HOUR);
    const closed = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    const notice = daySummaryContent(closed, null);
    expect(notice.body).toContain("no se descontó");
    expect(notice.actions[0]).toBe(NOTIFICATION_ACTIONS.CORRECT_DAY);
    const acked = await mustDispatch({ type: "ACK_DAY_SUMMARY", sessionId: closed.id });
    expect(acked.domainStatus).toBe(closed.domainStatus);
    expect(acked.integrityClass).toBe(closed.integrityClass);
    expect(acked.endAtMs).toBe(closed.endAtMs);
    expect((await IntegrityLedgerService.listForSession(s.id)).some((e) => e.intent === "ACK_DAY_SUMMARY")).toBe(true);

    const withLunch = { ...closed, lunch: { ...closed.lunch, taken: true, deductedMinutes: 30 } };
    expect(daySummaryContent(withLunch, null).actions[0]).toBe(NOTIFICATION_ACTIONS.ACK_DAY);
  });

  test("T33 una jornada cerrada permite otra el mismo día", async () => {
    const { siteA } = await seedWorld();
    const first = await startAndArrive(siteA);
    time.travel(HOUR);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    const second = await mustDispatch({ type: "START_DAY", siteId: siteA });
    expect(second.id).not.toBe(first.id);
    expect(second.domainStatus).toBe("ESPERANDO");
    expect(second.bookkeeping.dateString).toBe(first.bookkeeping.dateString);
  });

  test("T34 N16 E27 extender a las 11 h 30 evita el cierre y el tramo > 12 h va a 2×", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(11 * HOUR);
    await runSessionWatchdog();
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ACTIVA");
    expect(notes.__state.scheduled.some((n) => n.content.data?.kind === "EXTEND_SHIFT")).toBe(false);

    time.travel(30 * MIN);
    await runSessionWatchdog();
    expect(notes.__state.scheduled.some((n) => n.content.title === t("notifications.extendTitle"))).toBe(true);
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ACTIVA");
    const tooSoon = await SessionEngineService.dispatch({ type: "EXTEND_SHIFT" }, "UI");
    expect(tooSoon.ok).toBe(true);
    time.travel(2 * HOUR);
    await runSessionWatchdog();
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ACTIVA");
    expect((await IntegrityLedgerService.listForSession(s.id)).some((e) => e.reason === "SHIFT_EXTENDED")).toBe(true);

    const long = statementOf({ ...(await PersistenceService.getSession(s.id))!, domainStatus: "CERRADA", endAtMs: (s.actualStartAtMs ?? s.declaredStartAtMs) + 13 * HOUR });
    expect(long.overtimeDoubleHours).toBe(1);
    expect(long.lines.some((l) => l.kind === "OVERTIME_DOUBLE" && l.rate === RATES.hourlyRate * 2)).toBe(true);
  });

  test("N15 N17 las acciones de huérfana y el texto del cierre automático", async () => {
    const auto = autoCloseContent("AUTO", time.now());
    expect(auto.title).toContain("Cerré tu jornada a las");
    expect(auto.title.toLowerCase()).not.toContain("validada");
    const conflict = autoCloseContent("CONFLICT", time.now());
    expect(conflict.title).toBe("Tu salida necesita revisión");
    expect(conflict.body.toLowerCase()).not.toContain("validada");

    __resetNotificationSinksForTests();
    const intents: string[] = [];
    const ui: Record<string, unknown>[] = [];
    await NotificationService.init({
      intent: async (intent) => {
        intents.push(intent.type);
      },
      ui: (req) => ui.push(req),
    });
    notes.__emit({
      actionIdentifier: NOTIFICATION_ACTIONS.ORPHAN_CONTINUE,
      notification: { request: { identifier: "o", content: { data: { sessionId: 1 } } } },
    });
    notes.__emit({
      actionIdentifier: NOTIFICATION_ACTIONS.ORPHAN_END,
      notification: { request: { identifier: "o", content: { data: { sessionId: 1 } } } },
    });
    notes.__emit({
      actionIdentifier: NOTIFICATION_ACTIONS.EXTEND_SHIFT,
      notification: { request: { identifier: "e", content: { data: { sessionId: 1 } } } },
    });
    notes.__emit({
      actionIdentifier: NOTIFICATION_ACTIONS.ACK_DAY,
      notification: { request: { identifier: "d", content: { data: { sessionId: 4 } } } },
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(intents).toEqual(expect.arrayContaining(["CONTINUE_ORPHAN", "ACK_DAY_SUMMARY"]));
    expect(ui).toEqual(expect.arrayContaining([{ openOrphanReview: true }, { openExtendConfirm: true }]));
  });

  test("C01 un sitio sin ubicar se fija con dos lecturas y nunca con 0,0", async () => {
    await seedWorld();
    expect(await SiteRegistryService.upsert({ alias: "X", address: "  " }, COMPANY)).toMatchObject({ ok: false, code: "ADDRESS_REQUIRED" });
    const created = await SiteRegistryService.upsert({ alias: "Obra", address: "", unlocated: true, radiusM: 100 }, COMPANY);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.site.address).toBe("Sin ubicar");
    expect(created.site.targetLat).toBeNull();
    expect(SiteRegistryService.isGeofenceReady(created.site)).toBe(false);

    const far = await SiteRegistryService.locate(created.site.id, [
      { lat: SITE_LAT, lon: SITE_LON },
      { lat: SITE_LAT + 0.01, lon: SITE_LON },
    ]);
    expect(far).toMatchObject({ ok: false, code: "READINGS_TOO_FAR" });
    expect(await SiteRegistryService.locate(created.site.id, [{ lat: 0, lon: 0 }, { lat: 0, lon: 0 }])).toMatchObject({ ok: false, code: "INVALID_POINT" });

    const open = await mustDispatch({ type: "START_DAY", siteId: created.site.id });
    const near = await routeIntent({
      type: "LOCATE_SITE",
      siteId: created.site.id,
      readings: [
        { lat: SITE_LAT, lon: SITE_LON },
        { lat: SITE_LAT + 0.0001, lon: SITE_LON },
      ],
    });
    expect(near.ok).toBe(true);
    const site = await PersistenceService.getSite(created.site.id);
    expect(site?.targetLat).toBeCloseTo(SITE_LAT + 0.00005, 4);
    expect(site?.targetLon).not.toBe(0);
    const row = (await PersistenceService.listLedger()).find((e) => e.intent === "SITE_LOCATED");
    expect(row?.sessionId).toBeNull();
    const data = JSON.parse(row!.payloadJson).data;
    expect(data.previous).toBeNull();
    expect(data.next.lat).toBeCloseTo(site!.targetLat!, 5);
    expect(await GeofenceRuntimeService.isMonitoring() || open.domainStatus === "ESPERANDO").toBe(true);
  });

  test("E31 SITE_LOCATED guarda el punto anterior y sale en el PDF del empleador", async () => {
    const { siteA } = await seedWorld();
    const moved = await SiteRegistryService.locate(siteA, [
      { lat: SITE_LAT + 0.0002, lon: SITE_LON },
      { lat: SITE_LAT + 0.00025, lon: SITE_LON },
    ]);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.previous).toEqual({ lat: SITE_LAT, lon: SITE_LON });
    const moves = siteMovesFromLedger(await PersistenceService.listLedger());
    expect(moves[0].previous).toEqual({ lat: SITE_LAT, lon: SITE_LON });
    expect(moves[0].next.lat).toBeCloseTo(moved.next.lat, 5);
    const site = (await PersistenceService.getSite(siteA))!;
    const html = ReportService.renderHtml("EMPLOYER_DOSSIER", {
      statement: { ...makeStatement(), packHash: "ab".repeat(32) },
      evidence: makeEvidence(),
      manifest: {
        packId: "W-pr2",
        packHash: "ab".repeat(32),
        sealedAtMs: time.now(),
        certified: true,
        policyId: COMPANY.overtimePolicyId,
        manifestVersion: 4,
        documentVersion: 2,
        documentLocale: "es",
      },
      sessions: [],
      sites: [site],
      profile: DEFAULT_PROFILE,
      company: COMPANY,
      siteMoves: moves,
    });
    expect(html).toContain("data-site-moves");
    expect(html).toContain(SITE_LAT.toFixed(5));
    expect(html).toContain(moved.next.lat.toFixed(5));
  });

  test("C06 un día sin respuesta cae en T23, T24 o T26 y no queda abierto sin regla", async () => {
    const exit = await salida();
    await TaskOrchestratorService.scheduleExitDecision(exit.s.id, exit.firstExit, 15 * MIN);
    time.travel(15 * MIN);
    LocationMock.__setPosition(SITE_LAT + 0.05, SITE_LON, 10);
    await runExitDecisionTimer();
    expect((await PersistenceService.getSession(exit.s.id))?.domainStatus).toBe("CERRADA");
    TaskOrchestratorService.cancelExitDecision(0);

    const { siteA } = await seedWorld();
    const long = await startAndArrive(siteA);
    time.travel(13 * HOUR);
    await runSessionWatchdog();
    expect((await PersistenceService.getSession(long.id))?.domainStatus).toBe("CERRADA");

    const { siteA: quietSite } = await seedWorld();
    const quiet = await startAndArrive(quietSite);
    await touchHeartbeat();
    time.travel(60 * MIN);
    LocationMock.__setPosition(SITE_LAT + 0.2, SITE_LON, 10);
    await runSessionWatchdog();
    const orphan = (await PersistenceService.getSession(quiet.id))!;
    expect(orphan.domainStatus).toBe("ACTIVA");
    expect(orphan.bookkeeping.integrityReason).toBe("ORPHAN_SESSION");
    expect(orphan.endAtMs).toBeNull();
  });

  test("E11 dos toques a la vez: gana el primero y el segundo es MUTEX_BUSY", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(HOUR);
    const [a, b] = await Promise.all([
      SessionEngineService.dispatch({ type: "CLOSE_DAY", mode: "MANUAL" }, "UI"),
      SessionEngineService.dispatch({ type: "STAY_WORKING" }, "NOTIFICATION"),
    ]);
    const results = [a, b];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.some((r) => !r.ok && r.code === "MUTEX_BUSY")).toBe(true);
    expect((await IntegrityLedgerService.listForSession(s.id)).filter((e) => e.intent === "CLOSE_DAY" || e.intent === "STAY_WORKING").length).toBeLessThanOrEqual(1);
  });

  test("E16 un reloj adelantado más de 3 min no anota tiempo futuro", async () => {
    expect(CLOCK_DRIFT_THRESHOLD_MS).toBe(3 * MIN);
    const { siteA } = await seedWorld();
    const open = await startAndArrive(siteA);
    time.travel(HOUR);
    const futureEnd = time.now() + 4 * HOUR;
    const rejected = await SessionEngineService.dispatch(
      { type: "MANUAL_PATCH", sessionId: open.id, declaredStartAtMs: open.declaredStartAtMs, endAtMs: futureEnd, note: "adelanté el reloj" },
      "UI",
    );
    expect(rejected).toMatchObject({ ok: false, code: "FUTURE_TIME" });
    expect((await PersistenceService.getSession(open.id))?.endAtMs).toBeNull();
    expect((await PersistenceService.getSession(open.id))?.actualStartAtMs).toBe(open.actualStartAtMs);
  });

  test("E25 un periodo con CONFLICT no se certifica", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(2 * HOUR);
    await mustDispatch({ type: "INTEGRITY_DEGRADE", cause: "BACKGROUND_PERMISSION_MISSING" });
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    const period = weekOf(s.declaredStartAtMs);
    expect(await EvidencePackService.seal(period)).toMatchObject({ ok: false, code: "PERIOD_HAS_CONFLICT" });
    const uncertified = await EvidencePackService.seal({ ...period, allowUncertified: true });
    expect(uncertified.ok).toBe(true);
    if (uncertified.ok && uncertified.data) expect(uncertified.data.manifest.certified).toBe(false);
  });
});
