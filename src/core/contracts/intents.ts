import type { SpatialFact } from "./spatial";
import type { LedgerActor } from "./ledger";

/**
 * ============================================================================
 * INTENCIONES
 * ============================================================================
 * Dos vocabularios, definidos por las dos propuestas:
 *
 * 1) SessionIntent — entrada pública de SessionEngineService (Propuesta Técnica
 *    §4.1): START_DAY, ARRIVAL_CONFIRMED, LUNCH_START, TRANSFER_START,
 *    EXIT_DETECTED, CLOSE_DAY, MANUAL_PATCH. Se añaden las intenciones que la
 *    Propuesta de Producto exige y que el motor debe atender (CANCEL_DAY,
 *    RESUME, STAY_WORKING, TRANSFER_CANCEL, DELETE_SESSION, RESOLVE_*), más las
 *    de sistema (AUTO_CLOSE, INTEGRITY_DEGRADE, ADD_NOTE).
 *
 * 2) ViewIntent — lo que una ruta de app/ puede emitir (Propuesta de Producto
 *    §4 y §6). Las vistas nunca hablan con servicios: emiten ViewIntent y el
 *    intentRouter (capa Aplicación) lo traduce (ver VIEW_TO_SESSION_INTENT).
 */

// ---------------------------------------------------------------------------
// 1) SessionIntent
// ---------------------------------------------------------------------------

export type SessionIntent =
  | { type: "START_DAY"; siteId: number; clientId?: string | null; note?: string | null }
  | { type: "CANCEL_DAY" }
  | { type: "ARRIVAL_CONFIRMED"; fact?: SpatialFact; manualArrival?: boolean }
  | { type: "LUNCH_START"; kind?: "LUNCH" | "REST" }
  | { type: "RESUME" }
  | { type: "TRANSFER_START"; toSiteId: number; purpose?: "ERRAND" }
  | { type: "TRANSFER_CANCEL"; note?: string | null }
  | { type: "EXIT_DETECTED"; fact: SpatialFact }
  | { type: "STAY_WORKING" }
  /** «Lo tomé»: el descanso se reconoce y no se descuenta tiempo. */
  | { type: "ACK_REST"; taken: boolean }
  | {
      type: "CLOSE_DAY";
      /** "EXIT_CONFIRMED" usa la primera salida como hora de cierre. */
      mode: "MANUAL" | "EXIT_CONFIRMED";
      lunchDeductedMinutes?: number | null;
      /** Hora de inicio del almuerzo declarado (obligatoria si la jornada cruza un límite de jornada, §5.3). */
      lunchStartAtMs?: number | null;
      waiveFirstMeal?: boolean;
      waiveSecondMeal?: boolean;
      mealInterrupted?: boolean;
      /** false al cerrar = descanso no tomado (una prima REST_PREMIUM si correspondía). */
      restBreaksTaken?: boolean;
    }
  | {
      type: "AUTO_CLOSE";
      cause: "MAX_OPEN_12H" | "EXIT_DECISION_EXPIRED" | "ABANDONMENT_CONFIRMED" | "PROVIDER_LOSS";
      /** true si la ubicación confirmó que el operario sigue fuera. */
      confirmedOutside: boolean;
    }
  | {
      type: "MANUAL_PATCH";
      sessionId: number;
      declaredStartAtMs: number;
      endAtMs: number | null;
      note: string;
    }
  | { type: "ADD_NOTE"; sessionId: number; note: string }
  | { type: "DELETE_SESSION"; sessionId: number }
  | { type: "RESOLVE_KEEP_GPS"; sessionId: number; note?: string | null }
  | { type: "RESOLVE_MANUAL"; sessionId: number; note: string }
  | { type: "RESOLVE_SPLIT"; sessionId: number; splitAtMs: number; note: string }
  /** Vigilante: jornada huérfana → Revisar, sin cerrar. */
  | { type: "MARK_ORPHAN" }
  /** El operario sigue trabajando. No inventa hora de fin. */
  | { type: "CONTINUE_ORPHAN" }
  /** El operario confirma la hora de fin (obligatoria) y una nota. */
  | { type: "CONFIRM_ORPHAN_END"; endAtMs: number; note: string }
  /**
   * A partir de 11 h 30 min: la persona confirma que sigue.
   * Asiento SHIFT_EXTENDED. No cierra ni cambia la clase.
   */
  | { type: "EXTEND_SHIFT" }
  /**
   * Resumen del día (Todo bien). Solo asiento ACK_DAY_SUMMARY.
   * El estado de la jornada no cambia.
   */
  | { type: "ACK_DAY_SUMMARY"; sessionId: number }
  | {
      type: "INTEGRITY_DEGRADE";
      cause:
        | "BACKGROUND_PERMISSION_MISSING"
        | "LOCATION_FOREGROUND_MISSING"
        | "LOCATION_SERVICES_DISABLED"
        | "FOREGROUND_SERVICE_STOPPED"
        | "CLOCK_DRIFT"
        | "MUTEX_FAILED"
        | "PROVIDER_LOSS"
        | "LEDGER_CHAIN_BROKEN"
        | "FIELD_CRYPTO_KEY_LOST";
      detail?: string;
    };

