/** Fixtures canónicos de SessionRecord (contratos de src/core/contracts, nunca `any`). */
import type { CompanyPolicy, SessionRecord, TransitSegment } from "../../src/core/contracts";
import type { TransitionContext } from "../../src/services/domain/sessionMachine";
import { CA_DAILY8_WEEKLY40_V1 } from "../../src/services/domain/payrollPolicies";
import { DEFAULT_COMPANY_POLICY } from "../../src/services/persistence/SettingsService";
import { toDateString } from "../../src/utils/dateUtils";

/** Lunes 2026-09-21 08:00 PDT (15:00 UTC). */
export const MONDAY_8AM = Date.UTC(2026, 8, 21, 15, 0, 0);
export const MIN = 60_000;
export const HOUR = 60 * MIN;

/** "california-daily-8-weekly-40" de la propuesta = CA_DAILY8_WEEKLY40_v1 en el código. */
export const CA_POLICY_ID = CA_DAILY8_WEEKLY40_V1.id;

export const COMPANY: CompanyPolicy = { ...DEFAULT_COMPANY_POLICY, overtimePolicyId: CA_POLICY_ID };
export const RATES = { hourlyRate: 20, overtimeMultiplier: 1.5 };

type SessionOverrides = Partial<Omit<SessionRecord, "bookkeeping">> & { bookkeeping?: Partial<SessionRecord["bookkeeping"]> };

export function makeSession(o: SessionOverrides = {}): SessionRecord {
  const declared = o.declaredStartAtMs ?? MONDAY_8AM;
  const { bookkeeping, ...rest } = o;
  return {
    id: 1,
    declaredStartAtMs: declared,
    actualStartAtMs: declared,
    endAtMs: null,
    domainStatus: "ACTIVA",
    siteId: 1,
    clientId: null,
    lunch: { taken: false, startAtMs: null, endAtMs: null, deductedMinutes: null },
    totalPausedMs: 0,
    transitSegments: [],
    integrityClass: "VALID",
    policyId: CA_POLICY_ID,
    ...rest,
    bookkeeping: {
      dateString: toDateString(rest.actualStartAtMs ?? declared),
      isDeleted: false,
      cancelled: false,
      lastPauseStartMs: null,
      firstExitAtMs: null,
      firstExitReliable: null,
      integrityReason: "CLEAN",
      original: null,
      manualNote: null,
      updatedAtMs: declared,
      ...bookkeeping,
    },
  };
}

/** Jornada CERRADA de `hours` horas desde `start`. */
export function makeClosedSession(start: number, hours: number, o: SessionOverrides = {}): SessionRecord {
  return makeSession({ declaredStartAtMs: start, actualStartAtMs: start, endAtMs: start + hours * HOUR, domainStatus: "CERRADA", ...o });
}

export function makeSegment(o: Partial<TransitSegment> = {}): TransitSegment {
  return { id: "tr-1", fromSiteId: 1, toSiteId: 2, startAtMs: MONDAY_8AM, endAtMs: MONDAY_8AM + 30 * MIN, cancelled: false, paid: null, ...o };
}

let seq = 0;
export function makeCtx(o: Partial<TransitionContext> = {}): TransitionContext {
  return {
    nowMs: MONDAY_8AM,
    actor: "USER",
    policyId: CA_POLICY_ID,
    company: COMPANY,
    disclosureAccepted: true,
    degradedReason: null,
    siteExists: () => true,
    newId: () => `tr-test-${++seq}`,
    ...o,
  };
}
