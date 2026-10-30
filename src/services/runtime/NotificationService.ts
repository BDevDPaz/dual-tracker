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
import type { PermissionState, SessionIntent, SessionPayrollPreview, SessionRecord } from "../../core/contracts";
import { NOTIFICATION_ACTIONS, NOTIFICATION_CATEGORIES, NOTIFICATION_CHANNELS } from "../../constants/notifications";
import { reminderTitleForHour, t } from "../../i18n";
import { formatTime } from "../../utils/dateUtils";
import { planMealRestNotices } from "../domain/caPremiums";
import { serializeError } from "../../utils/serializeError";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { LoggingService } from "../persistence/LoggingService";
import { PersistenceService } from "../persistence/PersistenceService";
import { KV_KEYS } from "../persistence/schema";
import { StoreActions } from "../../core/store";
import { criticalKindsOf, recordCriticalNotice, type CriticalNoticeKind } from "./criticalNotices";
import { autoCloseContent, daySummaryContent, extendShiftContent, lunchResumeContent, LUNCH_RESUME_AFTER_MS, orphanNoticeContent } from "./dayNotices";

const DAILY_REMINDER_ID = "dualtracker-daily-reminder";
const exitNotificationId = (sessionId: number) => `dualtracker-exit-${sessionId}`;
const DEDUPE_THRESHOLD_MS = 3000;
const lastScheduled = new Map<string, number>();

export type NotificationIntentSink = (intent: SessionIntent, sessionId: number | null) => Promise<void>;
export type NotificationUiSink = (req: {
  openExitModal?: boolean;
  openDailySetup?: "start" | "transit" | null;
  openExtendConfirm?: boolean;
  correctSessionId?: number | null;
  openOrphanReview?: boolean;
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
    { identifier: NOTIFICATION_ACTIONS.STAY_WORKING, buttonTitle: t("notifications.actionStay"), options: { opensAppToForeground: false } },
    { identifier: NOTIFICATION_ACTIONS.END_SESSION, buttonTitle: t("notifications.actionClose"), options: { opensAppToForeground: false } },
    // Trasladar exige elegir destino → abre la app con DailySetupModal (modo transit).
    { identifier: NOTIFICATION_ACTIONS.TRANSFER, buttonTitle: t("notifications.actionTransfer"), options: { opensAppToForeground: true } },
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

async function handleResponse(response: Notifications.NotificationResponse): Promise<void> {
  const action = response.actionIdentifier;
  const data = response.notification.request.content.data;
  const sessionId = parseSessionId(data);
  LoggingService.log("AZUL", "NOTIFICACION", "INFO", "Acción de notificación recibida", { action, sessionId });
  await acknowledgeOsCritical(data).catch((error) => {
    LoggingService.log("NARANJA", "NOTIFICACION", "WARN", "No se pudo anotar el toque del aviso", serializeError(error));
  });
  try {
    switch (action) {
      case NOTIFICATION_ACTIONS.STAY_WORKING:
        if (sessionId) await intentSink?.({ type: "STAY_WORKING" }, sessionId);
        break;
      case NOTIFICATION_ACTIONS.END_SESSION:
        if (sessionId) await intentSink?.({ type: "CLOSE_DAY", mode: "EXIT_CONFIRMED" }, sessionId);
        break;
      case NOTIFICATION_ACTIONS.TRANSFER:
        uiSink?.({ openDailySetup: "transit" });
        break;
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
          const kind = data && typeof data === "object" ? (data as Record<string, unknown>).kind : null;
          if (kind === "EXIT_DECISION") uiSink?.({ openExitModal: true });
          if (kind === "DAILY_REMINDER") uiSink?.({ openDailySetup: "start" });
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

  /** Recordatorio diario (DAILY_REMINDER). timeString "HH:mm". */
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
    await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: DAILY_REMINDER_ID,
      content: {
        title: reminderTitleForHour(hour),
        body: t("notifications.reminderBody"),
        sound: true,
        data: { kind: "DAILY_REMINDER" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        channelId: Platform.OS === "android" ? NOTIFICATION_CHANNELS.DEFAULT : undefined,
      },
    });
    return true;
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

  async dismissExit(sessionId: number): Promise<void> {
    await Notifications.dismissNotificationAsync(exitNotificationId(sessionId)).catch(() => {});
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
