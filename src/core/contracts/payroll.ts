import type { IntegrityClass } from "./session";

/**
 * ============================================================================
 * CONTRATO: PayrollStatement (Propuesta Técnica §9)
 * ============================================================================
 * periodStart, periodEnd, lines[], regularHours, overtimeHours, transitHours,
 * lunchMinutes, grossEstimate, integrityRollup, policyId, packHash.
 */

export type PayrollLineKind =
  | "REGULAR"
  | "OVERTIME_DAILY"
  | "OVERTIME_WEEKLY"
  /** spec v1.3 §5.6 (P6): doble tiempo. Solo con la bandera legal activa. */
  | "OVERTIME_DOUBLE"
  | "TRANSIT"
  | "LUNCH_DEDUCTION"
  | "PAUSE_DEDUCTION";

export interface PayrollLine {
  sessionId: number;
  dateString: string;
  siteId: number | null;
  kind: PayrollLineKind;
  /** Minutos enteros (se evita el redondeo de horas decimales, como GEOTrack). */
  minutes: number;
  /** Tarifa efectiva aplicada a la línea (0 en deducciones). */
  rate: number;
  amount: number;
  /** Advertencias de la línea (p. ej. LUNCH_DURATION_UNKNOWN). */
  warnings: string[];
}

export interface IntegrityRollup {
  total: number;
  byClass: Record<IntegrityClass, number>;
  /** true si alguna sesión del periodo está en CONFLICT → pago "no certificado" (§8). */
  hasConflict: boolean;
  certified: boolean;
  /**
   * FieldCrypto v1.3 §12: sesiones con bloqueo de certificación. Solo presente
   * si > 0 (así el contentHash de periodos sin bloqueos no cambia).
   */
  blockedCount?: number;
}

export interface PayrollStatement {
  periodStart: number;
  periodEnd: number;
  lines: PayrollLine[];
  regularHours: number;
  overtimeHours: number;
  transitHours: number;
  lunchMinutes: number;
  grossEstimate: number;
  integrityRollup: IntegrityRollup;
  policyId: string;
  /** Hash del EvidencePack que selló este statement. null mientras sea preview. */
  packHash: string | null;
  // Soporte
  overtimeDailyHours: number;
  overtimeWeeklyHours: number;
  deductionMinutes: number;
  sessionIds: number[];
  warnings: string[];
  /** P6: horas de doble tiempo. Solo presente si > 0 (no altera el contentHash histórico). */
  overtimeDoubleHours?: number;
  /** P6: reglas que produjeron minutos (no basta con tener la bandera). Solo presente si no está vacío. */
  appliedRules?: string[];
}

/** Efecto de nómina tentativo que devuelve SessionEngine tras cada intención (§4.1). */
export interface SessionPayrollPreview {
  sessionId: number;
  netMinutes: number;
  regularMinutes: number;
  overtimeDailyMinutes: number;
  transitMinutes: number;
  lunchMinutes: number;
  grossEstimate: number;
  certified: boolean;
  policyId: string;
}

/**
 * Política de nómina declarada y versionada (§5.2). Un cambio de regla no
 * reescribe historial cerrado: genera un recálculo con otro policyId.
 */
export interface PayrollPolicy {
  id: string;
  label: string;
  /** Minutos diarios antes de overtime diario. null = sin OT diario. */
  dailyOvertimeAfterMinutes: number | null;
  /** Minutos semanales (regulares) antes de overtime semanal. null = sin OT semanal. */
  weeklyOvertimeAfterMinutes: number | null;
  /**
   * Ámbito del umbral diario: "DAY" suma todas las sesiones del día;
   * "SESSION" replica calculatePay() de GEOTrack (umbral por sesión).
   */
  dailyScope: "DAY" | "SESSION";
  /**
   * spec v1.3 §5.2 N1: "WORKDAY" parte cada sesión en los límites de jornada
   * del calendario; cada segmento suma a la cubeta de su jornada y de su semana.
   * Ausente = atribución de toda la sesión a su inicio (v1).
   */
  segmentation?: "WORKDAY";
  /**
   * spec v1.3 §5.6 (P6): doble tiempo a partir de N minutos por día/jornada.
   * Solo se aplica con payrollLegalFlags.caDoubleTime [CONFIRMAR CON ASESORÍA LEGAL].
   */
  doubleTimeDailyAfterMinutes?: number | null;
  /**
   * spec v1.3 §5.6 (P6): séptimo día consecutivo de la semana laboral: los
   * primeros `overtimeFirstMinutes` son OT y lo que exceda `doubleAfterMinutes`
   * es doble tiempo. Solo con payrollLegalFlags.caSeventhDay [CONFIRMAR CON ASESORÍA LEGAL].
   */
  seventhDayRule?: { overtimeFirstMinutes: number; doubleAfterMinutes: number } | null;
}

/** Entradas monetarias de la política de empresa usadas por el motor. */
export interface PayrollRates {
  hourlyRate: number;
  overtimeMultiplier: number;
  /** P6: multiplicador del doble tiempo (por defecto 2). */
  doubleTimeMultiplier?: number;
}
