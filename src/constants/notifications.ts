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
  /** N01: empieza la jornada del sitio propuesto, sin abrir la app. */
  START_DAY: "ACTION_START_DAY",
  /** N01 / T35: silencia solo el día en curso. */
  SILENCE_DAY: "ACTION_SILENCE_DAY",
  /** N03: ficha ya, sin esperar los 2 min. */
  ARRIVAL_NOW: "ACTION_ARRIVAL_NOW",
  /** N03: borra la espera y sigue en ESPERANDO. */
  ARRIVAL_HOLD_DISMISS: "ACTION_ARRIVAL_HOLD_DISMISS",
  /** N07: otro trabajo. Abre el selector de traslado. */
  OTHER_WORK: "ACTION_OTHER_WORK",
  /** N07: mandado de trabajo. TRANSFER_START con propósito ERRAND. */
  ERRAND: "ACTION_ERRAND",
  /** N08. */
  LUNCH_30: "ACTION_LUNCH_30",
  LUNCH_60: "ACTION_LUNCH_60",
  LUNCH_NONE: "ACTION_LUNCH_NONE",
  /** N13. */
  TRANSIT_BACK: "ACTION_TRANSIT_BACK",
  TRANSIT_ARRIVED: "ACTION_TRANSIT_ARRIVED",
  /** N14: abre Salud. */
  REPAIR: "ACTION_REPAIR",
  /** N06: la persona confirma que trabaja en ese punto. */
  OFFSITE_YES: "ACTION_OFFSITE_YES",
  /** Tras cancelar un traslado lejos del origen. */
  RETURN_TO_SITE: "ACTION_RETURN_TO_SITE",
  FINISH_SHIFT: "ACTION_FINISH_SHIFT",
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
  ARRIVAL_HOLD: "CATEGORY_ARRIVAL_HOLD",
  LUNCH_BEFORE_CLOSE: "CATEGORY_LUNCH_BEFORE_CLOSE",
  TRANSIT: "CATEGORY_TRANSIT",
  INTEGRITY: "CATEGORY_INTEGRITY",
  OFFSITE: "CATEGORY_OFFSITE",
  RETURN_OR_FINISH: "CATEGORY_RETURN_OR_FINISH",
} as const;

export const NOTIFICATION_CHANNELS = {
  DEFAULT: "default",
  /** Canal de baja importancia para la notificación persistente del FGS. */
  FOREGROUND_WORK: "foreground-work",
} as const;
