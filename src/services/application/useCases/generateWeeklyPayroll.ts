/**
 * Caso de uso: nómina semanal (Propuesta Técnica §7.1, flujo "Cerrar periodo").
 *   PayrollEngine.buildStatement (preview) → EvidencePack.seal → ReportService
 *   (PDF empleado + PDF empleador) → OfflineQueue.
 * `preview` no sella nada: lo usa la pantalla Reportes para mostrar el rollup.
 */
import type { PayrollStatement } from "../../../core/contracts";
import { companyCalendar } from "../../../utils/companyPolicy";
import { validateReportRange, workWeeksCovering, type ClosedRange, type RangeError } from "../../../utils/reportRange";
import { PayrollEngineService } from "../../domain/PayrollEngineService";
import { EvidencePackService } from "../../evidence/EvidencePackService";
import { TimeAuthorityService } from "../../evidence/TimeAuthorityService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { SettingsService } from "../../persistence/SettingsService";

export interface WeekPreview {
  start: number;
  end: number;
  statement: PayrollStatement;
}

export interface RangePreview {
  requested: ClosedRange;
  weeks: WeekPreview[];
}

export async function previewPayroll(periodStart: number, periodEnd: number): Promise<PayrollStatement> {
  const settings = await SettingsService.load();
  const sessions = await PersistenceService.listSessions({ from: periodStart, to: periodEnd, overlapping: true });
  const policyId = (await PersistenceService.packPolicyForPeriod(periodStart, periodEnd)) ?? settings.company.overtimePolicyId;
  return PayrollEngineService.buildStatement({
    periodStart,
    periodEnd,
    sessions,
    rates: { hourlyRate: settings.profile.hourlyRate, overtimeMultiplier: settings.company.overtimeMultiplier },
    company: settings.company,
    policyId,
    nowMs: TimeAuthorityService.now(),
  });
}

/**
 * Una vista por cada semana laboral que toca el rango. Cada semana usa
 * previewPayroll (el mismo motor del expediente). No se abre un periodo
 * nuevo que mezcle el umbral de 40 h entre semanas.
 */
export async function previewPayrollRange(
  start: number,
  end: number,
): Promise<{ ok: true; data: RangePreview } | { ok: false; code: RangeError }> {
  const check = validateReportRange(start, end);
  if (!check.ok) return check;
  const settings = await SettingsService.load();
  const history = companyCalendar(settings.company);
  const bounds = workWeeksCovering(start, end, history);
  const weeks: WeekPreview[] = [];
  for (const week of bounds) {
    weeks.push({ start: week.start, end: week.end, statement: await previewPayroll(week.start, week.end) });
  }
  return { ok: true, data: { requested: { start, end }, weeks } };
}

/**
 * Sella el periodo. Si el contenido no cambió desde el último sello devuelve
 * ese pack con `reused: true`; `reissue` fuerza un pack nuevo (reemisión).
 */
export async function generateWeeklyPayroll(periodStart: number, periodEnd: number, allowUncertified = false, reissue = false) {
  return EvidencePackService.seal({ periodStart, periodEnd, allowUncertified, reissue });
}
