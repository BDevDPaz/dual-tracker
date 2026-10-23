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
  /** «Lo tomé»: reconoce el descanso sin descontar tiempo. */
  REST_TAKEN: "ACTION_REST_TAKEN",
  /** N10: Todo bien. Solo asiento, no cambia la jornada. */
  ACK_DAY: "ACTION_ACK_DAY",
  /** N10: Corregir. Abre la jornada para un ajuste con nota. */
  CORRECT_DAY: "ACTION_CORRECT_DAY",
  /** N15: sigue trabajando, sin abrir la app. */
  ORPHAN_CONTINUE: "ACTION_ORPHAN_CONTINUE",
  /** N15: abre la app para confirmar la hora de fin. */
  ORPHAN_END: "ACTION_ORPHAN_END",
  /** N16: abre la confirmación de 2×. No extiende sola. */
  EXTEND_SHIFT: "ACTION_EXTEND_SHIFT",
  /** N12: reanudar el almuerzo. */
  RESUME: "ACTION_RESUME",
} as const;

export const NOTIFICATION_CATEGORIES = {
  EXIT_DETECTION: "CATEGORY_EXIT_DETECTION",
  DAILY_REMINDER: "CATEGORY_DAILY_REMINDER",
  REST_BREAK: "CATEGORY_REST_BREAK",
  DAY_SUMMARY: "CATEGORY_DAY_SUMMARY",
  /** N10 cuando no hubo almuerzo: Corregir es el primer botón. */
  DAY_SUMMARY_CORRECT: "CATEGORY_DAY_SUMMARY_CORRECT",
  ORPHAN_REVIEW: "CATEGORY_ORPHAN_REVIEW",
  EXTEND_SHIFT: "CATEGORY_EXTEND_SHIFT",
  LUNCH_RESUME: "CATEGORY_LUNCH_RESUME",
} as const;

export const NOTIFICATION_CHANNELS = {
  DEFAULT: "default",
  /** Canal de baja importancia para la notificación persistente del FGS. */
  FOREGROUND_WORK: "foreground-work",
} as const;
