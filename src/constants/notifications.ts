/**
 * Identificadores de acciones y categorías de notificación.
 * Base: GEOTrack (src/constants/notifications.ts), ampliado con la tercera
 * acción de la Propuesta Técnica §4.4: cerrar / seguir / trasladar.
 */
export const NOTIFICATION_ACTIONS = {
  /** "Sigo trabajando" → intención STAY_WORKING. */
  STAY_WORKING: "ACTION_STAY_WORKING",
  /** "Cerrar jornada" → intención CLOSE_DAY (hora = primera salida). */
  END_SESSION: "ACTION_END_SESSION",
  /** "Trasladar" → abre Hoy con DailySetupModal en modo transit (requiere destino). */
  TRANSFER: "ACTION_TRANSFER",
  /** Recordatorio diario → abre Hoy y dispara DailySetupModal si NO_INICIADA. */
  DAILY_SETUP: "ACTION_DAILY_SETUP",
} as const;

export const NOTIFICATION_CATEGORIES = {
  EXIT_DETECTION: "CATEGORY_EXIT_DETECTION",
  DAILY_REMINDER: "CATEGORY_DAILY_REMINDER",
} as const;

export const NOTIFICATION_CHANNELS = {
  DEFAULT: "default",
  /** Canal de baja importancia para la notificación persistente del FGS. */
  FOREGROUND_WORK: "foreground-work",
} as const;
