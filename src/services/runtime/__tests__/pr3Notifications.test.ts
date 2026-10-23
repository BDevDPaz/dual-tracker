/** PR 3: botones, silencio, almuerzo, traslado e integridad. */
import * as Notifications from "expo-notifications";
import { __state as notificationState } from "../../../../test/mocks/expo-notifications";
import { NOTIFICATION_ACTIONS, NOTIFICATION_CATEGORIES } from "../../../constants/notifications";
import { SessionEngineService } from "../../domain/SessionEngineService";
import { IntegrityLedgerService } from "../../domain/IntegrityLedgerService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { SettingsService } from "../../persistence/SettingsService";
import { KV_KEYS } from "../../persistence/schema";
import { t } from "../../../i18n";
import { HOUR, MIN } from "../../../../test/fixtures/session.fixture";
import { SITE_LAT, SITE_LON } from "../../../../test/fixtures/spatial.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../test/helpers";
import { time } from "../../../../test/time";
import { GeofenceRuntimeService } from "../GeofenceRuntimeService";
import { NotificationService } from "../NotificationService";
import { runDailyReminder } from "../tasks/dailyReminder.task";

type Note = { identifier?: string; content: { data?: { kind?: string; siteId?: number | null }; categoryIdentifier?: string }; trigger: { type?: string } };

function notes(): Note[] {
  return notificationState.scheduled as Note[];
}

async function wire() {
  const seen: { type: string }[] = [];
  await NotificationService.init({
    intent: async (intent, sessionId) => {
      seen.push(intent);
      await SessionEngineService.dispatch(intent, "NOTIFICATION");
    },
    ui: () => {},
  });
  return seen;
}

function press(action: string, sessionId: number, identifier: string, extra: Record<string, unknown> = {}) {
  (Notifications as unknown as { __emit: (r: unknown) => void }).__emit({
    actionIdentifier: action,
    notification: { request: { identifier, content: { data: { sessionId, ...extra } } } },
  });
}

async function settle(pred: () => boolean | Promise<boolean>) {
  const until = Date.now() + 2000;
  while (!(await pred()) && Date.now() < until) await new Promise((r) => setTimeout(r, 20));
}

