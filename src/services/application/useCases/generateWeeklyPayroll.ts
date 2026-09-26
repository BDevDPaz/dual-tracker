/**
 * Caso de uso: nómina semanal (Propuesta Técnica §7.1, flujo "Cerrar periodo").
 *   PayrollEngine.buildStatement (preview) → EvidencePack.seal → ReportService
 *   (PDF empleado + PDF empleador) → OfflineQueue.
 * `preview` no sella nada: lo usa la pantalla Reportes para mostrar el rollup.
 */
import type { PayrollStatement } from "../../../core/contracts";
import { PayrollEngineService } from "../../domain/PayrollEngineService";
import { EvidencePackService } from "../../evidence/EvidencePackService";
import { TimeAuthorityService } from "../../evidence/TimeAuthorityService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { SettingsService } from "../../persistence/SettingsService";

export async function previewPayroll(periodStart: number, periodEnd: number): Promise<PayrollStatement> {
  const settings = await SettingsService.load();
  const sessions = await PersistenceService.listSessions({ from: periodStart, to: periodEnd });
  return PayrollEngineService.buildStatement({
    periodStart,
    periodEnd,
    sessions,
    rates: { hourlyRate: settings.profile.hourlyRate, overtimeMultiplier: settings.company.overtimeMultiplier },
    company: settings.company,
    policyId: settings.company.overtimePolicyId,
    nowMs: TimeAuthorityService.now(),
  });
}

export async function generateWeeklyPayroll(periodStart: number, periodEnd: number, allowUncertified = false) {
  return EvidencePackService.seal({ periodStart, periodEnd, allowUncertified });
}
