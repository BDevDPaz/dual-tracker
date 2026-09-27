/**
 * MICROCOPY versionado (FeedbackService, Propuesta Técnica §5.14).
 * Sustituye a los títulos por categoría de logBridge (GEOTrack) y a los
 * toast_* de utils/i18n.ts. Nunca contiene jerga técnica ("mutex", "WAL"…).
 */
import type { FeedbackCode, FeedbackPayload, FeedbackTone } from "../core/contracts";

export const MICROCOPY_VERSION = "2026-09-v1";

interface Copy {
  title: string;
  message: string;
}

export interface MicrocopyEntry {
  kind: FeedbackPayload["kind"];
  tone: FeedbackTone;
  es: Copy;
  en?: Copy;
}

export const MICROCOPY: Record<FeedbackCode, MicrocopyEntry> = {
  DAY_STARTED: { kind: "toast", tone: "success", es: { title: "Jornada iniciada", message: "Geocerca activa. Ve al sitio." }, en: { title: "Shift started", message: "Geofence active. Head to the site." } },
  DAY_CANCELLED: { kind: "toast", tone: "info", es: { title: "Jornada cancelada", message: "No se registró tiempo de trabajo." }, en: { title: "Shift cancelled", message: "No work time was recorded." } },
  ARRIVAL_CONFIRMED: { kind: "toast", tone: "success", es: { title: "Llegada confirmada", message: "Tu jornada está activa." }, en: { title: "Arrival confirmed", message: "Your shift is active." } },
  AUTO_CHECKIN: { kind: "toast", tone: "success", es: { title: "Llegaste al sitio", message: "Check-in automático por geocerca." }, en: { title: "You arrived", message: "Automatic check-in by geofence." } },
  LUNCH_STARTED: { kind: "toast", tone: "info", es: { title: "Almuerzo iniciado", message: "No se registra rastro durante la pausa." }, en: { title: "Lunch started", message: "No trail is recorded during the break." } },
  RESUMED: { kind: "toast", tone: "success", es: { title: "Jornada reanudada", message: "" }, en: { title: "Shift resumed", message: "" } },
  TRANSFER_STARTED: { kind: "toast", tone: "info", es: { title: "Traslado iniciado", message: "Rumbo a {site}." }, en: { title: "Transfer started", message: "Heading to {site}." } },
  TRANSFER_CANCELLED: { kind: "toast", tone: "info", es: { title: "Traslado cancelado", message: "Sigues en jornada activa." }, en: { title: "Transfer cancelled", message: "Your shift remains active." } },
  EXIT_DETECTED: { kind: "dialog", tone: "warning", es: { title: "Saliste del área", message: "¿Terminaste tu jornada o vas a otro sitio?" }, en: { title: "You left the area", message: "Did you finish your shift or are you going to another site?" } },
  STAY_WORKING: { kind: "toast", tone: "info", es: { title: "Sigues trabajando", message: "La salida quedó anotada en el expediente." }, en: { title: "Still working", message: "The exit was noted in the record." } },
  DAY_CLOSED: { kind: "toast", tone: "success", es: { title: "Jornada cerrada", message: "" }, en: { title: "Shift closed", message: "" } },
  DAY_AUTO_CLOSED: { kind: "dialog", tone: "warning", es: { title: "Jornada cerrada automáticamente", message: "Revisa la sesión: puede requerir tu confirmación." }, en: { title: "Shift closed automatically", message: "Review the session: it may need your confirmation." } },
  SESSION_PATCHED: { kind: "toast", tone: "success", es: { title: "Sesión ajustada", message: "El ajuste quedó registrado con tu nota." }, en: { title: "Session adjusted", message: "The adjustment was recorded with your note." } },
  SESSION_DELETED: { kind: "toast", tone: "info", es: { title: "Sesión eliminada", message: "Se conserva en el expediente como borrado lógico." }, en: { title: "Session deleted", message: "It remains in the record as a logical delete." } },
  NOTE_SAVED: { kind: "toast", tone: "success", es: { title: "Nota guardada", message: "" }, en: { title: "Note saved", message: "" } },
  CONFLICT_RESOLVED: { kind: "toast", tone: "success", es: { title: "Conflicto resuelto", message: "La decisión quedó registrada." }, en: { title: "Conflict resolved", message: "The decision was recorded." } },
  OS_KILL_RECOVERED: { kind: "dialog", tone: "warning", es: { title: "Sesión recuperada", message: "El sistema cerró la app. Tu jornada se restauró y el corte quedó anotado." }, en: { title: "Session recovered", message: "The system closed the app. Your shift was restored and the gap was noted." } },
  PERMISSION_REVOKED: { kind: "dialog", tone: "error", es: { title: "Permiso necesario", message: "Sin ubicación en segundo plano la jornada no puede certificarse." }, en: { title: "Permission needed", message: "Without background location the shift cannot be certified." } },
  CLOCK_DRIFT: { kind: "dialog", tone: "warning", es: { title: "Reloj del teléfono alterado", message: "La hora del dispositivo cambió. La sesión queda para revisión." }, en: { title: "Device clock changed", message: "The device time changed. The session is flagged for review." } },
  SITE_SAVED: { kind: "toast", tone: "success", es: { title: "Destino guardado", message: "" }, en: { title: "Site saved", message: "" } },
  SITE_ARCHIVED: { kind: "toast", tone: "info", es: { title: "Destino archivado", message: "El historial se conserva." }, en: { title: "Site archived", message: "History is kept." } },
  PACK_SEALED: { kind: "toast", tone: "success", es: { title: "Expediente sellado", message: "Código {hash}" }, en: { title: "Pack sealed", message: "Code {hash}" } },
  PACK_REUSED: { kind: "toast", tone: "info", es: { title: "Expediente sin cambios", message: "El expediente ya estaba sellado con este mismo contenido; se reutilizó. Código {hash}" }, en: { title: "Pack unchanged", message: "This pack was already sealed with the same content; it was reused. Code {hash}" } },
  SETTINGS_SAVED: { kind: "toast", tone: "success", es: { title: "Ajustes guardados", message: "" }, en: { title: "Settings saved", message: "" } },
  ADMIN_UNLOCKED: { kind: "toast", tone: "success", es: { title: "Modo administrador", message: "Desbloqueado temporalmente." }, en: { title: "Admin mode", message: "Temporarily unlocked." } },
  ADMIN_LOCKED: { kind: "toast", tone: "info", es: { title: "Modo administrador cerrado", message: "" }, en: { title: "Admin mode locked", message: "" } },
  ADMIN_DENIED: { kind: "toast", tone: "error", es: { title: "PIN incorrecto", message: "" }, en: { title: "Wrong PIN", message: "" } },
  ADMIN_LOCKOUT: { kind: "dialog", tone: "error", es: { title: "Demasiados intentos", message: "Espera {minutes} min para reintentar." }, en: { title: "Too many attempts", message: "Wait {minutes} min to retry." } },
  ADMIN_PIN_SET: { kind: "toast", tone: "success", es: { title: "PIN configurado", message: "" }, en: { title: "PIN set", message: "" } },
  DISCLOSURE_ACCEPTED: { kind: "toast", tone: "success", es: { title: "Aviso aceptado", message: "" }, en: { title: "Notice accepted", message: "" } },
  LEDGER_BROKEN: { kind: "dialog", tone: "error", es: { title: "Registro de integridad dañado", message: "Se detectó una alteración en el historial de integridad. Tus horas se siguen registrando, pero no se pueden sellar expedientes hasta que el administrador revise el incidente." } },
  LEDGER_BREAK_ACKNOWLEDGED: { kind: "toast", tone: "info", es: { title: "Incidente reconocido", message: "Incidente de integridad reconocido. Los periodos afectados solo se pueden emitir como no certificados." } },
  INTENT_REJECTED: { kind: "toast", tone: "warning", es: { title: "No se pudo completar", message: "{reason}" }, en: { title: "Could not complete", message: "{reason}" } },
  GENERIC_ERROR: { kind: "toast", tone: "error", es: { title: "Ocurrió un error", message: "Inténtalo de nuevo." }, en: { title: "Something went wrong", message: "Please try again." } },
};

