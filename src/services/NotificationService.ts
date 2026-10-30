import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { log } from "../utils/logger";
import { now } from "../utils/timeProvider";
import { NOTIFICATION_ACTIONS, NOTIFICATION_CATEGORIES } from "../constants/notifications";

/**
 * ============================================================================
 * NotificationService — Propuesta 4.4
 * ----------------------------------------------------------------------------
 * Fusiona Notifications.ts, notificationsAdapter.ts y
 * NotificationActionHandler.ts en un único servicio: permisos, canal
 * Android, recordatorio diario, avisos inmediatos y traducción de acciones
 * de notificación a intenciones de SessionEngine.
 *
 * Regla de frontera dura: "Las acciones de notificación reentran a
 * SessionEngine como intenciones, nunca actualizan SQLite." Este archivo
 * NUNCA importa PersistenceService/database, ni llama a SessionEngineService
 * directamente. `onActionReceived` solo entrega un resultado tipado
 * `{ intent, sessionId }`; el llamador (wiring de SessionEngineService, en
 * otra ola) decide qué hacer con esa intención.
 *
 * "Payload validado; título y cuerpo vacíos no se programan": toda función
 * de agendado/envío valida title/body no vacíos y retorna `false` en vez de
 * agendar (o lanzar, según se documenta método por método).
 * ============================================================================
 */

export type NotificationPermissionStatus = "granted" | "denied" | "unknown";

/** Intenciones que SessionEngine reconoce, producidas por acciones de notificación. */
export type SessionIntent = "EXIT_DETECTED_CONTINUE" | "CLOSE_DAY" | "START_TRANSIT";

/** Resultado tipado que reentra a SessionEngine — nunca toca SQLite aquí. */
export interface NotificationActionResult {
  intent: SessionIntent;
  sessionId: number;
}

type ActionHandler = (result: NotificationActionResult) => void;

const DEFAULT_CHANNEL_ID = "default";

/**
 * Identificador de acción local para "Sigo trabajando". No existe en
 * `src/constants/notifications.ts` (que solo define NEW_JOB/END_SESSION/
 * DAILY_SETUP) y esa constante está fuera del alcance de esta ola
 * (solo `src/services/**` + notas). Se declara aquí en su lugar.
 */
const EXIT_DECISION_CONTINUE_ACTION = "ACTION_EXIT_CONTINUE_WORKING";
/** Categoría propia con las tres acciones de decisión de salida (4.4). */
const EXIT_DECISION_CATEGORY = "CATEGORY_EXIT_DECISION_V2";

const DEDUPE_THRESHOLD_MS = 3000;
const lastScheduledAtMs = new Map<string, number>();

function isSpam(key: string): boolean {
  const ts = now();
  const last = lastScheduledAtMs.get(key);
  if (last !== undefined && ts - last < DEDUPE_THRESHOLD_MS) {
    return true;
  }
  lastScheduledAtMs.set(key, ts);
  return false;
}

function isNonEmpty(text: string | undefined | null): text is string {
  return typeof text === "string" && text.trim().length > 0;
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
      name: DEFAULT_CHANNEL_ID,
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    });
  } catch (error) {
    log("ROJO", "NOTIFICACION", "ERROR", "Fallo configurando canal Android", error);
  }
}

async function registerCategories(): Promise<void> {
  try {
    await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.DAILY_REMINDER, [
      {
        identifier: NOTIFICATION_ACTIONS.DAILY_SETUP,
        buttonTitle: "Configurar jornada",
        options: { opensAppToForeground: true },
      },
    ]);

    // Tres acciones exactas de Propuesta 4.4: "Sigo trabajando" / "Cerrar
    // jornada" / "Trasladar". Reutiliza los identificadores existentes de
    // NEW_JOB/END_SESSION para no romper compatibilidad con cualquier otro
    // listener legacy que aún escuche esos mismos identifiers.
    await Notifications.setNotificationCategoryAsync(EXIT_DECISION_CATEGORY, [
      {
        identifier: EXIT_DECISION_CONTINUE_ACTION,
        buttonTitle: "Sigo trabajando",
        options: { opensAppToForeground: false },
      },
      {
        identifier: NOTIFICATION_ACTIONS.NEW_JOB,
        buttonTitle: "Trasladar",
        options: { opensAppToForeground: false },
      },
      {
        identifier: NOTIFICATION_ACTIONS.END_SESSION,
        buttonTitle: "Cerrar jornada",
        options: { opensAppToForeground: false, isDestructive: true },
      },
    ]);
  } catch (error) {
    log("ROJO", "NOTIFICACION", "ERROR", "Fallo registrando categorías de notificación", error);
  }
}

