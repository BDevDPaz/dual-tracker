/**
 * Solicitud 7, PR 2 — H-1 (alta por pasos) y H-5 (retirar consentimiento /
 * repetir el alta). Decisiones de Byron (t154u):
 *  - H-1: intent propio SAVE_ONBOARDING_PROGRESS (no SAVE_SETTINGS) y marcador
 *    guardado `onboardingStep`; el recordatorio solo se programa en Listo.
 *  - H-5: con jornada abierta se rechaza como BACKUP_OPEN_SESSION; repetir el
 *    alta conserva el consentimiento; al retirar se cancela el recordatorio, la
 *    tarea diaria no lo vuelve a programar sin el alta completa y la retirada
 *    queda en el libro (CONSENT_WITHDRAWN).
 */
import { __state as notificationState } from "../../../../test/mocks/expo-notifications";
import { canEnterApp } from "../../../core/initialRoute";
import { selectNeedsDisclaimer, selectNeedsOnboarding } from "../../../core/selectors";
import { Store, StoreActions } from "../../../core/store";
import { DISCLOSURE_VERSION } from "../../../i18n/legal";
import { IntegrityLedgerService } from "../../domain/IntegrityLedgerService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { DEFAULT_DEVICE_PREFS, SettingsService } from "../../persistence/SettingsService";
import { KV_KEYS } from "../../persistence/schema";
import { runDailyReminder } from "../../runtime/tasks/dailyReminder.task";
import { routeIntent } from "../intentRouter";
import { HOUR } from "../../../../test/fixtures/session.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../test/helpers";
import { time } from "../../../../test/time";

const DAILY_REMINDER_ID = "dualtracker-daily-reminder";
const reminderScheduled = () => notificationState.scheduled.some((n) => n.identifier === DAILY_REMINDER_ID);
const reminderCancelled = () => notificationState.cancelled.includes(DAILY_REMINDER_ID);

/** Store desde lo guardado (como el arranque). */
async function hydrateFromDisk(): Promise<void> {
  const settings = await SettingsService.load();
  const snap = await PersistenceService.loadSnapshot();
  StoreActions.hydrated({ sessions: snap.sessions, sites: snap.sites, packs: snap.packs, settings, osKillDetected: false, hasPin: false, nowMs: time.now() });
}

/** Alta a medias: aviso vigente aceptado, sin completar, sin marcador. */
async function midOnboarding(): Promise<void> {
  await seedWorld();
  await SettingsService.saveDevice({ ...DEFAULT_DEVICE_PREFS, disclosureAcceptedVersion: DISCLOSURE_VERSION, disclosureAcceptedAtMs: time.now() });
  await SettingsService.saveProfile({ employeeName: "", hourlyRate: 20, language: "es", dailyReminderTime: "07:00" });
  await hydrateFromDisk();
}

function gateBlocked(): boolean {
  const s = Store.getState();
  return !canEnterApp({ needsOnboarding: selectNeedsOnboarding(s), needsDisclaimer: selectNeedsDisclaimer(s) });
}

