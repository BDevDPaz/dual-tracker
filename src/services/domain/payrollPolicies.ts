/**
 * Catálogo de políticas de nómina versionadas (Propuesta Técnica §5.2).
 * Una sola familia California: > 8 h por día y > 40 h por semana.
 *
 * Doble tiempo > 12 h y séptimo día consecutivo usan los umbrales de esta
 * ficha. El motor los aplica cuando la empresa tiene caDoubleTime /
 * caSeventhDay (por defecto sí). allocate() no se reescribe: solo lee estos
 * campos. v1 atribuye la sesión al día de inicio; v2 la parte por jornada.
 */
import type { PayrollPolicy } from "../../core/contracts";

const P6 = {
  doubleTimeDailyAfterMinutes: 12 * 60,
  seventhDayRule: { overtimeFirstMinutes: 8 * 60, doubleAfterMinutes: 8 * 60 },
} as const;

/** California daily OT (> 8 h/día) + weekly 40, con doble tiempo y séptimo día. */
export const CA_DAILY8_WEEKLY40_V1: PayrollPolicy = {
  id: "CA_DAILY8_WEEKLY40_v1",
  label: "California: > 8 h/día y > 40 h/semana",
  dailyOvertimeAfterMinutes: 8 * 60,
  weeklyOvertimeAfterMinutes: 40 * 60,
  dailyScope: "DAY",
  ...P6,
};

/**
 * spec v1.3 §5.2: como v1 pero cada sesión se parte en los límites de jornada
 * del calendario vigente (§5.1); cada segmento suma a la cubeta diaria de su
 * jornada (8 h) y a la semanal de su semana (40 h). Pausas, almuerzo y
 * tránsito se descuentan en el segmento donde ocurrieron (§5.3).
 */
export const CA_DAILY8_WEEKLY40_V2: PayrollPolicy = {
  id: "CA_DAILY8_WEEKLY40_v2",
  label: "California v2: > 8 h por jornada y > 40 h/semana (por jornada del calendario)",
  dailyOvertimeAfterMinutes: 8 * 60,
  weeklyOvertimeAfterMinutes: 40 * 60,
  dailyScope: "DAY",
  segmentation: "WORKDAY",
  ...P6,
};

export const PAYROLL_POLICIES: Record<string, PayrollPolicy> = {
  [CA_DAILY8_WEEKLY40_V1.id]: CA_DAILY8_WEEKLY40_V1,
  [CA_DAILY8_WEEKLY40_V2.id]: CA_DAILY8_WEEKLY40_V2,
};

export const DEFAULT_PAYROLL_POLICY_ID = CA_DAILY8_WEEKLY40_V1.id;

export function getPayrollPolicy(id: string): PayrollPolicy {
  return PAYROLL_POLICIES[id] ?? PAYROLL_POLICIES[DEFAULT_PAYROLL_POLICY_ID];
}
