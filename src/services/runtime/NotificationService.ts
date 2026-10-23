/**
 * NotificationService — Runtime (Propuesta Técnica §4.4)
 * Fusiona Notifications.ts, notificationsAdapter y NotificationActionHandler (GEOTrack).
 * ============================================================================
 *  - Un solo servicio para permisos, canal Android, recordatorio diario,
 *    avisos inmediatos y acciones (cerrar / seguir / trasladar).
 *  - Las acciones REENTRAN a SessionEngine como intenciones (origen
 *    NOTIFICATION) a través de un sink inyectado; nunca tocan SQLite.
 *  - Payload validado: título y cuerpo vacíos no se programan.
 *  - Corrige GEOTrack: scheduleDailyReminder ya no cancela TODAS las
 *    notificaciones programadas (borraba también avisos de salida); cancela
 *    solo por identificador.
 */
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { PermissionState, SessionIntent, SessionPayrollPreview, SessionRecord, SpatialFact } from "../../core/contracts";
import { NOTIFICATION_ACTIONS, NOTIFICATION_CATEGORIES, NOTIFICATION_CHANNELS } from "../../constants/notifications";
import { reminderTitleForHour, t } from "../../i18n";
import { activeCorporateTimezone, formatTime, fromWallClock } from "../../utils/dateUtils";
import { FIRST_MEAL_DEADLINE_MIN, mealAlreadyStarted, planMealRestNotices } from "../domain/caPremiums";
import { computeSessionMinutes } from "../domain/PayrollEngineService";
import { serializeError } from "../../utils/serializeError";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { LoggingService } from "../persistence/LoggingService";
import { PersistenceService } from "../persistence/PersistenceService";
import { KV_KEYS } from "../persistence/schema";
import { SettingsService } from "../persistence/SettingsService";
import { criticalKindsOf, recordCriticalNotice, type CriticalNoticeKind } from "./criticalNotices";
import { autoCloseContent, daySummaryContent, extendShiftContent, lunchResumeContent, LUNCH_RESUME_AFTER_MS, orphanNoticeContent } from "./dayNotices";

const DAILY_REMINDER_ID = "dualtracker-daily-reminder";
const exitNotificationId = (sessionId: number) => `dualtracker-exit-${sessionId}`;
const exitReminderId = (sessionId: number) => `dualtracker-exit-remind-${sessionId}`;
const exitCloseId = (sessionId: number) => `dualtracker-exit-close-${sessionId}`;
const arrivalNotificationId = (sessionId: number) => `dualtracker-arrival-${sessionId}`;
export const EXIT_REMINDER_AFTER_MS = 10 * 60_000;
export const LUNCH_PROMPT_WAIT_MS = 15 * 60_000;
const integrityNotificationId = (sessionId: number) => `dualtracker-integrity-${sessionId}`;
const DEDUPE_THRESHOLD_MS = 3000;
const lastScheduled = new Map<string, number>();

interface SilenceMark {
  date: string;
}
interface LunchPrompt {
  sessionId: number;
  deadlineMs: number;
}
interface ReregisterGuard {
  sessionId: number;
  siteId: number;
  atMs: number;
}

function corporateDateKey(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: activeCorporateTimezone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

function addDaysKey(key: string, days: number): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d + days);
  const next = new Date(utc);
  return { y: next.getUTCFullYear(), m: next.getUTCMonth() + 1, d: next.getUTCDate() };
}

/** Última jornada no cancelada. Si ese sitio ya no está activo, no se hereda otro. */
async function reminderTarget(): Promise<{ siteId: number | null; name: string | null }> {
  try {
    const sessions = await PersistenceService.listSessions();
    const usable = sessions.filter((s) => !s.bookkeeping.cancelled && !s.bookkeeping.isDeleted);
    usable.sort((a, b) => (b.actualStartAtMs ?? b.declaredStartAtMs) - (a.actualStartAtMs ?? a.declaredStartAtMs));
    const last = usable[0];
    if (!last?.siteId) return { siteId: null, name: null };
    const site = await PersistenceService.getSite(last.siteId);
    if (!site?.active) return { siteId: null, name: null };
    return { siteId: site.id, name: site.alias };
  } catch {
    return { siteId: null, name: null };
  }
}

function button(identifier: string, buttonTitle: string, opensAppToForeground = false) {
  return { identifier, buttonTitle, options: { opensAppToForeground } };
}

async function scheduleAt(identifier: string, content: Record<string, unknown>, atMs: number): Promise<void> {
  if (atMs <= TimeAuthorityService.now()) return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier,
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(atMs),
        channelId: Platform.OS === "android" ? NOTIFICATION_CHANNELS.DEFAULT : undefined,
      },
    });
  } catch (error) {
    LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "No se pudo programar el aviso", serializeError(error));
  }
}

export type NotificationIntentSink = (intent: SessionIntent, sessionId: number | null) => Promise<void>;
export type NotificationUiSink = (req: {
  openExitModal?: boolean;
  openDailySetup?: "start" | "transit" | null;
  openExtendConfirm?: boolean;
  correctSessionId?: number | null;
  openOrphanReview?: boolean;
  openHealth?: boolean;
  openMoveSite?: boolean;
  dismissArrival?: boolean;
}) => void;

let intentSink: NotificationIntentSink | null = null;
let uiSink: NotificationUiSink | null = null;
let responseSub: Notifications.EventSubscription | null = null;