describe("H-1 · SAVE_ONBOARDING_PROGRESS", () => {
  test("Perfil guarda nombre y hora sin completar el alta ni programar el recordatorio; sobreviven a una recarga", async () => {
    await midOnboarding();
    const r = await routeIntent({ type: "SAVE_ONBOARDING_PROGRESS", step: "ready", profile: { employeeName: "  Byron ", dailyReminderTime: "06:30" } });
    expect(r).toMatchObject({ ok: true });
    expect(reminderScheduled()).toBe(false);
    const disk = await SettingsService.load();
    expect(disk.profile.employeeName).toBe("Byron");
    expect(disk.profile.dailyReminderTime).toBe("06:30");
    expect(disk.device.onboardingCompleted).toBe(false);
    expect(disk.device.onboardingStep).toBe("ready");
    // Recarga simulada: el store sale de lo guardado.
    StoreActions.bootStarted();
    await hydrateFromDisk();
    expect(Store.getState().settings.profile.employeeName).toBe("Byron");
    expect(Store.getState().settings.device.onboardingStep).toBe("ready");
  });

  test("el marcador solo avanza y no toca el perfil sin `profile`", async () => {
    await midOnboarding();
    expect((await routeIntent({ type: "SAVE_ONBOARDING_PROGRESS", step: "profile" })).ok).toBe(true);
    expect((await SettingsService.load()).device.onboardingStep).toBe("profile");
    expect((await routeIntent({ type: "SAVE_ONBOARDING_PROGRESS", step: "permissions" })).ok).toBe(true);
    expect((await SettingsService.load()).device.onboardingStep).toBe("profile");
    expect((await SettingsService.load()).profile.employeeName).toBe("");
  });

  test("valida: sin aviso aceptado, nombre corto u hora inválida → rechazo sin escribir", async () => {
    await midOnboarding();
    expect(await routeIntent({ type: "SAVE_ONBOARDING_PROGRESS", step: "ready", profile: { employeeName: "B", dailyReminderTime: "07:00" } })).toMatchObject({ ok: false, code: "NAME_REQUIRED" });
    expect(await routeIntent({ type: "SAVE_ONBOARDING_PROGRESS", step: "ready", profile: { employeeName: "Byron", dailyReminderTime: "25:00" } })).toMatchObject({ ok: false, code: "INVALID_VALUE" });
    await SettingsService.saveDevice({ ...DEFAULT_DEVICE_PREFS });
    await hydrateFromDisk();
    expect(await routeIntent({ type: "SAVE_ONBOARDING_PROGRESS", step: "permissions" })).toMatchObject({ ok: false, code: "DISCLOSURE_NOT_ACCEPTED" });
    expect((await SettingsService.load()).device.onboardingStep).toBeNull();
  });

  test("con el alta completa no cambia nada; COMPLETE_ONBOARDING limpia el marcador y programa el recordatorio", async () => {
    await midOnboarding();
    await routeIntent({ type: "SAVE_ONBOARDING_PROGRESS", step: "ready", profile: { employeeName: "Byron", dailyReminderTime: "06:30" } });
    expect(reminderScheduled()).toBe(false);
    const done = await routeIntent({ type: "COMPLETE_ONBOARDING", profile: { employeeName: "Byron", hourlyRate: 20, language: "es", dailyReminderTime: "06:30" } });
    expect(done.ok).toBe(true);
    expect(reminderScheduled()).toBe(true);
    const device = (await SettingsService.load()).device;
    expect(device).toMatchObject({ onboardingCompleted: true, onboardingStep: null });
    expect((await routeIntent({ type: "SAVE_ONBOARDING_PROGRESS", step: "profile" })).ok).toBe(true);
    expect((await SettingsService.load()).device.onboardingStep).toBeNull();
  });
});