export type SessionIntentType = SessionIntent["type"];

/** Origen de la intención (para ConcurrencyGuard y para el actor del ledger). */
export type IntentOrigin =
  | "UI"
  | "NOTIFICATION"
  | "GEOFENCE"
  | "WATCHDOG"
  | "SYSTEM";

export const ORIGIN_TO_ACTOR: Record<IntentOrigin, LedgerActor> = {
  UI: "USER",
  NOTIFICATION: "USER",
  GEOFENCE: "GEOFENCE",
  WATCHDOG: "WATCHDOG",
  SYSTEM: "SYSTEM",
};

/** Códigos de rechazo del motor (el dominio emite códigos; la UI pone el texto). */
export type IntentRejection =
  | "NO_OPEN_SESSION"
  | "SESSION_ALREADY_OPEN"
  | "SESSION_NOT_FOUND"
  | "ALREADY_CLOSED"
  | "ILLEGAL_TRANSITION"
  | "DISCLOSURE_NOT_ACCEPTED"
  | "LOCATION_APPROXIMATE"
  | "SITE_REQUIRED"
  | "SITE_NOT_FOUND"
  | "NOTE_REQUIRED"
  | "INVALID_TIMES"
  /** Inicio, fin, almuerzo o traslado posterior a la hora de confianza. */
  | "FUTURE_TIME"
  | "OVERLAP"
  | "MUTEX_BUSY"
  | "SESSION_DELETED"
  | "NOT_IMPLEMENTED"
  | "UNRELIABLE_FACT"
  | "NOT_IN_CONFLICT"
  | "ADMIN_LOCKED"
  | "PERSISTENCE_ERROR"
  // spec v1.3 §5.3: almuerzo declarado en jornada que cruza un límite de jornada.
  | "LUNCH_START_REQUIRED"
  // spec v1.3 §5.4: RESOLVE_SPLIT.
  | "SPLIT_INSIDE_BREAK"
  // spec v1.3 §12: escritura de nota sin cifrado disponible.
  | "FIELD_CRYPTO_UNAVAILABLE"
  /** Continuar o confirmar fin solo aplica a una jornada en revisión por abandono. */
  | "NOT_ORPHAN";

// ---------------------------------------------------------------------------
// 2) ViewIntent
// ---------------------------------------------------------------------------

