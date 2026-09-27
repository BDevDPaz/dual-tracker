/**
 * Catálogo de políticas de nómina versionadas (Propuesta Técnica §5.2).
 * "Política declarada y versionada (por ejemplo California daily OT + weekly 40).
 *  Un cambio de regla no reescribe historial cerrado; genera un recálculo con policyId."
 *
 * Doble tiempo > 12 h y séptimo día consecutivo (spec v1.3 §5.6, P6): la
 * política v2 declara los umbrales, pero el motor SOLO los aplica si la
 * empresa activa payrollLegalFlags.caDoubleTime / caSeventhDay
 * [CONFIRMAR CON ASESORÍA LEGAL]. Por defecto NO se aplican.
 * No implementado: periodos de comida obligatorios, redondeos de minutos.
 */
import type { PayrollPolicy } from "../../core/contracts";

/** Réplica exacta de calculatePay() de GEOTrack: > 8 h por sesión = OT. */
export const LEGACY_DAILY8_V1: PayrollPolicy = {
  id: "LEGACY_DAILY8_v1",
  label: "Heredada GEOTrack: > 8 h por sesión",
  dailyOvertimeAfterMinutes: 8 * 60,
  weeklyOvertimeAfterMinutes: null,
  dailyScope: "SESSION",
};

/** Ejemplo citado en la propuesta: California daily OT (> 8 h/día) + weekly 40. */
export const CA_DAILY8_WEEKLY40_V1: PayrollPolicy = {
  id: "CA_DAILY8_WEEKLY40_v1",
  label: "California: > 8 h/día y > 40 h/semana",
  dailyOvertimeAfterMinutes: 8 * 60,
  weeklyOvertimeAfterMinutes: 40 * 60,
  dailyScope: "DAY",
};

/**
 * spec v1.3 §5.2: como v1 pero cada sesión se parte en los límites de jornada
 * del calendario vigente (§5.1); cada segmento suma a la cubeta diaria de su
 * jornada (8 h) y a la semanal de su semana (40 h). Pausas, almuerzo y
 * tránsito se descuentan en el segmento donde ocurrieron (§5.3).
 */
export const CA_DAILY8_WEEKLY40_V2: PayrollPolicy = {
  id: "CA_DAILY8_WEEKLY40_v2",
  label: "California v2: > 8 h por jornada y > 40 h/semana (por jornada del calendario; doble tiempo y 7.º día solo si se activan)",
  dailyOvertimeAfterMinutes: 8 * 60,
  weeklyOvertimeAfterMinutes: 40 * 60,
  dailyScope: "DAY",
  segmentation: "WORKDAY",
  doubleTimeDailyAfterMinutes: 12 * 60,
  seventhDayRule: { overtimeFirstMinutes: 8 * 60, doubleAfterMinutes: 8 * 60 },
};

export const PAYROLL_POLICIES: Record<string, PayrollPolicy> = {
  [LEGACY_DAILY8_V1.id]: LEGACY_DAILY8_V1,
  [CA_DAILY8_WEEKLY40_V1.id]: CA_DAILY8_WEEKLY40_V1,
  [CA_DAILY8_WEEKLY40_V2.id]: CA_DAILY8_WEEKLY40_V2,
};

export const DEFAULT_PAYROLL_POLICY_ID = CA_DAILY8_WEEKLY40_V1.id;

export function getPayrollPolicy(id: string): PayrollPolicy {
  return PAYROLL_POLICIES[id] ?? PAYROLL_POLICIES[DEFAULT_PAYROLL_POLICY_ID];
}