/** Motivos de rechazo en lenguaje de usuario (IntentRejection + códigos de servicio). */
export const MICROCOPY_REJECTIONS: Record<"es" | "en", Record<string, string>> = {
  es: {
    NO_OPEN_SESSION: "No hay jornada abierta.",
    SESSION_ALREADY_OPEN: "Ya tienes una jornada abierta.",
    SESSION_NOT_FOUND: "No se encontró la sesión.",
    ALREADY_CLOSED: "La jornada ya está cerrada.",
    ILLEGAL_TRANSITION: "Esa acción no está disponible en este estado.",
    DISCLOSURE_NOT_ACCEPTED: "Acepta el aviso de ubicación antes de iniciar.",
    SITE_REQUIRED: "Elige un destino.",
    SITE_NOT_FOUND: "El destino no existe o está archivado.",
    NOTE_REQUIRED: "Escribe una nota que justifique el cambio.",
    INVALID_TIMES: "Las horas no son válidas.",
    OVERLAP: "Las horas se solapan con otra sesión.",
    MUTEX_BUSY: "Otra acción está en curso. Inténtalo en unos segundos.",
    SESSION_DELETED: "La sesión ya fue eliminada.",
    NOT_IMPLEMENTED: "Esta opción aún no está disponible.",
    UNRELIABLE_FACT: "La ubicación no es fiable. Confirma manualmente.",
    NOT_IN_CONFLICT: "La sesión no está en conflicto.",
    ADMIN_LOCKED: "Requiere modo administrador.",
    PERSISTENCE_ERROR: "No se pudo guardar. Inténtalo de nuevo.",
    DESTINATION_LIMIT: "Alcanzaste el límite de destinos activos.",
    ALIAS_REQUIRED: "El destino necesita un nombre.",
    ADDRESS_REQUIRED: "El destino necesita una dirección.",
    INVALID_RADIUS: "El radio no es válido.",
    PERIOD_HAS_CONFLICT: "El periodo tiene sesiones por revisar.",
    EMPTY_PERIOD: "No hay jornadas cerradas en este periodo. No se generó el expediente.",
    PERIOD_ONLY_OPEN: "Tu jornada sigue abierta. Ciérrala para poder generar el expediente de este periodo.",
    INVALID_PERIOD: "El periodo seleccionado no es válido. Vuelve a abrir Reportes e inténtalo de nuevo.",
    PACK_NOT_FOUND: "No se encontró el expediente.",
    PIN_INVALID: "El PIN no cumple el mínimo.",
    PIN_NOT_SET: "Aún no hay PIN de administrador.",
    INVALID_VALUE: "Algún valor no es válido.",
    SHARE_UNAVAILABLE: "No hay forma de compartir en este dispositivo.",
    ERROR: "Ocurrió un error. Inténtalo de nuevo.",
    LEDGER_BROKEN: "Registro de integridad dañado: no se pueden sellar expedientes hasta que el administrador revise el incidente.",
    PERIOD_NOT_CERTIFIABLE: "Este periodo incluye jornadas no certificables; el expediente solo puede emitirse como no certificado.",
    NO_LEDGER_INCIDENT: "No hay ningún incidente de integridad abierto.",
    LEDGER_INCIDENT_MISMATCH: "El incidente cambió. Vuelve a abrir la pantalla de salud e inténtalo de nuevo.",
    ADMIN_DENIED: "PIN incorrecto.",
    ADMIN_LOCKOUT: "Demasiados intentos. Espera antes de reintentar.",
    CALENDAR_CHANGE_CONFLICTS_SEALED: "Ya hay un expediente sellado posterior a la fecha de entrada en vigor. El calendario no se puede cambiar.",
    CALENDAR_CHANGE_PENDING: "Ya hay un cambio de calendario pendiente. Anúlalo antes de solicitar otro.",
    CALENDAR_CHANGE_ALREADY_EFFECTIVE: "El cambio de calendario ya está en vigor y no se puede anular.",
    NO_PENDING_CALENDAR_CHANGE: "No hay ningún cambio de calendario pendiente.",
  },
  en: {
    NO_OPEN_SESSION: "There is no open shift.",
    SESSION_ALREADY_OPEN: "You already have an open shift.",
    ILLEGAL_TRANSITION: "That action is not available in this state.",
    DISCLOSURE_NOT_ACCEPTED: "Accept the location notice before starting.",
    SITE_REQUIRED: "Choose a site.",
    NOTE_REQUIRED: "Write a note justifying the change.",
    OVERLAP: "Times overlap another session.",
    MUTEX_BUSY: "Another action is in progress. Try again in a few seconds.",
    UNRELIABLE_FACT: "Location is not reliable. Confirm manually.",
    NOT_IMPLEMENTED: "This option is not available yet.",
    ADMIN_LOCKED: "Requires admin mode.",
  },
};