/** El listener vive en el módulo. Los tests lo sueltan para volver a cablearlo. */
export function __resetNotificationSinksForTests(): void {
  responseSub?.remove();
  responseSub = null;
  intentSink = null;
  uiSink = null;
}

function isSpam(key: string): boolean {
  const now = TimeAuthorityService.now();
  const last = lastScheduled.get(key);
  if (last && now - last < DEDUPE_THRESHOLD_MS) return true;
  lastScheduled.set(key, now);
  return false;
}

function toPermissionState(p: Notifications.NotificationPermissionsStatus): PermissionState {
  if (p.status === "granted") return "granted";
  if (p.status === "denied") return p.canAskAgain ? "denied" : "blocked";
  return "unknown";
}

/**
 * Samsung One UI no renombra un canal ya creado. Si el nombre guardado no es
 * el del idioma activo, se borra y se vuelve a crear. Si coincide, no se toca
 * (borrar siempre resetearía el ajuste del usuario en cada arranque).
 */
async function upsertChannel(
  id: string,
  cfg: { name: string; importance: Notifications.AndroidImportance; vibrationPattern?: number[] },
): Promise<void> {
  const existing = await Notifications.getNotificationChannelAsync(id).catch(() => null);
  if (existing && existing.name !== cfg.name) {
    await Notifications.deleteNotificationChannelAsync(id).catch(() => {});
  }
  await Notifications.setNotificationChannelAsync(id, cfg);
}

async function ensureChannels(): Promise<void> {
  if (Platform.OS !== "android") return;
  await upsertChannel(NOTIFICATION_CHANNELS.DEFAULT, {
    name: t("notifications.channelDefault"),
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
  });
  await upsertChannel(NOTIFICATION_CHANNELS.FOREGROUND_WORK, {
    name: t("notifications.channelForeground"),
    importance: Notifications.AndroidImportance.LOW,
  });
}

async function ensureCategories(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.REST_BREAK, [
    { identifier: NOTIFICATION_ACTIONS.REST_TAKEN, buttonTitle: t("notifications.restTaken"), options: { opensAppToForeground: false } },
  ]);
  const ack = { identifier: NOTIFICATION_ACTIONS.ACK_DAY, buttonTitle: t("notifications.actionAck"), options: { opensAppToForeground: false } };
  const correct = { identifier: NOTIFICATION_ACTIONS.CORRECT_DAY, buttonTitle: t("notifications.actionCorrect"), options: { opensAppToForeground: true } };
  await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.DAY_SUMMARY, [ack, correct]);
  await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.DAY_SUMMARY_CORRECT, [correct, ack]);
  await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.ORPHAN_REVIEW, [
    { identifier: NOTIFICATION_ACTIONS.ORPHAN_CONTINUE, buttonTitle: t("notifications.actionOrphanContinue"), options: { opensAppToForeground: false } },
    { identifier: NOTIFICATION_ACTIONS.ORPHAN_END, buttonTitle: t("notifications.actionOrphanEnd"), options: { opensAppToForeground: true } },
  ]);
  await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.EXTEND_SHIFT, [
    { identifier: NOTIFICATION_ACTIONS.EXTEND_SHIFT, buttonTitle: t("notifications.actionExtend"), options: { opensAppToForeground: true } },
  ]);
  await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.LUNCH_RESUME, [
    { identifier: NOTIFICATION_ACTIONS.RESUME, buttonTitle: t("notifications.actionResume"), options: { opensAppToForeground: false } },
  ]);
  await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.EXIT_DETECTION, [
    button(NOTIFICATION_ACTIONS.END_SESSION, t("notifications.actionDoneToday")),
    button(NOTIFICATION_ACTIONS.OTHER_WORK, t("notifications.actionOtherWork"), true),
    button(NOTIFICATION_ACTIONS.ERRAND, t("notifications.actionErrand")),
    button(NOTIFICATION_ACTIONS.STAY_WORKING, t("notifications.actionStillHere")),
  ]);
  await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.DAILY_REMINDER, [
    button(NOTIFICATION_ACTIONS.START_DAY, t("notifications.actionStartDay")),
    button(NOTIFICATION_ACTIONS.SILENCE_DAY, t("notifications.actionSilenceDay")),
  ]);
  await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.ARRIVAL_HOLD, [
    button(NOTIFICATION_ACTIONS.ARRIVAL_NOW, t("notifications.actionStartNow")),
    button(NOTIFICATION_ACTIONS.ARRIVAL_HOLD_DISMISS, t("notifications.actionNotWork")),
  ]);
  await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.LUNCH_BEFORE_CLOSE, [
    button(NOTIFICATION_ACTIONS.LUNCH_30, t("notifications.actionLunch30")),
    button(NOTIFICATION_ACTIONS.LUNCH_60, t("notifications.actionLunch60")),
    button(NOTIFICATION_ACTIONS.LUNCH_NONE, t("notifications.actionLunchNone")),
  ]);
  await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.TRANSIT, [
    button(NOTIFICATION_ACTIONS.TRANSIT_BACK, t("notifications.actionBack")),
    button(NOTIFICATION_ACTIONS.TRANSIT_ARRIVED, t("notifications.actionArrived")),
  ]);
  await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.INTEGRITY, [
    button(NOTIFICATION_ACTIONS.REPAIR, t("notifications.actionRepair"), true),
  ]);
  await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.OFFSITE, [
    button(NOTIFICATION_ACTIONS.OFFSITE_YES, t("notifications.actionYesHere"), true),
  ]);
  await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.RETURN_OR_FINISH, [
    button(NOTIFICATION_ACTIONS.RETURN_TO_SITE, t("notifications.actionReturn")),
    button(NOTIFICATION_ACTIONS.FINISH_SHIFT, t("notifications.actionFinish")),
  ]);
}