async function checkPermissionSilently(): Promise<boolean> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === "granted";
  } catch (error) {
    log("ROJO", "NOTIFICACION", "ERROR", "Fallo consultando permisos de notificación", error);
    return false;
  }
}

class NotificationService {
  private readonly actionHandlers = new Set<ActionHandler>();
  private responseSubscription: { remove: () => void } | null = null;

  /**
   * Configura el canal Android, registra categorías y arranca el listener
   * de respuestas de notificación. Idempotente: si ya se inicializó, no
   * duplica el listener. Retorna una función para desmontar todo.
   */
  init(): () => void {
    void ensureAndroidChannel();
    void registerCategories();

    if (!this.responseSubscription) {
      this.responseSubscription = Notifications.addNotificationResponseReceivedListener(
        (response) => {
          this.handleResponse(response);
        },
      );
    }

    return () => {
      if (this.responseSubscription) {
        this.responseSubscription.remove();
        this.responseSubscription = null;
      }
    };
  }

  /** Suscribe un handler a las intenciones traducidas de acciones de notificación. */
  onActionReceived(handler: ActionHandler): () => void {
    this.actionHandlers.add(handler);
    return () => {
      this.actionHandlers.delete(handler);
    };
  }

  async requestPermissions(): Promise<NotificationPermissionStatus> {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus === "granted") {
        await ensureAndroidChannel();
        await registerCategories();
        return "granted";
      }

