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
import { planMealRestNotices } from "../domain/caPremiums";
import { serializeError } from "../../utils/serializeError";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { LoggingService } from "../persistence/LoggingService";
import { PersistenceService } from "../persistence/PersistenceService";
import { KV_KEYS } from "../persistence/schema";
import { SettingsService } from "../persistence/SettingsService";
import { StoreActions } from "../../core/store";
import { criticalKindsOf, recordCriticalNotice, type CriticalNoticeKind } from "./criticalNotices";
import { autoCloseContent, daySummaryContent, extendShiftContent, lunchResumeContent, LUNCH_RESUME_AFTER_MS, orphanNoticeContent } from "./dayNotices";

const DAILY_REMINDER_ID = "dualtracker-daily-reminder";
const exitNotificationId = (sessionId: number) => `dualtracker-exit-${sessionId}`;
const exitReminderId = (sessionId: number) => `dualtracker-exit-remind-${sessionId}`;
export const EXIT_REMINDER_AFTER_MS = 10 * 60_000;
const DEDUPE_THRESHOLD_MS = 3000;
const lastScheduled = new Map<string, number>();

interface SilenceMark {
  date: string;
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

export type NotificationIntentSink = (intent: SessionIntent, sessionId: number | null) => Promise<void>;
export type NotificationUiSink = (req: {
  openExitModal?: boolean;
  openDailySetup?: "start" | "transit" | null;
  openExtendConfirm?: boolean;
  correctSessionId?: number | null;
  openOrphanReview?: boolean;
  openHealth?: boolean;
  openMoveSite?: boolean;
  exitReopened?: boolean;
  autoCloseBanner?: string | null;
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
      action === NOTIFICATION_ACTIONS.RESUME ||
      action === NOTIFICATION_ACTIONS.TRANSIT_BACK ||
      action === NOTIFICATION_ACTIONS.TRANSIT_ARRIVED ||
      action === NOTIFICATION_ACTIONS.FINISH_SHIFT;
    if (sessionBound && (await rejectIfStale(sessionId, identifier))) return;
    switch (action) {
      case NOTIFICATION_ACTIONS.STAY_WORKING:
        if (sessionId) await intentSink?.({ type: "STAY_WORKING" }, sessionId);
        break;
      case NOTIFICATION_ACTIONS.END_SESSION:
        if (sessionId) await intentSink?.({ type: "CLOSE_DAY", mode: "EXIT_CONFIRMED" }, sessionId);
        break;
      case NOTIFICATION_ACTIONS.OTHER_WORK:
      case NOTIFICATION_ACTIONS.TRANSFER:
        uiSink?.({ openDailySetup: "transit" });
        break;
      case NOTIFICATION_ACTIONS.ERRAND:
        if (sessionId) {
          const siteId = positiveInt(fields, "siteId") ?? (await PersistenceService.getSession(sessionId))?.siteId ?? null;
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
          // "Una notificación de salida abre Hoy con el modal ya visible" (Producto §8).
          const kind = fields.kind;
          if (kind === "EXIT_DECISION" || kind === "EXIT_REMINDER") uiSink?.({ openExitModal: true });
          if (kind === "DAILY_REMINDER") uiSink?.({ openDailySetup: "start" });
          if (kind === "INTEGRITY" || kind === "MONITORING_STOPPED" || kind === "MOCK") uiSink?.({ openHealth: true });
          if (kind === "OFFSITE") uiSink?.({ openMoveSite: true });
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

  /** N01. timeString "HH:mm". El silencio de hoy no cambia la hora del perfil. */
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
  async notifyImmediate(title: string, body: string, data?: Record<string, unknown>, opts: { identifier?: string; categoryIdentifier?: string } = {}): Promise<boolean> {
    if (!title?.trim() || !body?.trim()) {
      LoggingService.log("NARANJA", "ADVERTENCIA", "WARN", "Notificación con payload inválido descartada");
      return false;
    }
    if ((await NotificationService.getPermission()) !== "granted") return false;
    if (isSpam(`imm_${title}_${body}`)) return true;
    if (opts.categoryIdentifier) await ensureCategories().catch(() => {});
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: opts.identifier,
        content: { title, body, data, sound: true, categoryIdentifier: opts.categoryIdentifier },
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

  /** Decisión de salida con tres acciones (cerrar / seguir / trasladar). */
  async notifyExitDetected(sessionId: number, firstExitAtMs: number): Promise<boolean> {
    // Una tarea headless arranca un JS nuevo: los botones se registran aquí,
    // ya con el idioma hidratado, no con el que tenía el proceso anterior.
    await ensureCategories().catch(() => {});
    const session = await PersistenceService.getSession(sessionId).catch(() => null);
    const site = session?.siteId != null ? await PersistenceService.getSite(session.siteId).catch(() => null) : null;
    return NotificationService.notifyImmediate(
      t("notifications.exitTitle"),
      t("notifications.exitBody", { site: site?.alias ?? t("notifications.fgsNoSite"), time: formatTime(firstExitAtMs) }),
      { kind: "EXIT_DECISION", criticalKind: "EXIT", sessionId, firstExitAtMs },
      { identifier: exitNotificationId(sessionId), categoryIdentifier: NOTIFICATION_CATEGORIES.EXIT_DETECTION },
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

  /** Aviso obligatorio de los dos cierres automáticos. Si no se puede mostrar, queda un banner. */
  async notifyAutoClose(session: SessionRecord): Promise<boolean> {
    const notice = autoCloseContent(session.integrityClass, session.endAtMs);
    const sent = await NotificationService.notifyImmediate(notice.title, notice.body, {
      kind: session.integrityClass === "AUTO" ? "AUTO_CLOSE" : "CONFLICT_CLOSE",
      sessionId: session.id,
      integrityClass: session.integrityClass,
    }, { identifier: `dualtracker-autoclose-${session.id}` });
    if (!sent) {
      const banner = t("notifications.autoCloseBody");
      await PersistenceService.setKv(KV_KEYS.AUTO_CLOSE_BANNER, banner).catch(() => {});
      uiSink?.({ autoCloseBanner: banner });
      try {
        StoreActions.uiRequest({ autoCloseBanner: banner });
      } catch {
        // Una tarea headless puede no tener el store listo.
      }
    }
    return sent;
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

  /**
   * N09. Recordatorio a los 10 min. No programa un cierre: reabrir la app
   * solo muestra Salida detectada, y el cierre de 15 min sigue en el proceso
   * que mostró la hoja.
   */
  async scheduleExitReminder(sessionId: number, firstExitAtMs: number, windowMs: number): Promise<void> {
    if (windowMs <= EXIT_REMINDER_AFTER_MS) return;
    if ((await NotificationService.getPermission()) !== "granted") return;
    await ensureCategories().catch(() => {});
    const atMs = firstExitAtMs + EXIT_REMINDER_AFTER_MS;
    if (atMs <= TimeAuthorityService.now()) return;
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: exitReminderId(sessionId),
        content: {
          title: t("notifications.exitReminderTitle"),
          body: t("notifications.exitReminderBody", { time: formatTime(firstExitAtMs) }),
          data: { kind: "EXIT_REMINDER", sessionId, firstExitAtMs },
          sound: true,
          categoryIdentifier: NOTIFICATION_CATEGORIES.EXIT_DETECTION,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(atMs),
          channelId: Platform.OS === "android" ? NOTIFICATION_CHANNELS.DEFAULT : undefined,
        },
      });
    } catch (error) {
      LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "No se pudo programar el recordatorio de salida", serializeError(error));
    }
  },

  async notifyArrivalRegistered(sessionId: number, timeLabel: string): Promise<boolean> {
    return NotificationService.notifyImmediate(
      t("notifications.arrivalRegisteredTitle", { time: timeLabel }),
      t("notifications.arrivalRegisteredBody"),
      { kind: "ARRIVAL_REGISTERED", sessionId },
      { identifier: `dualtracker-arrival-${sessionId}` },
    );
  },

  async notifyOffsite(sessionId: number, address: string): Promise<boolean> {
    return NotificationService.notifyImmediate(
      t("notifications.offsiteTitle"),
      t("notifications.offsiteBody", { address }),
      { kind: "OFFSITE", sessionId },
      { identifier: `dualtracker-offsite-${sessionId}`, categoryIdentifier: NOTIFICATION_CATEGORIES.OFFSITE },
    );
  },

  async notifyStillGoing(sessionId: number): Promise<boolean> {
    return NotificationService.notifyImmediate(
      t("notifications.stillGoingTitle"),
      t("notifications.stillGoingBody"),
      { kind: "STILL_GOING", sessionId },
      { identifier: `dualtracker-still-${sessionId}` },
    );
  },

  async notifyTransit(sessionId: number): Promise<boolean> {
    return NotificationService.notifyImmediate(
      t("notifications.transitTitle"),
      t("notifications.transitBody"),
      { kind: "TRANSIT", sessionId },
      { identifier: `dualtracker-transit-${sessionId}`, categoryIdentifier: NOTIFICATION_CATEGORIES.TRANSIT },
    );
  },

  async dismissTransit(sessionId: number): Promise<void> {
    await Notifications.dismissNotificationAsync(`dualtracker-transit-${sessionId}`).catch(() => {});
    await Notifications.cancelScheduledNotificationAsync(`dualtracker-transit-${sessionId}`).catch(() => {});
  },

  async notifyIntegrity(sessionId: number): Promise<boolean> {
    return NotificationService.notifyImmediate(
      t("notifications.integrityTitle"),
      t("notifications.integrityBody"),
      { kind: "INTEGRITY", sessionId },
      { identifier: `dualtracker-integrity-${sessionId}`, categoryIdentifier: NOTIFICATION_CATEGORIES.INTEGRITY },
    );
  },

  async notifyReturnOrFinish(sessionId: number): Promise<boolean> {
    return NotificationService.notifyImmediate(
      t("notifications.returnOrFinishTitle"),
      t("notifications.returnOrFinishBody"),
      { kind: "RETURN_OR_FINISH", sessionId },
      { identifier: `dualtracker-return-${sessionId}`, categoryIdentifier: NOTIFICATION_CATEGORIES.RETURN_OR_FINISH },
    );
  },

  async dismissExit(sessionId: number): Promise<void> {
    await Notifications.dismissNotificationAsync(exitNotificationId(sessionId)).catch(() => {});
    await Notifications.dismissNotificationAsync(exitReminderId(sessionId)).catch(() => {});
    await Notifications.cancelScheduledNotificationAsync(exitReminderId(sessionId)).catch(() => {});
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
