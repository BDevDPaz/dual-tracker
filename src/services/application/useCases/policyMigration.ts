/**
 * Caso de uso: migración de política a v2 (spec v1.3 §5.2 N2).
 * En el primer arranque con v2: si company.overtimePolicyId es
 * CA_DAILY8_WEEKLY40_v1, pasa a v2 y deja el asiento PAYROLL_POLICY_CHANGED
 * { from, to, changedAtMs, sealedPeriodsKeptOnFrom } en la misma transacción.
 * Los periodos sellados con v1 conservan v1 (policyForPeriod); los no sellados
 * se recalculan con v2. Idempotente: con otra política no hace nada.
 */
import { StoreActions } from "../../../core/store";
import { companyCalendar } from "../../../utils/companyPolicy";
import { periodIdAt } from "../../../utils/dateUtils";
import { IntegrityLedgerService } from "../../domain/IntegrityLedgerService";
import { CA_DAILY8_WEEKLY40_V1, CA_DAILY8_WEEKLY40_V2 } from "../../domain/payrollPolicies";
import { TimeAuthorityService } from "../../evidence/TimeAuthorityService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { SettingsService } from "../../persistence/SettingsService";

export async function migratePayrollPolicyToV2(): Promise<{ migrated: boolean; sealedPeriodsKeptOnFrom: string[] }> {
  const settings = await SettingsService.load();
  if (settings.company.overtimePolicyId !== CA_DAILY8_WEEKLY40_V1.id) return { migrated: false, sealedPeriodsKeptOnFrom: [] };
  const nowMs = TimeAuthorityService.now();
  const history = companyCalendar(settings.company);
  const packs = await PersistenceService.listPacks();
  const sealedPeriodsKeptOnFrom = [
    ...new Set(packs.filter((p) => p.statement.policyId === CA_DAILY8_WEEKLY40_V1.id).map((p) => periodIdAt(p.manifest.periodStart, history))),
  ].sort();
  const company = { ...settings.company, overtimePolicyId: CA_DAILY8_WEEKLY40_V2.id };
  await PersistenceService.transaction(async (db) => {
    await SettingsService.saveCompany(company, db);
    await IntegrityLedgerService.append(
      {
        sessionId: null,
        actor: "SYSTEM",
        intent: "PAYROLL_POLICY_CHANGED",
        fromState: null,
        toState: null,
        reason: "POLICY_MIGRATED_V2",
        timestampMs: nowMs,
        integrityClass: null,
        data: { from: CA_DAILY8_WEEKLY40_V1.id, to: CA_DAILY8_WEEKLY40_V2.id, changedAtMs: nowMs, sealedPeriodsKeptOnFrom },
      },
      db,
    );
  });
  StoreActions.settingsReplaced({ ...settings, company });
  return { migrated: true, sealedPeriodsKeptOnFrom };
}