export type ViewIntent =
  // Hoy
  | { type: "START_DAY"; siteId: number; clientId?: string | null; note?: string | null }
  | { type: "CANCEL_DAY" }
  | { type: "CONFIRM_ARRIVAL" }
  | { type: "START_LUNCH" }
  | { type: "START_REST" }
  | { type: "RESUME" }
  | { type: "START_TRANSFER"; toSiteId: number; purpose?: "ERRAND" }
  | { type: "CANCEL_TRANSFER"; note?: string | null }
  | { type: "STAY_WORKING" }
  | { type: "CONFIRM_EXIT"; lunchDeductedMinutes?: number | null; lunchStartAtMs?: number | null }
  | {
      type: "CLOSE_DAY";
      lunchDeductedMinutes?: number | null;
      lunchStartAtMs?: number | null;
      waiveFirstMeal?: boolean;
      waiveSecondMeal?: boolean;
      mealInterrupted?: boolean;
      restBreaksTaken?: boolean;
    }
  // Sesión
  | { type: "PATCH_SESSION"; sessionId: number; declaredStartAtMs: number; endAtMs: number | null; note: string }
  | { type: "ADD_NOTE"; sessionId: number; note: string }
  | { type: "DELETE_SESSION"; sessionId: number }
  | { type: "OPEN_TRACE"; sessionId: number }
  // Destinos
  | {
      type: "UPSERT_SITE";
      site: {
        id?: number;
        alias: string;
        address: string;
        clientName?: string | null;
        notes?: string | null;
        radiusM?: number | null;
        arrivalDwellMs?: number | null;
        /** Alta sin coordenadas. La dirección puede ir vacía. */
        unlocated?: boolean;
      };
    }
  | { type: "ARCHIVE_SITE"; siteId: number }
  // Reportes
  | {
      type: "SEAL_PACK";
      periodStart: number;
      periodEnd: number;
      allowUncertified?: boolean;
      /** Reemisión explícita: pack nuevo aunque el contenido sea idéntico al último sello. */
      reissue?: boolean;
    }
  | { type: "SHARE_EMPLOYEE"; packId: string; annexLedger?: boolean; annexEnterExit?: boolean }
  | { type: "SHARE_EMPLOYER"; packId: string; annexLedger?: boolean; annexEnterExit?: boolean }
  /** FieldCrypto v1.3 §16: "Exportar expediente" → SEAL_PACK si falta y luego compartir (empleado). */
  | { type: "EXPORT_PACK"; periodStart: number; periodEnd: number }
  // Ajustes
  | { type: "SAVE_SETTINGS"; patch: import("./settings").SettingsPatch }
  /** Cambia el idioma al momento y lo persiste, sin el resto del formulario de Ajustes. */
  | { type: "SET_LANGUAGE"; language: "es" | "en" }
  | { type: "UNLOCK_ADMIN"; pin: string }
  /** Anula un cambio de calendario pendiente (antes de su entrada en vigor; admin). */
  | { type: "CANCEL_CALENDAR_CHANGE" }
  | { type: "LOCK_ADMIN" }
  | { type: "SETUP_ADMIN_PIN"; pin: string }
  /**
   * Código de un solo uso del empleador (hash salado, no el PIN en claro).
   * `fingerprint` es la huella que el empleador dio por otro canal. Obligatoria
   * solo al fijar la primera clave, si el build no trae una clave anclada.
   */
  | { type: "PROVISION_ADMIN_PIN"; code: string; fingerprint?: string }
  | { type: "COMPLETE_ONBOARDING"; profile: { employeeName: string; hourlyRate: number; language: "es" | "en"; dailyReminderTime: string } }
  | { type: "ACCEPT_DISCLOSURE"; version: string }
  // Health
  | { type: "REQUEST_PERMISSION"; permission: import("./permissions").PermissionKey }
  | { type: "OPEN_OS_SETTINGS"; target: import("./permissions").OsSettingsTarget }
  // Conflict
  | { type: "RESOLVE_KEEP_GPS"; sessionId: number; note?: string | null }
  | { type: "RESOLVE_MANUAL"; sessionId: number; note: string }
  | { type: "RESOLVE_SPLIT"; sessionId: number; splitAtMs: number; note: string }
  | { type: "CONTINUE_ORPHAN" }
  | { type: "CONFIRM_ORPHAN_END"; endAtMs: number; note: string }
  | { type: "EXTEND_SHIFT" }
  | { type: "ACK_DAY_SUMMARY"; sessionId: number }
  | { type: "LOCATE_SITE"; siteId: number; readings: { lat: number; lon: number }[] }
  // Integridad del ledger (spec v1.3 §5.5)
  | { type: "ACKNOWLEDGE_LEDGER_BREAK"; pin: string; incident: import("./ledger").LedgerIncident }
  | { type: "EXPORT_LEDGER_INCIDENT" }
  /** Diagnóstico de Soporte: versión, ajustes no sensibles, permisos y geocerca sin coordenadas. */
  | { type: "EXPORT_SUPPORT_DIAGNOSTIC" }
  // Feedback
  | { type: "DISMISS_FEEDBACK"; feedbackId: string }
  | { type: "CONSUME_UI_REQUEST" };

export type ViewIntentType = ViewIntent["type"];

/**
 * Tabla de traducción ViewIntent → SessionIntent (solo las que tocan el ciclo
 * de vida). Las demás las atiende directamente el servicio correspondiente
 * (SiteRegistry, EvidencePack, Settings, Security, PermissionsHealth…).
 */
export const VIEW_TO_SESSION_INTENT: Partial<Record<ViewIntentType, SessionIntentType>> = {
  START_DAY: "START_DAY",
  CANCEL_DAY: "CANCEL_DAY",
  CONFIRM_ARRIVAL: "ARRIVAL_CONFIRMED",
  START_LUNCH: "LUNCH_START",
  START_REST: "LUNCH_START",
  RESUME: "RESUME",
  START_TRANSFER: "TRANSFER_START",
  CANCEL_TRANSFER: "TRANSFER_CANCEL",
  STAY_WORKING: "STAY_WORKING",
  CONFIRM_EXIT: "CLOSE_DAY",
  CLOSE_DAY: "CLOSE_DAY",
  PATCH_SESSION: "MANUAL_PATCH",
  ADD_NOTE: "ADD_NOTE",
  DELETE_SESSION: "DELETE_SESSION",
  RESOLVE_KEEP_GPS: "RESOLVE_KEEP_GPS",
  RESOLVE_MANUAL: "RESOLVE_MANUAL",
  RESOLVE_SPLIT: "RESOLVE_SPLIT",
  CONTINUE_ORPHAN: "CONTINUE_ORPHAN",
  CONFIRM_ORPHAN_END: "CONFIRM_ORPHAN_END",
  EXTEND_SHIFT: "EXTEND_SHIFT",
  ACK_DAY_SUMMARY: "ACK_DAY_SUMMARY",
};

/** Resultado uniforme de emitir una intención. */
export type IntentResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; code: IntentRejection | string; detail?: string };