describe("PR3 notificaciones", () => {
  test("N07: los botones van en orden y despachan la misma intención que la app", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(HOUR);
    await NotificationService.notifyExitDetected(s.id, time.now());
    const actions = notificationState.categories.get(NOTIFICATION_CATEGORIES.EXIT_DETECTION) as { identifier: string; options?: { opensAppToForeground?: boolean } }[];
    expect(actions.map((a) => a.identifier)).toEqual([
      NOTIFICATION_ACTIONS.END_SESSION,
      NOTIFICATION_ACTIONS.OTHER_WORK,
      NOTIFICATION_ACTIONS.ERRAND,
      NOTIFICATION_ACTIONS.STAY_WORKING,
    ]);
    expect(actions[1]?.options?.opensAppToForeground).toBe(true);
    expect(actions[3]?.options?.opensAppToForeground).toBe(false);
    const seen = await wire();
    press(NOTIFICATION_ACTIONS.END_SESSION, s.id, `dualtracker-exit-${s.id}`);
    await settle(() => seen.some((i) => i.type === "CLOSE_DAY"));
    expect(seen.map((i) => i.type)).toEqual(["CLOSE_DAY"]);
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("CERRADA");
    const close = (await IntegrityLedgerService.listForSession(s.id)).find((e) => e.intent === "CLOSE_DAY");
    expect(close?.actor).toBe("USER");
  });

  test("N07: Otro trabajo abre el traslado y Mandado despacha el recado", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(HOUR);
    const ui: { openDailySetup?: string | null }[] = [];
    await NotificationService.init({
      intent: async (intent) => {
        await SessionEngineService.dispatch(intent, "NOTIFICATION");
      },
      ui: (req) => {
        ui.push(req);
      },
    });
    press(NOTIFICATION_ACTIONS.OTHER_WORK, s.id, `dualtracker-exit-${s.id}`);
    await settle(() => ui.some((req) => req.openDailySetup === "transit"));
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ACTIVA");
    press(NOTIFICATION_ACTIONS.ERRAND, s.id, `dualtracker-exit-${s.id}`, { siteId: siteA });
    await settle(async () => (await PersistenceService.getSession(s.id))?.domainStatus === "TRASLADO");
    const moved = (await PersistenceService.getSession(s.id))!;
    expect(moved.domainStatus).toBe("TRASLADO");
    expect(moved.transitSegments.at(-1)?.purpose).toBe("ERRAND");
  });

  test("N03: No es trabajo borra la espera y no ficha", async () => {
    const { siteA } = await seedWorld();
    const settings = await SettingsService.load();
    await SettingsService.saveCompany({ ...settings.company, arrivalDwellMs: 2 * MIN, arrivalReadings: 2 });
    const s = await mustDispatch({ type: "START_DAY", siteId: siteA });
    await GeofenceRuntimeService.observeSample({ lat: SITE_LAT, lon: SITE_LON, accuracyM: 12, timestampMs: time.now() });
    expect(await PersistenceService.getKv(KV_KEYS.ARRIVAL_DWELL)).not.toBeNull();
    await NotificationService.init({
      intent: async () => {
        throw new Error("no debe fichar");
      },
      ui: (req) => {
        if (req.dismissArrival) void PersistenceService.deleteKv(KV_KEYS.ARRIVAL_DWELL);
      },
    });
    press(NOTIFICATION_ACTIONS.ARRIVAL_HOLD_DISMISS, s.id, `dualtracker-arrival-${s.id}`);
    await settle(async () => (await PersistenceService.getKv(KV_KEYS.ARRIVAL_DWELL)) == null);
    expect(await PersistenceService.getKv(KV_KEYS.ARRIVAL_DWELL)).toBeNull();
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ESPERANDO");
    expect((await IntegrityLedgerService.listForSession(s.id)).some((e) => e.intent === "ARRIVAL_CONFIRMED")).toBe(false);
  });

  test("C10/E23: N01 propone el último sitio activo y, si está archivado, abre el selector", async () => {
    const { siteA, siteB } = await seedWorld();
    const older = await startAndArrive(siteB);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    expect(older.id).toBeGreaterThan(0);
    await startAndArrive(siteA);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    expect(await NotificationService.scheduleDailyReminder("07:00", { force: true })).toBe(true);
    const asked = notes().at(-1)!;
    expect(asked.content.data?.siteId).toBe(siteA);
    expect(asked.content.data?.kind).toBe("DAILY_REMINDER");
    expect((asked.content as { body?: string }).body).toContain("Sitio A");
    const site = (await PersistenceService.getSite(siteA))!;
    await PersistenceService.updateSite({ ...site, active: false, archivedAtMs: time.now() });
    expect(await NotificationService.scheduleDailyReminder("07:00", { force: true })).toBe(true);
    const pick = notes().at(-1)!;
    expect(pick.content.data?.siteId).toBeNull();
    expect((pick.content as { body?: string }).body).toBe(t("notifications.reminderAskPick"));
  });

  test("N08: Terminé con más de 5 h sin almuerzo no cierra hasta que se responde", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(6 * HOUR);
    const seen = await wire();
    press(NOTIFICATION_ACTIONS.END_SESSION, s.id, `dualtracker-exit-${s.id}`);
    await settle(() => notes().some((n) => n.content.data?.kind === "LUNCH_BEFORE_CLOSE"));
    expect(seen.some((i) => i.type === "CLOSE_DAY")).toBe(false);
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ACTIVA");
    press(NOTIFICATION_ACTIONS.LUNCH_NONE, s.id, `dualtracker-lunch-ask-${s.id}`);
    await settle(() => seen.some((i) => i.type === "CLOSE_DAY"));
    const closed = (await PersistenceService.getSession(s.id))!;
    expect(closed.domainStatus).toBe("CERRADA");
    expect(closed.lunch.deductedMinutes).toBe(0);
  });

  test("N01/T35: silencio de hoy no cambia la hora y mañana sigue programado", async () => {
    await PersistenceService.init();
    expect(await NotificationService.scheduleDailyReminder("07:00", { force: true })).toBe(true);
    expect(notes().at(-1)?.trigger.type).toBe(Notifications.SchedulableTriggerInputTypes.DAILY);
    await NotificationService.silenceToday();
    expect((await SettingsService.load()).profile.dailyReminderTime).toBe("07:00");
    expect(notes().at(-1)?.trigger.type).toBe(Notifications.SchedulableTriggerInputTypes.DATE);
    time.travel(26 * HOUR);
    expect(await runDailyReminder()).toBe(true);
    expect(notes().at(-1)?.trigger.type).toBe(Notifications.SchedulableTriggerInputTypes.DAILY);
  });

  test("N12: el almuerzo avisa a los 30 min y no reanuda solo", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    const start = time.now();
    expect(await NotificationService.scheduleLunchResume(s.id, start)).toBe(true);
    const lunch = notes().find((n) => n.identifier === `dualtracker-lunch-${s.id}`);
    expect(lunch?.content.categoryIdentifier).toBe(NOTIFICATION_CATEGORIES.LUNCH_RESUME);
    expect((lunch?.trigger as { date?: Date }).date && new Date((lunch?.trigger as { date: Date }).date).getTime()).toBe(start + 30 * MIN);
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ACTIVA");
  });

  test("N13: en traslado avisa y Ya volví cancela el tramo", async () => {
    const { siteA, siteB } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(HOUR);
    SessionEngineService.setRuntimePorts({
      async syncRuntime(_effect, session) {
        if (session.domainStatus === "TRASLADO") await NotificationService.notifyTransit(session.id);
        else await NotificationService.dismissTransit(session.id);
      },
      async scheduleExitDecision() {},
      async cancelExitDecision() {},
    });
    try {
      await mustDispatch({ type: "TRANSFER_START", toSiteId: siteB });
      expect(notes().some((n) => n.identifier === `dualtracker-transit-${s.id}`)).toBe(true);
      const seen = await wire();
      press(NOTIFICATION_ACTIONS.TRANSIT_BACK, s.id, `dualtracker-transit-${s.id}`);
      await settle(() => seen.some((i) => i.type === "TRANSFER_CANCEL"));
      expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ACTIVA");
    } finally {
      SessionEngineService.setRuntimePorts({
        async syncRuntime() {},
        async scheduleExitDecision() {},
        async cancelExitDecision() {},
      });
    }
  });

  test("N14: la integridad degradada avisa con el id de la jornada", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    SessionEngineService.setRuntimePorts({
      async syncRuntime() {},
      async scheduleExitDecision() {},
      async cancelExitDecision() {},
      notifyIntegrity: async (id) => {
        await NotificationService.notifyIntegrity(id);
      },
    });
    try {
      await mustDispatch({ type: "INTEGRITY_DEGRADE", cause: "PROVIDER_LOSS" });
      expect(notes().some((n) => n.identifier === `dualtracker-integrity-${s.id}` && n.content.data?.kind === "INTEGRITY")).toBe(true);
      const repair = notificationState.categories.get(NOTIFICATION_CATEGORIES.INTEGRITY) as { identifier: string }[];
      expect(repair[0]?.identifier).toBe(NOTIFICATION_ACTIONS.REPAIR);
    } finally {
      SessionEngineService.setRuntimePorts({
        async syncRuntime() {},
        async scheduleExitDecision() {},
        async cancelExitDecision() {},
      });
    }
  });
});
