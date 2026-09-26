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
  /** Qué pasa si el plazo expira (§7.2: "CONFLICT o AUTO según política"). */
  exitDecisionExpiry: "CONFLICT" | "AUTO_IF_CONFIRMED_OUTSIDE";
  // TransitPolicy (§5.6)
  transitPaid: boolean;
  transitRateMultiplier: number;
  transitCountsTowardOvertime: boolean;
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
}
