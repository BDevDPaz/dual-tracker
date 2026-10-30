import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { now } from "../utils/timeProvider";
import { log } from "../utils/logger";
import { getSettings } from "../database/db";

const DEFAULT_CHANNEL_ID = "default";
const DEFAULT_START_TIME = "06:30";

// Anti-spam: Evitar programar la misma notificación repetidamente en corto tiempo
const lastScheduledNotifications = new Map<string, number>();
const DEDUPE_THRESHOLD_MS = 3000;

async function ensureAndroidDefaultChannel() {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
      name: DEFAULT_CHANNEL_ID,
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    });
  } catch (error) {
    log("ROJO", "ERROR_CRITICO", "ERROR", "Fallo al configurar canal de Android", error);
  }
}

async function checkPermission(): Promise<boolean> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      log(
        "AMARILLO",
        "ADVERTENCIA",
        "WARN",
        "Intento de notificar sin permisos concedidos (status: " + status + ")",
      );
      return false;
    }
    return true;
  } catch (error) {
    log("ROJO", "ERROR_CRITICO", "ERROR", "Error consultando permisos de notificación", error);
    return false;
  }
}

function isSpam(key: string): boolean {
  const currentTs = now();
  const last = lastScheduledNotifications.get(key);
  if (last && currentTs - last < DEDUPE_THRESHOLD_MS) {
    return true;
  }
  lastScheduledNotifications.set(key, currentTs);
  return false;
}

export async function setupNotifications() {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      log("AMARILLO", "ADVERTENCIA", "WARN", "Permiso de notificaciones denegado.");
      return false;
    }

    await ensureAndroidDefaultChannel();
    return true;
  } catch (error) {
    log("ROJO", "ERROR_CRITICO", "ERROR", "Fallo crítico en setupNotifications", error);
    return false;
  }
}

export async function scheduleDailyMorningNotification() {
  try {
    const settings = await getSettings();
    const timeToSet = settings?.start_time || DEFAULT_START_TIME;
    await scheduleDailyReminder(timeToSet);
  } catch (error) {
    log(
      "ROJO",
      "ERROR_CRITICO",
      "ERROR",
      "Error al obtener configuración para notificaciones",
      error,
    );
  }
}

export async function scheduleDailyReminder(timeString: string) {
  if (!(await checkPermission())) return;

  const dedupeKey = `daily_reminder_${timeString}`;
  if (isSpam(dedupeKey)) {
    log("BLANCO", "SIN_CAMBIOS", "DEBUG", "Notificación diaria duplicada omitida.");
    return;
  }

  try {
    await ensureAndroidDefaultChannel();
    await Notifications.cancelAllScheduledNotificationsAsync();

    const [hourStr, minuteStr] = timeString.split(":");
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
      log("NARANJA", "ADVERTENCIA", "WARN", `Payload inválido: hora "${timeString}"`);
      return;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "¡Buenos días! ☀️",
        body: "Es hora de iniciar tu jornada en LEDTracker.",
        sound: true,
        data: { action: "OPEN_DAILY_SETUP" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        channelId: Platform.OS === "android" ? DEFAULT_CHANNEL_ID : undefined,
      },
    });

    log(
      "VERDE",
      "OPERACION_EXITOSA",
      "INFO",
      `Notificación diaria reprogramada a las ${timeString}`,
    );
  } catch (error) {
    log("ROJO", "ERROR_CRITICO", "ERROR", "Error crítico agendando notificación", error);
  }
}

export async function notifyImmediate(title: string, body: string, data?: Record<string, unknown>) {
  if (!title || !body) {
    log(
      "NARANJA",
      "ADVERTENCIA",
      "WARN",
      "Intento de notificación inmediata con payload inválido (title o body vacío)",
    );
    return;
  }

  if (!(await checkPermission())) return;

  const dedupeKey = `immediate_${title}_${body}`;
  if (isSpam(dedupeKey)) {
    log("BLANCO", "SIN_CAMBIOS", "DEBUG", "Notificación inmediata duplicada omitida.");
    return;
  }

  try {
    await ensureAndroidDefaultChannel();
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
    log("AZUL", "OPERACION_EXITOSA", "INFO", `Notificación enviada: ${title}`);
  } catch (error) {
    log("ROJO", "ERROR_CRITICO", "ERROR", "Error lanzando notificación inmediata", error);
  }
}

export async function cancelNotifications() {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.dismissAllNotificationsAsync();
    log("BLANCO", "OPERACION_EXITOSA", "INFO", "Notificaciones canceladas y descartadas.");
  } catch (error) {
    log("ROJO", "ERROR_CRITICO", "ERROR", "Fallo al cancelar notificaciones", error);
  }
}