describe("H-5 · WITHDRAW_CONSENT", () => {
  test("con jornada abierta → BACKUP_OPEN_SESSION, sin cambios ni asiento", async () => {
    const { siteA } = await seedWorld();
    await hydrateFromDisk();
    const before = time.now();
    await startAndArrive(siteA);
    const r = await routeIntent({ type: "WITHDRAW_CONSENT" });
    expect(r).toMatchObject({ ok: false, code: "BACKUP_OPEN_SESSION", detail: "CONSENT_OPEN_SESSION" });
    const device = (await SettingsService.load()).device;
    expect(device.disclosureAcceptedVersion).toBe(DISCLOSURE_VERSION);
    expect(device.onboardingCompleted).toBe(true);
    const entries = await IntegrityLedgerService.listForPeriod(before - 1, time.now() + 1);
    expect(entries.some((e) => e.intent === "CONSENT_WITHDRAWN")).toBe(false);
  });

  test("retira: limpia versión y fecha, deja el alta sin completar, el gate bloquea y queda en el libro", async () => {
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    await hydrateFromDisk();
    const acceptedAt = Store.getState().settings.device.disclosureAcceptedAtMs;
    expect(gateBlocked()).toBe(false);
    const before = time.now();
    time.travel(HOUR);
    expect((await routeIntent({ type: "WITHDRAW_CONSENT" })).ok).toBe(true);
    expect((await SettingsService.load()).device).toMatchObject({
      disclosureAcceptedVersion: null,
      disclosureAcceptedAtMs: null,
      onboardingCompleted: false,
      onboardingStep: null,
    });
    expect(selectNeedsDisclaimer(Store.getState())).toBe(true);
    expect(selectNeedsOnboarding(Store.getState())).toBe(true);
    expect(gateBlocked()).toBe(true);
    const entry = (await IntegrityLedgerService.listForPeriod(before - 1, time.now() + 1)).find((e) => e.intent === "CONSENT_WITHDRAWN");
    expect(entry).toBeDefined();
    expect(entry).toMatchObject({ sessionId: null, actor: "USER", reason: "USER_WITHDRAWAL" });
    expect(JSON.parse(entry!.payloadJson ?? "{}")).toMatchObject({ data: { version: DISCLOSURE_VERSION, acceptedAtMs: acceptedAt } });
  });

  test("no borra nada: jornadas, perfil y empresa intactos; solo escribe KV DEVICE", async () => {
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    await hydrateFromDisk();
    const sessionsBefore = await PersistenceService.listSessions({ includeDeleted: true });
    const sitesBefore = await PersistenceService.listSites({ includeArchived: true });
    const packsBefore = await PersistenceService.listPacks();
    const settingsBefore = await SettingsService.load();
    const setKv = jest.spyOn(PersistenceService, "setKv");
    const deleteKv = jest.spyOn(PersistenceService, "deleteKv");
    expect((await routeIntent({ type: "WITHDRAW_CONSENT" })).ok).toBe(true);
    expect(setKv.mock.calls.map((c) => c[0])).toEqual([KV_KEYS.DEVICE]);
    expect(deleteKv).not.toHaveBeenCalled();
    setKv.mockRestore();
    deleteKv.mockRestore();
    expect(await PersistenceService.listSessions({ includeDeleted: true })).toEqual(sessionsBefore);
    expect(await PersistenceService.listSites({ includeArchived: true })).toEqual(sitesBefore);
    expect(await PersistenceService.listPacks()).toEqual(packsBefore);
    const after = await SettingsService.load();
    expect(after.profile).toEqual(settingsBefore.profile);
    expect(after.company).toEqual(settingsBefore.company);
  });

  test("sin asiento en el libro no se retira (PERSISTENCE_ERROR)", async () => {
    await seedWorld();
    await hydrateFromDisk();
    const append = jest.spyOn(IntegrityLedgerService, "append").mockRejectedValueOnce(new Error("disco lleno"));
    expect(await routeIntent({ type: "WITHDRAW_CONSENT" })).toMatchObject({ ok: false, code: "PERSISTENCE_ERROR" });
    append.mockRestore();
    expect((await SettingsService.load()).device.disclosureAcceptedVersion).toBe(DISCLOSURE_VERSION);
  });

  test("cancela el recordatorio y ni la tarea diaria ni el cambio de idioma lo vuelven a programar hasta completar el alta", async () => {
    await seedWorld();
    await hydrateFromDisk();
    expect(await runDailyReminder()).toBe(true);
    expect(reminderScheduled()).toBe(true);
    expect((await routeIntent({ type: "WITHDRAW_CONSENT" })).ok).toBe(true);
    expect(reminderCancelled()).toBe(true);
    notificationState.scheduled = [];
    time.travel(26 * HOUR);
    expect(await runDailyReminder()).toBe(false);
    expect((await routeIntent({ type: "SET_LANGUAGE", language: "en" })).ok).toBe(true);
    expect(reminderScheduled()).toBe(false);
    // Vuelve a aceptar y completa el alta (Listo): el recordatorio vuelve.
    expect((await routeIntent({ type: "ACCEPT_DISCLOSURE", version: DISCLOSURE_VERSION })).ok).toBe(true);
    expect(await runDailyReminder()).toBe(false);
    expect((await routeIntent({ type: "COMPLETE_ONBOARDING", profile: { employeeName: "Byron", hourlyRate: 20, language: "es", dailyReminderTime: "07:00" } })).ok).toBe(true);
    expect(reminderScheduled()).toBe(true);
    expect(await runDailyReminder()).toBe(true);
  });
});

describe("H-5 · REPEAT_ONBOARDING", () => {
  test("conserva el consentimiento (versión y fecha), deja el alta sin completar y cancela el recordatorio", async () => {
    await seedWorld();
    await hydrateFromDisk();
    const { disclosureAcceptedVersion, disclosureAcceptedAtMs } = Store.getState().settings.device;
    const before = time.now();
    expect((await routeIntent({ type: "REPEAT_ONBOARDING" })).ok).toBe(true);
    expect((await SettingsService.load()).device).toEqual({
      ...DEFAULT_DEVICE_PREFS,
      onboardingCompleted: false,
      onboardingStep: null,
      disclosureAcceptedVersion,
      disclosureAcceptedAtMs,
    });
    expect(selectNeedsDisclaimer(Store.getState())).toBe(false);
    expect(selectNeedsOnboarding(Store.getState())).toBe(true);
    expect(gateBlocked()).toBe(true);
    expect(reminderCancelled()).toBe(true);
    expect(await runDailyReminder()).toBe(false);
    // No es una retirada: no deja asiento.
    expect((await IntegrityLedgerService.listForPeriod(before - 1, time.now() + 1)).some((e) => e.intent === "CONSENT_WITHDRAWN")).toBe(false);
  });

  test("con jornada abierta → BACKUP_OPEN_SESSION y el alta sigue completa", async () => {
    const { siteA } = await seedWorld();
    await hydrateFromDisk();
    await startAndArrive(siteA);
    expect(await routeIntent({ type: "REPEAT_ONBOARDING" })).toMatchObject({ ok: false, code: "BACKUP_OPEN_SESSION" });
    expect((await SettingsService.load()).device.onboardingCompleted).toBe(true);
  });
});
