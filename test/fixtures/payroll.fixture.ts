/** Fixture de PayrollStatement: makeStatement({ regularHours, overtimeHours, policyId }). */
import type { EvidenceSummary, PayrollLine, PayrollStatement } from "../../src/core/contracts";
import { CA_POLICY_ID, MONDAY_8AM, RATES } from "./session.fixture";
import { getWeekEnd, getWeekStart } from "../../src/utils/dateUtils";

export function makeStatement(o: { regularHours?: number; overtimeHours?: number; policyId?: string; sessionIds?: number[] } = {}): PayrollStatement {
  const regularHours = o.regularHours ?? 8;
  const overtimeHours = o.overtimeHours ?? 0;
  const lines: PayrollLine[] = [
    { sessionId: 1, dateString: "2026-09-21", siteId: 1, kind: "REGULAR", minutes: regularHours * 60, rate: RATES.hourlyRate, amount: regularHours * RATES.hourlyRate, warnings: [] },
  ];
  if (overtimeHours > 0) {
    const otRate = RATES.hourlyRate * RATES.overtimeMultiplier;
    lines.push({ sessionId: 1, dateString: "2026-09-21", siteId: 1, kind: "OVERTIME_DAILY", minutes: overtimeHours * 60, rate: otRate, amount: overtimeHours * otRate, warnings: [] });
  }
  return {
    periodStart: getWeekStart(MONDAY_8AM),
    periodEnd: getWeekEnd(MONDAY_8AM),
    lines,
    regularHours,
    overtimeHours,
    transitHours: 0,
    lunchMinutes: 0,
    grossEstimate: lines.reduce((a, l) => a + l.amount, 0),
    integrityRollup: { total: 1, byClass: { VALID: 1, MANUAL: 0, AUTO: 0, CONFLICT: 0 }, hasConflict: false, certified: true },
    policyId: o.policyId ?? CA_POLICY_ID,
    packHash: null,
    overtimeDailyHours: overtimeHours,
    overtimeWeeklyHours: 0,
    deductionMinutes: 0,
    sessionIds: o.sessionIds ?? [1],
    warnings: [],
  };
}

/** Resumen de evidencia vacío pero válido (para renderizar reportes sin ledger). */
export function makeEvidence(o: Partial<EvidenceSummary> = {}): EvidenceSummary {
  return { ledgerEntryCount: 0, ledgerHeadHash: "0".repeat(64), ledgerChainValid: true, ledgerHashes: [], traces: [], conflicts: [], ...o };
}