/** Valida el payload de una respuesta: sessionId numérico positivo o null. */
function parseSessionId(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const raw = (data as Record<string, unknown>).sessionId;
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function noteOsCritical(data: Record<string, unknown> | undefined, acceptedByOs: boolean): Promise<void> {
  const kinds = criticalKindsOf(data);
  if (!kinds.length) return;
  const sessionId = parseSessionId(data);
  for (const kind of kinds) {
    await recordCriticalNotice({
      sessionId,
      kind,
      phase: "CREATED",
      channel: "OS_NOTIFICATION",
      acceptedByOs,
      feedbackShown: false,
      userAcknowledged: false,
    });
  }
}

async function acknowledgeOsCritical(data: unknown): Promise<void> {
  const kinds: CriticalNoticeKind[] = criticalKindsOf(data);
  if (!kinds.length) return;
  const sessionId = parseSessionId(data);
  for (const kind of kinds) {
    await recordCriticalNotice({
      sessionId,
      kind,
      phase: "ACKNOWLEDGED",
      channel: "OS_NOTIFICATION",
      acceptedByOs: null,
      feedbackShown: true,
      userAcknowledged: true,
    });
  }
}

function dataOf(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

function positiveInt(data: Record<string, unknown>, key: string): number | null {
  const raw = data[key];
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function rejectIfStale(sessionId: number | null, identifier: string | undefined): Promise<boolean> {
  if (sessionId == null) return false;
  const session = await PersistenceService.getSession(sessionId);
  const open = session && session.domainStatus !== "CERRADA" && !session.bookkeeping.cancelled && !session.bookkeeping.isDeleted;
  if (open) return false;
  if (identifier) await Notifications.dismissNotificationAsync(identifier).catch(() => {});
  await NotificationService.notifyImmediate(t("notifications.staleActionTitle"), t("notifications.staleActionBody"), { kind: "STALE_ACTION" }, { identifier: "dualtracker-stale-action" });
  return true;
}

async function needsLunchPrompt(sessionId: number): Promise<boolean> {
  const session = await PersistenceService.getSession(sessionId);
  if (!session || session.domainStatus === "CERRADA" || session.domainStatus === "ESPERANDO") return false;
  if (mealAlreadyStarted([session])) return false;
  const company = (await SettingsService.load()).company;
  const minutes = computeSessionMinutes(session, company, TimeAuthorityService.now());
  if (!minutes) return false;
  return minutes.workMinutes + minutes.transitPaidMinutes > FIRST_MEAL_DEADLINE_MIN;
}

async function closeFromNotification(sessionId: number, lunchDeductedMinutes?: number): Promise<void> {
  const pending = await PersistenceService.getKv<{ sessionId: number; firstExitAtMs: number; siteId: number | null; reliable: boolean }>(KV_KEYS.PENDING_EXIT);
  const session = await PersistenceService.getSession(sessionId);
  if (pending && pending.sessionId === sessionId && session?.domainStatus === "ACTIVA") {
    const fact: SpatialFact = {
      sessionId,
      type: "EXIT",
      lat: null,
      lon: null,
      accuracyM: null,
      timestampMs: pending.firstExitAtMs,
      source: "unknown",
      reliable: pending.reliable,
      siteId: pending.siteId,
    };
    await intentSink?.({ type: "EXIT_DETECTED", fact }, sessionId);
  }
  const close: SessionIntent =
    lunchDeductedMinutes === undefined
      ? { type: "CLOSE_DAY", mode: "EXIT_CONFIRMED" }
      : { type: "CLOSE_DAY", mode: "EXIT_CONFIRMED", lunchDeductedMinutes };
  await intentSink?.(close, sessionId);
  await NotificationService.cancelExitFollowUps(sessionId);
  await PersistenceService.deleteKv(KV_KEYS.LUNCH_PROMPT).catch(() => {});
  await Notifications.cancelScheduledNotificationAsync(`dualtracker-lunch-close-${sessionId}`).catch(() => {});
}

async function handleResponse(response: Notifications.NotificationResponse): Promise<void> {
  const action = response.actionIdentifier;
  const data = response.notification.request.content.data;
  const fields = dataOf(data);
  const sessionId = parseSessionId(data);
  const identifier = response.notification.request.identifier;
  LoggingService.log("AZUL", "NOTIFICACION", "INFO", "Acción de notificación recibida", { action, sessionId });
  await acknowledgeOsCritical(data).catch((error) => {
    LoggingService.log("NARANJA", "NOTIFICACION", "WARN", "No se pudo anotar el toque del aviso", serializeError(error));
  });
  try {
    const sessionBound =
      action === NOTIFICATION_ACTIONS.STAY_WORKING ||
      action === NOTIFICATION_ACTIONS.END_SESSION ||
      action === NOTIFICATION_ACTIONS.ERRAND ||
      action === NOTIFICATION_ACTIONS.LUNCH_30 ||
      action === NOTIFICATION_ACTIONS.LUNCH_60 ||
      action === NOTIFICATION_ACTIONS.LUNCH_NONE ||
      action === NOTIFICATION_ACTIONS.RESUME ||
      action === NOTIFICATION_ACTIONS.TRANSIT_BACK ||
      action === NOTIFICATION_ACTIONS.TRANSIT_ARRIVED ||
      action === NOTIFICATION_ACTIONS.ARRIVAL_NOW ||
      action === NOTIFICATION_ACTIONS.FINISH_SHIFT;
    if (sessionBound && (await rejectIfStale(sessionId, identifier))) return;
    switch (action) {
      case NOTIFICATION_ACTIONS.STAY_WORKING:
        if (sessionId) {
          await NotificationService.cancelExitFollowUps(sessionId);
          await intentSink?.({ type: "STAY_WORKING" }, sessionId);
        }
        break;
      case NOTIFICATION_ACTIONS.END_SESSION:
        if (!sessionId) break;
        if (await needsLunchPrompt(sessionId)) {
          await NotificationService.askLunchBeforeClose(sessionId);
          break;
        }
        await closeFromNotification(sessionId);
        break;
      case NOTIFICATION_ACTIONS.LUNCH_30:
      case NOTIFICATION_ACTIONS.LUNCH_60:
      case NOTIFICATION_ACTIONS.LUNCH_NONE:
        if (sessionId) {
          const minutes = action === NOTIFICATION_ACTIONS.LUNCH_30 ? 30 : action === NOTIFICATION_ACTIONS.LUNCH_60 ? 60 : 0;
          await closeFromNotification(sessionId, minutes);
        }
        break;
      case NOTIFICATION_ACTIONS.OTHER_WORK:
      case NOTIFICATION_ACTIONS.TRANSFER:
        if (sessionId) await NotificationService.cancelExitFollowUps(sessionId);
        uiSink?.({ openDailySetup: "transit" });
        break;
      case NOTIFICATION_ACTIONS.ERRAND:
        if (sessionId) {
          const siteId = positiveInt(fields, "siteId") ?? (await PersistenceService.getSession(sessionId))?.siteId ?? null;
          await NotificationService.cancelExitFollowUps(sessionId);
          if (siteId) await intentSink?.({ type: "TRANSFER_START", toSiteId: siteId, purpose: "ERRAND" }, sessionId);
        }
        break;
      case NOTIFICATION_ACTIONS.START_DAY: {
        const siteId = positiveInt(fields, "siteId");
        if (siteId) await intentSink?.({ type: "START_DAY", siteId }, null);
        else uiSink?.({ openDailySetup: "start" });
        break;
      }
      case NOTIFICATION_ACTIONS.SILENCE_DAY:
        await NotificationService.silenceToday();
        break;
      case NOTIFICATION_ACTIONS.ARRIVAL_NOW:
        if (sessionId) await intentSink?.({ type: "ARRIVAL_CONFIRMED" }, sessionId);
        break;
      case NOTIFICATION_ACTIONS.ARRIVAL_HOLD_DISMISS:
        uiSink?.({ dismissArrival: true });
        if (sessionId) await Notifications.dismissNotificationAsync(arrivalNotificationId(sessionId)).catch(() => {});
        break;
      case NOTIFICATION_ACTIONS.TRANSIT_BACK:
        if (sessionId) await intentSink?.({ type: "TRANSFER_CANCEL" }, sessionId);
        break;
      case NOTIFICATION_ACTIONS.TRANSIT_ARRIVED:
        if (sessionId) await intentSink?.({ type: "ARRIVAL_CONFIRMED" }, sessionId);
        break;
      case NOTIFICATION_ACTIONS.REPAIR:
        uiSink?.({ openHealth: true });
        break;
      case NOTIFICATION_ACTIONS.OFFSITE_YES:
        uiSink?.({ openMoveSite: true });
        break;
      case NOTIFICATION_ACTIONS.RETURN_TO_SITE:
        await PersistenceService.deleteKv(KV_KEYS.REREGISTER_EXIT_GUARD).catch(() => {});
        if (identifier) await Notifications.dismissNotificationAsync(identifier).catch(() => {});
        break;
      case NOTIFICATION_ACTIONS.FINISH_SHIFT: {
        const guard = await PersistenceService.getKv<ReregisterGuard>(KV_KEYS.REREGISTER_EXIT_GUARD);
        await PersistenceService.deleteKv(KV_KEYS.REREGISTER_EXIT_GUARD).catch(() => {});
        if (sessionId && guard && guard.sessionId === sessionId) {
          const fact: SpatialFact = {
            sessionId,
            type: "EXIT",
            lat: null,
            lon: null,
            accuracyM: null,
            timestampMs: guard.atMs,
            source: "unknown",
            reliable: true,
            reason: "REREGISTER_EXIT",
            siteId: guard.siteId,
          };
          await intentSink?.({ type: "EXIT_DETECTED", fact }, sessionId);
        }
        break;
      }
      case NOTIFICATION_ACTIONS.DAILY_SETUP:
        uiSink?.({ openDailySetup: "start" });
        break;
      case NOTIFICATION_ACTIONS.REST_TAKEN:
        if (sessionId) await intentSink?.({ type: "ACK_REST", taken: true }, sessionId);
        break;
      case NOTIFICATION_ACTIONS.ACK_DAY:
        if (sessionId) await intentSink?.({ type: "ACK_DAY_SUMMARY", sessionId }, sessionId);
        break;
      case NOTIFICATION_ACTIONS.CORRECT_DAY:
        uiSink?.({ correctSessionId: sessionId });
        break;
      case NOTIFICATION_ACTIONS.ORPHAN_CONTINUE:
        if (sessionId) await intentSink?.({ type: "CONTINUE_ORPHAN" }, sessionId);
        break;
      case NOTIFICATION_ACTIONS.ORPHAN_END:
        uiSink?.({ openOrphanReview: true });
        break;
      case NOTIFICATION_ACTIONS.EXTEND_SHIFT:
        uiSink?.({ openExtendConfirm: true });
        break;
      case NOTIFICATION_ACTIONS.RESUME:
        if (sessionId) await intentSink?.({ type: "RESUME" }, sessionId);
        break;
      default:
        if (action === Notifications.DEFAULT_ACTION_IDENTIFIER) {
          const kind = fields.kind;
          if (kind === "EXIT_DECISION") uiSink?.({ openExitModal: true });
          if (kind === "DAILY_REMINDER") uiSink?.({ openDailySetup: "start" });
          if (kind === "INTEGRITY") uiSink?.({ openHealth: true });
          if (kind === "EXIT_CLOSE" && sessionId) await intentSink?.({ type: "AUTO_CLOSE", cause: "EXIT_DECISION_EXPIRED", confirmedOutside: false }, sessionId);
          if (kind === "LUNCH_CLOSE" && sessionId) await closeFromNotification(sessionId, 0);
        }
    }
  } catch (error) {
    LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "Fallo manejando acción de notificación", serializeError(error));
  }
}

export const NotificationService = {
  /** Registro de handler, canales, categorías y listener de respuestas. Idempotente. */
  async init(sinks: { intent: NotificationIntentSink; ui: NotificationUiSink }): Promise<void> {
    intentSink = sinks.intent;
    uiSink = sinks.ui;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    try {
      await ensureChannels();
      await ensureCategories();
    } catch (error) {
      LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "Fallo configurando notificaciones", serializeError(error));
    }
    if (!responseSub) {
      responseSub = Notifications.addNotificationResponseReceivedListener((r) => {
        handleResponse(r).catch(() => {});
      });
      // Respuesta que abrió la app en frío.
      const last = await Notifications.getLastNotificationResponseAsync().catch(() => null);
      if (last) await handleResponse(last);
    }
  },

  async getPermission(): Promise<PermissionState> {
    try {
      return toPermissionState(await Notifications.getPermissionsAsync());
    } catch {
      return "unknown";
    }
  },

  async requestPermission(): Promise<PermissionState> {
    try {
      const current = await Notifications.getPermissionsAsync();
      if (current.status === "granted") return "granted";
      return toPermissionState(await Notifications.requestPermissionsAsync());
    } catch {
      return "unknown";
    }
  },

  /**
   * Vuelve a registrar canales, botones de acción y el recordatorio diario
   * con el idioma activo. Lo llama el cambio de idioma (y el alta).
   */
  async refreshLocalization(reminderTime: string): Promise<void> {
    try {
      await ensureChannels();
      await ensureCategories();
      await NotificationService.scheduleDailyReminder(reminderTime, { force: true });
    } catch (error) {
      LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "Fallo actualizando textos de notificación", serializeError(error));
    }
  },

  /** Recordatorio diario (N01). timeString "HH:mm". El silencio de hoy no cambia la hora del perfil. */
  async scheduleDailyReminder(timeString: string, opts?: { force?: boolean }): Promise<boolean> {
    const [h, m] = (timeString ?? "").split(":");
    const hour = Number(h);
    const minute = Number(m);
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      LoggingService.log("NARANJA", "ADVERTENCIA", "WARN", `Hora de recordatorio inválida: "${timeString}"`);
      return false;
    }
    if ((await NotificationService.getPermission()) !== "granted") return false;
    if (!opts?.force && isSpam(`daily_${timeString}`)) return true;
    await ensureCategories().catch(() => {});
    const target = await reminderTarget();
    const body = target.name ? t("notifications.reminderAsk", { site: target.name }) : t("notifications.reminderAskPick");
    const content = {
      title: reminderTitleForHour(hour),
      body,
      sound: true,
      categoryIdentifier: NOTIFICATION_CATEGORIES.DAILY_REMINDER,
      channelId: NOTIFICATION_CHANNELS.DEFAULT,
      data: { kind: "DAILY_REMINDER", siteId: target.siteId },
    };
    await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID).catch(() => {});
    const silence = await PersistenceService.getKv<SilenceMark>(KV_KEYS.SILENCE_DAY).catch(() => null);
    const today = corporateDateKey(TimeAuthorityService.now());
    if (silence?.date === today) {
      const next = addDaysKey(today, 1);
      const at = fromWallClock(next.y, next.m, next.d, hour, minute);
      await Notifications.scheduleNotificationAsync({
        identifier: DAILY_REMINDER_ID,
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(at),
          channelId: Platform.OS === "android" ? NOTIFICATION_CHANNELS.DEFAULT : undefined,
        },
      });
      return true;
    }
    await Notifications.scheduleNotificationAsync({
      identifier: DAILY_REMINDER_ID,
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        channelId: Platform.OS === "android" ? NOTIFICATION_CHANNELS.DEFAULT : undefined,
      },
    });
    return true;
  },

  /** T35: silencia solo la fecha corporativa de hoy. Mañana vuelve a sonar. */
  async silenceToday(): Promise<void> {
    const settings = await SettingsService.load();
    await PersistenceService.setKv(KV_KEYS.SILENCE_DAY, { date: corporateDateKey(TimeAuthorityService.now()) } satisfies SilenceMark);
    await NotificationService.scheduleDailyReminder(settings.profile.dailyReminderTime, { force: true });
  },

  async cancelDailyReminder(): Promise<void> {
    await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID).catch(() => {});
  },

  /** Aviso inmediato validado (título y cuerpo no vacíos). */
  async notifyImmediate(title: string, body: string, data?: Record<string, unknown>, opts: { identifier?: string; categoryIdentifier?: string; channelId?: string } = {}): Promise<boolean> {
    if (!title?.trim() || !body?.trim()) {
      LoggingService.log("NARANJA", "ADVERTENCIA", "WARN", "Notificación con payload inválido descartada");
      return false;
    }
    if ((await NotificationService.getPermission()) !== "granted") return false;
    if (isSpam(`imm_${title}_${body}`)) return true;
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: opts.identifier,
        content: {
          title,
          body,
          data,
          sound: true,
          categoryIdentifier: opts.categoryIdentifier,
          ...(opts.channelId ? { channelId: opts.channelId } : {}),
        },
        trigger: null,
      });
      await noteOsCritical(data, true).catch((error) => {
        LoggingService.log("NARANJA", "NOTIFICACION", "WARN", "No se pudo anotar el aviso crítico", serializeError(error));
      });
      return true;
    } catch (error) {
      LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "Error lanzando notificación", serializeError(error));
      await noteOsCritical(data, false).catch(() => {});
      return false;
    }
  },

  /**
   * Aviso de comida (4 h 30 del día) o de descanso (3 h 30). El cuerpo de la
   * comida lleva la hora límite. «Lo tomé» no descuenta minutos.
   */
  async scheduleMealRestNotices(input: {
    sessionId: number;
    nowMs: number;
    workedMinutes: number;
    mealAlreadyStarted: boolean;
    restAcknowledged: boolean;
  }): Promise<boolean> {
    await ensureCategories().catch(() => {});
    const notices = planMealRestNotices({
      nowMs: input.nowMs,
      workedMinutes: input.workedMinutes,
      mealAlreadyStarted: input.mealAlreadyStarted,
      restAcknowledged: input.restAcknowledged,
      formatTime: (ms) => formatTime(ms),
    });
    let any = false;
    for (const n of notices) {
      const title = t(n.code === "N11" ? "notifications.mealDueTitle" : "notifications.restDueTitle");
      const body = n.code === "N11" ? t("notifications.mealDueBody", { time: formatTime(n.deadlineMs ?? input.nowMs) }) : t("notifications.restDueBody");
      const ok = await NotificationService.notifyImmediate(title, body, { kind: n.code, sessionId: input.sessionId }, {
        identifier: `dualtracker-${n.code}-${input.sessionId}`,
        ...(n.code === "N20" ? { categoryIdentifier: NOTIFICATION_CATEGORIES.REST_BREAK } : {}),
      });
      any = any || ok;
    }
    return any;
  },

  /** N07. La tarea headless lo crea en la misma ejecución del EXIT, canal al máximo. */
  async notifyExitDetected(sessionId: number, firstExitAtMs: number): Promise<boolean> {
    await ensureChannels().catch(() => {});
    await ensureCategories().catch(() => {});
    return NotificationService.notifyImmediate(
      t("notifications.exitTitle"),
      t("notifications.exitBody"),
      { kind: "EXIT_DECISION", criticalKind: "EXIT", sessionId, firstExitAtMs },
      {
        identifier: exitNotificationId(sessionId),
        categoryIdentifier: NOTIFICATION_CATEGORIES.EXIT_DETECTION,
        channelId: NOTIFICATION_CHANNELS.DEFAULT,
      },
    );
  },

  /**
   * N09 a los 10 min y el cierre D13 al vencer la ventana. Triggers del SO
   * (DATE): siguen programados si el proceso muere. No sustituyen a N07.
   */
  async scheduleExitFollowUps(sessionId: number, firstExitAtMs: number, windowMs: number): Promise<void> {
    if ((await NotificationService.getPermission()) !== "granted") return;
    await ensureChannels().catch(() => {});
    await ensureCategories().catch(() => {});
    const closeAt = firstExitAtMs + windowMs;
    const channelId = NOTIFICATION_CHANNELS.DEFAULT;
    if (windowMs > EXIT_REMINDER_AFTER_MS) {
      await scheduleAt(exitReminderId(sessionId), {
        title: t("notifications.exitReminderTitle"),
        body: t("notifications.exitReminderBody", { time: formatTime(closeAt) }),
        data: { kind: "EXIT_REMINDER", sessionId, firstExitAtMs },
        sound: true,
        categoryIdentifier: NOTIFICATION_CATEGORIES.EXIT_DETECTION,
        channelId,
      }, firstExitAtMs + EXIT_REMINDER_AFTER_MS);
    }
    await scheduleAt(exitCloseId(sessionId), {
      title: t("notifications.exitReminderTitle"),
      body: t("notifications.exitReminderBody", { time: formatTime(closeAt) }),
      data: { kind: "EXIT_CLOSE", sessionId, firstExitAtMs },
      sound: true,
      channelId,
    }, closeAt);
  },

  async cancelExitFollowUps(sessionId: number): Promise<void> {
    await NotificationService.dismissExit(sessionId);
  },

  /** N08. Sin respuesta en 15 min, el trigger cierra sin descontar almuerzo. */
  async askLunchBeforeClose(sessionId: number): Promise<void> {
    await ensureCategories().catch(() => {});
    const deadlineMs = TimeAuthorityService.now() + LUNCH_PROMPT_WAIT_MS;
    await PersistenceService.setKv(KV_KEYS.LUNCH_PROMPT, { sessionId, deadlineMs } satisfies LunchPrompt);
    await NotificationService.notifyImmediate(
      t("notifications.lunchAskTitle"),
      t("notifications.lunchAskBody"),
      { kind: "LUNCH_BEFORE_CLOSE", sessionId },
      { identifier: `dualtracker-lunch-ask-${sessionId}`, categoryIdentifier: NOTIFICATION_CATEGORIES.LUNCH_BEFORE_CLOSE, channelId: NOTIFICATION_CHANNELS.DEFAULT },
    );
    await scheduleAt(`dualtracker-lunch-close-${sessionId}`, {
      title: t("notifications.lunchAskTitle"),
      body: t("notifications.lunchAskBody"),
      data: { kind: "LUNCH_CLOSE", sessionId },
      sound: true,
      channelId: NOTIFICATION_CHANNELS.DEFAULT,
    }, deadlineMs);
  },

  /** El vigilante cierra si N08 se quedó sin respuesta. */
  async runLunchPromptClose(): Promise<boolean> {
    const prompt = await PersistenceService.getKv<LunchPrompt>(KV_KEYS.LUNCH_PROMPT);
    if (!prompt || TimeAuthorityService.now() < prompt.deadlineMs) return false;
    const session = await PersistenceService.getSession(prompt.sessionId);
    if (!session || session.domainStatus === "CERRADA" || session.bookkeeping.cancelled) {
      await PersistenceService.deleteKv(KV_KEYS.LUNCH_PROMPT).catch(() => {});
      return false;
    }
    await closeFromNotification(prompt.sessionId, 0);
    return true;
  },

  async notifyArrivalHold(sessionId: number, siteName: string): Promise<boolean> {
    await ensureCategories().catch(() => {});
    return NotificationService.notifyImmediate(
      t("notifications.arrivalHoldTitle", { site: siteName }),
      t("notifications.arrivalHoldBody"),
      { kind: "ARRIVAL_HOLD", sessionId },
      { identifier: arrivalNotificationId(sessionId), categoryIdentifier: NOTIFICATION_CATEGORIES.ARRIVAL_HOLD, channelId: NOTIFICATION_CHANNELS.DEFAULT },
    );
  },

  async notifyArrivalRegistered(sessionId: number, timeLabel: string): Promise<boolean> {
    return NotificationService.notifyImmediate(
      t("notifications.arrivalRegisteredTitle", { time: timeLabel }),
      t("notifications.arrivalRegisteredBody"),
      { kind: "ARRIVAL_REGISTERED", sessionId },
      { identifier: arrivalNotificationId(sessionId), channelId: NOTIFICATION_CHANNELS.DEFAULT },
    );
  },

  async dismissArrival(sessionId: number): Promise<void> {
    await Notifications.dismissNotificationAsync(arrivalNotificationId(sessionId)).catch(() => {});
    await Notifications.cancelScheduledNotificationAsync(arrivalNotificationId(sessionId)).catch(() => {});
  },

  async notifyWeakGps(sessionId: number): Promise<boolean> {
    await ensureCategories().catch(() => {});
    return NotificationService.notifyImmediate(
      t("notifications.weakGpsTitle"),
      t("notifications.weakGpsBody"),
      { kind: "GPS_WEAK", sessionId },
      { identifier: `dualtracker-weak-${sessionId}`, categoryIdentifier: NOTIFICATION_CATEGORIES.ARRIVAL_HOLD, channelId: NOTIFICATION_CHANNELS.DEFAULT },
    );
  },

  async notifyOffsite(sessionId: number, address: string): Promise<boolean> {
    await ensureCategories().catch(() => {});
    return NotificationService.notifyImmediate(
      t("notifications.offsiteTitle"),
      t("notifications.offsiteBody", { address }),
      { kind: "OFFSITE", sessionId },
      { identifier: `dualtracker-offsite-${sessionId}`, categoryIdentifier: NOTIFICATION_CATEGORIES.OFFSITE, channelId: NOTIFICATION_CHANNELS.DEFAULT },
    );
  },

  async notifyStillGoing(sessionId: number): Promise<boolean> {
    return NotificationService.notifyImmediate(
      t("notifications.stillGoingTitle"),
      t("notifications.stillGoingBody"),
      { kind: "STILL_GOING", sessionId },
      { identifier: `dualtracker-still-${sessionId}`, channelId: NOTIFICATION_CHANNELS.DEFAULT },
    );
  },

  async notifyTransit(sessionId: number): Promise<boolean> {
    await ensureCategories().catch(() => {});
    return NotificationService.notifyImmediate(
      t("notifications.transitTitle"),
      t("notifications.transitBody"),
      { kind: "TRANSIT", sessionId },
      { identifier: `dualtracker-transit-${sessionId}`, categoryIdentifier: NOTIFICATION_CATEGORIES.TRANSIT, channelId: NOTIFICATION_CHANNELS.DEFAULT },
    );
  },

  async dismissTransit(sessionId: number): Promise<void> {
    await Notifications.dismissNotificationAsync(`dualtracker-transit-${sessionId}`).catch(() => {});
    await Notifications.cancelScheduledNotificationAsync(`dualtracker-transit-${sessionId}`).catch(() => {});
  },

  async notifyIntegrity(sessionId: number): Promise<boolean> {
    await ensureCategories().catch(() => {});
    return NotificationService.notifyImmediate(
      t("notifications.integrityTitle"),
      t("notifications.integrityBody"),
      { kind: "INTEGRITY", sessionId },
      { identifier: integrityNotificationId(sessionId), categoryIdentifier: NOTIFICATION_CATEGORIES.INTEGRITY, channelId: NOTIFICATION_CHANNELS.DEFAULT },
    );
  },

  async notifyReturnOrFinish(sessionId: number): Promise<boolean> {
    await ensureCategories().catch(() => {});
    return NotificationService.notifyImmediate(
      t("notifications.returnOrFinishTitle"),
      t("notifications.returnOrFinishBody"),
      { kind: "RETURN_OR_FINISH", sessionId },
      { identifier: `dualtracker-return-${sessionId}`, categoryIdentifier: NOTIFICATION_CATEGORIES.RETURN_OR_FINISH, channelId: NOTIFICATION_CHANNELS.DEFAULT },
    );
  },

  /** N10 al cerrar a mano o al confirmar el fin de una huérfana. */
  async notifyDaySummary(session: SessionRecord, preview: SessionPayrollPreview | null): Promise<boolean> {
    if (session.bookkeeping.cancelled) return false;
    const notice = daySummaryContent(session, preview);
    const correctFirst = notice.actions[0] === NOTIFICATION_ACTIONS.CORRECT_DAY;
    await ensureCategories().catch(() => {});
    return NotificationService.notifyImmediate(notice.title, notice.body, {
      kind: "DAY_SUMMARY",
      sessionId: session.id,
      actions: notice.actions,
      correctFirst,
    }, {
      identifier: `dualtracker-day-${session.id}`,
      categoryIdentifier: correctFirst ? NOTIFICATION_CATEGORIES.DAY_SUMMARY_CORRECT : NOTIFICATION_CATEGORIES.DAY_SUMMARY,
    });
  },

  /** N17. El texto depende de la clase. Nunca anuncia Validada. */
  async notifyAutoClose(session: SessionRecord): Promise<boolean> {
    const notice = autoCloseContent(session.integrityClass, session.endAtMs);
    return NotificationService.notifyImmediate(notice.title, notice.body, {
      kind: session.integrityClass === "AUTO" ? "AUTO_CLOSE" : "CONFLICT_CLOSE",
      sessionId: session.id,
      integrityClass: session.integrityClass,
    }, { identifier: `dualtracker-autoclose-${session.id}` });
  },

  /** N16. */
  async notifyExtendShift(sessionId: number): Promise<boolean> {
    const notice = extendShiftContent();
    await ensureCategories().catch(() => {});
    return NotificationService.notifyImmediate(notice.title, notice.body, {
      kind: "EXTEND_SHIFT",
      sessionId,
      actions: notice.actions,
    }, {
      identifier: `dualtracker-extend-${sessionId}`,
      categoryIdentifier: NOTIFICATION_CATEGORIES.EXTEND_SHIFT,
    });
  },

  /** N15. */
  async notifyOrphan(sessionId: number): Promise<boolean> {
    const notice = orphanNoticeContent();
    await ensureCategories().catch(() => {});
    return NotificationService.notifyImmediate(notice.title, notice.body, {
      kind: "ORPHAN_REVIEW",
      sessionId,
      actions: notice.actions,
    }, {
      identifier: `dualtracker-orphan-${sessionId}`,
      categoryIdentifier: NOTIFICATION_CATEGORIES.ORPHAN_REVIEW,
    });
  },

  /** N12, +30 min desde el inicio del almuerzo. */
  async scheduleLunchResume(sessionId: number, lunchStartAtMs: number): Promise<boolean> {
    const notice = lunchResumeContent();
    if ((await NotificationService.getPermission()) !== "granted") return false;
    await ensureCategories().catch(() => {});
    const when = lunchStartAtMs + LUNCH_RESUME_AFTER_MS;
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: `dualtracker-lunch-${sessionId}`,
        content: {
          title: notice.title,
          body: notice.body,
          data: { kind: "LUNCH_RESUME", sessionId, actions: notice.actions },
          sound: true,
          categoryIdentifier: NOTIFICATION_CATEGORIES.LUNCH_RESUME,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(when) },
      });
      return true;
    } catch (error) {
      LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "No se pudo programar el aviso de almuerzo", serializeError(error));
      return false;
    }
  },

  async dismissExit(sessionId: number): Promise<void> {
    await Notifications.dismissNotificationAsync(exitNotificationId(sessionId)).catch(() => {});
    await Notifications.dismissNotificationAsync(exitReminderId(sessionId)).catch(() => {});
    await Notifications.cancelScheduledNotificationAsync(exitReminderId(sessionId)).catch(() => {});
    await Notifications.cancelScheduledNotificationAsync(exitCloseId(sessionId)).catch(() => {});
    await Notifications.cancelScheduledNotificationAsync(`dualtracker-lunch-close-${sessionId}`).catch(() => {});
  },

  dispose(): void {
    responseSub?.remove();
    responseSub = null;
  },

  __resetForTests(): void {
    responseSub?.remove();
    responseSub = null;
    intentSink = null;
    uiSink = null;
    lastScheduled.clear();
  },
};