      if (finalStatus === "denied") return "denied";
      return "unknown";
    } catch (error) {
      log("ROJO", "NOTIFICACION", "ERROR", "Fallo solicitando permisos de notificación", error);
      return "unknown";
    }
  }

  /**
   * @deprecated Usar core/runtime/notificationsAdapter.scheduleDailyReminder vía core/effects. Este método se mantiene por compatibilidad.
   * Reprograma el recordatorio diario a `timeString` ("HH:mm"). Payload
   * inválido (permiso ausente, hora vacía o fuera de rango) retorna `false`
   * y no agenda nada.
   */
  async scheduleDailyReminder(timeString: string): Promise<boolean> {
    if (!(await checkPermissionSilently())) {
      log("AMARILLO", "NOTIFICACION", "WARN", "Recordatorio diario omitido: sin permisos.");
      return false;
    }

    const [hourStr, minuteStr] = (timeString ?? "").split(":");
    const hour = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr, 10);

    if (
      Number.isNaN(hour) ||
      Number.isNaN(minute) ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      log(
        "NARANJA",
        "NOTIFICACION",
        "WARN",
        `Payload inválido para recordatorio diario: "${timeString}"`,
      );
      return false;
    }

    try {
      await ensureAndroidChannel();
      await Notifications.cancelAllScheduledNotificationsAsync();

      await Notifications.scheduleNotificationAsync({
        content: {
          title: "¡Buenos días! ☀️",
          body: "Es hora de iniciar tu jornada en Dual Tracker.",
          sound: true,
          data: { action: NOTIFICATION_ACTIONS.DAILY_SETUP },
          categoryIdentifier: NOTIFICATION_CATEGORIES.DAILY_REMINDER,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute,
          channelId: Platform.OS === "android" ? DEFAULT_CHANNEL_ID : undefined,
        },
      });

      log("VERDE", "NOTIFICACION", "INFO", `Recordatorio diario reprogramado a las ${timeString}`);
      return true;
    } catch (error) {
      log("ROJO", "NOTIFICACION", "ERROR", "Fallo agendando recordatorio diario", error);
      return false;
    }
  }

  /**
   * Auto-sanación idempotente usada por
   * `TaskOrchestratorService`/DAILY_REMINDER: vuelve a agendar el
   * recordatorio si por cualquier razón (revocación de permisos, limpieza
   * del sistema) dejó de existir. Es simplemente `scheduleDailyReminder`
   * expuesto con un nombre semántico para ese llamador.
   */
  async ensureDailyReminderScheduled(timeString: string): Promise<boolean> {
    return this.scheduleDailyReminder(timeString);
  }

  /** @deprecated Usar core/runtime/notificationsAdapter.notifyImmediate vía core/effects.
   * Aviso inmediato genérico. Rechaza (retorna `false`) title/body vacíos. */
  async notifyImmediate(
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<boolean> {
    if (!isNonEmpty(title) || !isNonEmpty(body)) {
      log("NARANJA", "NOTIFICACION", "WARN", "notifyImmediate rechazado: title/body vacío");
      return false;
    }

    if (!(await checkPermissionSilently())) {
      log("AMARILLO", "NOTIFICACION", "WARN", `Notificación "${title}" omitida: sin permisos.`);
      return false;
    }

    const dedupeKey = `immediate_${title}_${body}`;
    if (isSpam(dedupeKey)) {
      log("BLANCO", "NOTIFICACION", "DEBUG", "Notificación inmediata duplicada omitida.");
      return false;
    }

    try {
      await ensureAndroidChannel();
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data,
          sound: true,
          vibrate: [0, 500, 200, 500],
        },
        trigger: null,
      });
      log("AZUL", "NOTIFICACION", "INFO", `Notificación enviada: ${title}`);
      return true;
    } catch (error) {
      log("ROJO", "NOTIFICACION", "ERROR", "Fallo lanzando notificación inmediata", error);
      return false;
    }
  }

  /**
   * @deprecated La decisión de salida ahora se dispara vía core/effects -> notificationsAdapter. Se mantiene por compatibilidad.
   * Aviso accionable de decisión de salida: "Sigo trabajando" / "Cerrar
   * jornada" / "Trasladar" (Propuesta 4.3/4.4). `sessionId` viaja en el
   * payload de datos para que `handleResponse` lo traduzca de vuelta a una
   * intención con el mismo `sessionId`.
   */
  async notifyExitDecision(
    sessionId: number,
    title = "Salida detectada 📍",
    body = "¿Qué deseas hacer? Detectamos que saliste del área de trabajo.",
  ): Promise<boolean> {
    if (!Number.isFinite(sessionId)) {
      log("NARANJA", "NOTIFICACION", "WARN", "notifyExitDecision rechazado: sessionId inválido");
      return false;
    }
    if (!isNonEmpty(title) || !isNonEmpty(body)) {
      log("NARANJA", "NOTIFICACION", "WARN", "notifyExitDecision rechazado: title/body vacío");
      return false;
    }

    if (!(await checkPermissionSilently())) return false;

    try {
      await ensureAndroidChannel();
      await registerCategories();
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: { sessionId },
          categoryIdentifier: EXIT_DECISION_CATEGORY,
          sound: true,
          vibrate: [0, 500, 200, 500],
        },
        trigger: null,
      });
      return true;
    } catch (error) {
      log(
        "ROJO",
        "NOTIFICACION",
        "ERROR",
        "Fallo enviando notificación de decisión de salida",
        error,
      );
      return false;
    }
  }

  async cancelAll(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      await Notifications.dismissAllNotificationsAsync();
      log("BLANCO", "NOTIFICACION", "INFO", "Notificaciones canceladas y descartadas.");
    } catch (error) {
      log("ROJO", "NOTIFICACION", "ERROR", "Fallo cancelando notificaciones", error);
    }
  }

  private handleResponse(response: Notifications.NotificationResponse): void {
    const actionIdentifier = response.actionIdentifier;
    const rawData = response.notification.request.content.data as
      { sessionId?: number | string } | undefined;
    const sessionId = Number(rawData?.sessionId);

    log("AZUL", "NOTIFICACION", "INFO", "Acción de notificación recibida", {
      actionIdentifier,
      sessionId: rawData?.sessionId,
    });

    let intent: SessionIntent | null = null;

    switch (actionIdentifier) {
      case EXIT_DECISION_CONTINUE_ACTION:
        intent = "EXIT_DETECTED_CONTINUE";
        break;
      case NOTIFICATION_ACTIONS.END_SESSION:
        intent = "CLOSE_DAY";
        break;
      case NOTIFICATION_ACTIONS.NEW_JOB:
        intent = "START_TRANSIT";
        break;
      case NOTIFICATION_ACTIONS.DAILY_SETUP:
      case Notifications.DEFAULT_ACTION_IDENTIFIER:
      default:
        intent = null;
        break;
    }

    if (!intent || !Number.isFinite(sessionId)) return;

    const result: NotificationActionResult = { intent, sessionId };
    this.actionHandlers.forEach((handler) => {
      try {
        handler(result);
      } catch (error) {
        log("ROJO", "NOTIFICACION", "ERROR", "onActionReceived handler lanzó una excepción", error);
      }
    });
  }
}

/** Instancia única — un solo servicio de notificaciones por proceso. */
export const notificationService = new NotificationService();
