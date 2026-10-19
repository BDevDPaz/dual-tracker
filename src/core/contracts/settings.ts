/**
 * Settings separados en tres esquemas (Propuesta Técnica §4.6):
 * perfil de persona, política de empresa y preferencias de dispositivo.
 */
import type { TraceMode } from "./spatial";

/** Perfil laboral — siempre editable (Propuesta de Producto §5.14). */
export interface PersonProfile {
  employeeName: string;
  /** Tarifa horaria del operario (Propuesta de Producto §5.6: se captura en el alta). */
  hourlyRate: number;
  language: "es" | "en";
  /** HH:mm del recordatorio diario. */
  dailyReminderTime: string;
  /**
   * Tema visual (ThemeContext). Ausente = "dark". El selector no se expone en
   * la UI hasta que todas las pantallas lean useTheme() (ver ThemeContext.tsx).
   */
  theme?: "system" | "dark" | "light";
}

/**
 * Calendario laboral (spec v1.3 §5.1) [CONFIRMAR CON ASESORÍA LEGAL].
 * Entrada del historial: vigente desde effectiveFromMs (zona corporativa).
 */
export interface CalendarEntry {
  effectiveFromMs: number;
  /** Inicio de jornada en minutos desde las 00:00 de pared, 0..1439. */
  workdayStartMinutes: number;
  /** Día de inicio de semana laboral: 0 = domingo, 1 = lunes … 6 = sábado. */
  workweekStartDay: number;
}

/**
 * Criterios laborales que la spec marca [CONFIRMAR CON ASESORÍA LEGAL].
 * Se implementan detrás de estas banderas con valores por defecto conservadores.
 */
export interface PayrollLegalFlags {
  /**
   * Umbral semanal de un periodo de transición más corto que 7 días (§5.1).
   * FULL (por defecto de la spec) = 40 h completas; PRORATED = proporcional a su duración.
   */
  transitionWeeklyThreshold: "FULL" | "PRORATED";
  /** §5.6 P6: doble tiempo > 12 h por día/jornada (CA). Por defecto false [CONFIRMAR CON ASESORÍA LEGAL]. */
  caDoubleTime: boolean;
  /** §5.6 P6: séptimo día consecutivo de la semana laboral (CA). Por defecto false [CONFIRMAR CON ASESORÍA LEGAL]. */
  caSeventhDay: boolean;
}

/** Política de empresa — detrás de SecurityService (zona administrativa). */
export interface CompanyPolicy {
  employerName: string;
  companyEmail: string;
  overtimeMultiplier: number;
  /** Id de PayrollPolicy vigente (versionada). */
  overtimePolicyId: string;
  /** Radio por defecto de los sitios. */
  defaultRadiusM: number;
  /** Límite de destinos activos (Propuesta §5.5: destinationLimit). */
  destinationLimit: number;
  /** Retención de miga de pan en días (Propuesta §5.4: "por ejemplo 90 días"). */
  traceRetentionDays: number;
  /** Modo de rastro permitido por la empresa. */
  traceMode: TraceMode;
  /** Debounce de salida configurable (§4.3). */
  exitDebounceMs: number;
  /** Plazo de decisión tras la primera salida (EXIT_DECISION_TIMER). */
  exitDecisionWindowMs: number;
  /**
   * Portal del empleador (tanda 2). Ausente = desactivado y sin URL.
   * No se envía nada si no hay una URL https explícita y la bandera en true.
   */
  employerPortalEnabled?: boolean;
  /** URL https del portal. Vacía o null = no configurado. */
  employerPortalUrl?: string | null;
  /** Qué pasa si el plazo expira (§7.2: "CONFLICT o AUTO según política"). */
  exitDecisionExpiry: "CONFLICT" | "AUTO_IF_CONFIRMED_OUTSIDE";
  // TransitPolicy (§5.6)
  transitPaid: boolean;
  transitRateMultiplier: number;
  transitCountsTowardOvertime: boolean;
  /**
   * Historial de calendario laboral ordenado (spec v1.3 §5.1). Ausente =
   * [{ 0, 00:00, lunes }]. Solo se modifica con el caso de uso de cambio de
   * calendario (prospectivo, con asiento CALENDAR_CHANGED).
   */
  calendarHistory?: CalendarEntry[];
  /** Banderas de criterios pendientes de asesoría legal (ausente = valores por defecto). */
  payrollLegalFlags?: Partial<PayrollLegalFlags>;
}

/** Preferencias de dispositivo (no sensibles). */
export interface DevicePreferences {
  onboardingCompleted: boolean;
  /** Versión del descargo aceptada (DualDisclosureService). */
  disclosureAcceptedVersion: string | null;
  disclosureAcceptedAtMs: number | null;
}

export interface SettingsSnapshot {
  profile: PersonProfile;
  company: CompanyPolicy;
  device: DevicePreferences;
}

export interface SettingsPatch {
  profile?: Partial<PersonProfile>;
  /** Requiere zona admin desbloqueada. */
  company?: Partial<CompanyPolicy>;
  /**
   * Cambio de calendario laboral (spec v1.3 §5.1). Requiere zona admin; entra
   * en vigor al final de la semana laboral en curso.
   */
  calendar?: Pick<CalendarEntry, "workdayStartMinutes" | "workweekStartDay">;
}
