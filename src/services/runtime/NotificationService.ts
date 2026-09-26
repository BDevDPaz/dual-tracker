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
import type { PermissionState, SessionIntent } from "../../core/contracts";
import { NOTIFICATION_ACTIONS, NOTIFICATION_CATEGORIES, NOTIFICATION_CHANNELS } from "../../constants/notifications";
import { t } from "../../i18n";
import { serializeError } from "../../utils/serializeError";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { LoggingService } from "../persistence/LoggingService";

const DAILY_REMINDER_ID = "dualtracker-daily-reminder";
const exitNotificationId = (sessionId: number) => `dualtracker-exit-${sessionId}`;
const DEDUPE_THRESHOLD_MS = 3000;
const lastScheduled = new Map<string, number>();

export type NotificationIntentSink = (intent: SessionIntent, sessionId: number | null) => Promise<void>;
export type NotificationUiSink = (req: { openExitModal?: boolean; openDailySetup?: "start" | "transit" | null }) => void;

let intentSink: NotificationIntentSink | null = null;
let uiSink: NotificationUiSink | null = null;
let responseSub: Notifications.EventSubscription | null = null;

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

async function ensureChannels(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.DEFAULT, {
    name: "Dual Tracker",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
  });
  await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.FOREGROUND_WORK, {
    name: "Jornada en curso",
    importance: Notifications.AndroidImportance.LOW,
  });
}

async function ensureCategories(): Promise<void> {
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

async function handleResponse(response: Notifications.NotificationResponse): Promise<void> {
  const action = response.actionIdentifier;
  const data = response.notification.request.content.data;
  const sessionId = parseSessionId(data);
  LoggingService.log("AZUL", "NOTIFICACION", "INFO", "Acción de notificación recibida", { action, sessionId });
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

  /** Recordatorio diario (DAILY_REMINDER). timeString "HH:mm". */
  async scheduleDailyReminder(timeString: string): Promise<boolean> {
    const [h, m] = (timeString ?? "").split(":");
    const hour = Number(h);
    const minute = Number(m);
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      LoggingService.log("NARANJA", "ADVERTENCIA", "WARN", `Hora de recordatorio inválida: "${timeString}"`);
      return false;
    }
    if ((await NotificationService.getPermission()) !== "granted") return false;
    if (isSpam(`daily_${timeString}`)) return true;
    await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: DAILY_REMINDER_ID,
      content: {
        title: t("notifications.reminderTitle"),
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
      return true;
    } catch (error) {
      LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "Error lanzando notificación", serializeError(error));
      return false;
    }
  },

  /** Decisión de salida con tres acciones (cerrar / seguir / trasladar). */
  async notifyExitDetected(sessionId: number, firstExitAtMs: number): Promise<boolean> {
    return NotificationService.notifyImmediate(
      t("notifications.exitTitle"),
      t("notifications.exitBody"),
      { kind: "EXIT_DECISION", sessionId, firstExitAtMs },
      { identifier: exitNotificationId(sessionId), categoryIdentifier: NOTIFICATION_CATEGORIES.EXIT_DETECTION },
    );
  },

  async dismissExit(sessionId: number): Promise<void> {
    await Notifications.dismissNotificationAsync(exitNotificationId(sessionId)).catch(() => {});
  },

  dispose(): void {
    responseSub?.remove();
    responseSub = null;
  },
};
