/**
 * Validación de CompanyPolicy. La aplica el repositorio al guardar y al cargar:
 * un número que no es finito, un rango imposible o un enum desconocido no
 * llega a la nómina. Al cargar, el campo malo vuelve al valor por defecto.
 * Al guardar, se rechaza.
 */
import type { CompanyPolicy } from "../../core/contracts";
import { isPayrollTimezone } from "../../utils/dateUtils";
import { MAX_ARRIVAL_DWELL_MS } from "./arrivalDwell";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function isInt(n: unknown, min: number, max: number): boolean {
  return typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;
}

function isNum(n: unknown, min: number, max: number): boolean {
  return typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
}

/** Nombres de campo que no cumplen tipo o rango. Vacío = se puede guardar. */
export function invalidCompanyFields(company: CompanyPolicy): string[] {
  const bad: string[] = [];
  if (typeof company.employerName !== "string") bad.push("employerName");
  if (typeof company.companyEmail !== "string") bad.push("companyEmail");
  if (!isNum(company.overtimeMultiplier, 1, 10)) bad.push("overtimeMultiplier");
  if (typeof company.overtimePolicyId !== "string" || company.overtimePolicyId.trim() === "") bad.push("overtimePolicyId");
  if (!(typeof company.defaultRadiusM === "number" && Number.isFinite(company.defaultRadiusM) && company.defaultRadiusM > 0 && company.defaultRadiusM <= 10_000)) {
    bad.push("defaultRadiusM");
  }
  if (!isInt(company.destinationLimit, 1, 500)) bad.push("destinationLimit");
  if (!isInt(company.traceRetentionDays, 1, 3650)) bad.push("traceRetentionDays");
  if (company.traceMode !== "PERIMETER" && company.traceMode !== "BREADCRUMB") bad.push("traceMode");
  if (!(typeof company.exitDebounceMs === "number" && Number.isFinite(company.exitDebounceMs) && company.exitDebounceMs > 0 && company.exitDebounceMs <= HOUR_MS)) {
    bad.push("exitDebounceMs");
  }
  if (!(typeof company.exitDecisionWindowMs === "number" && Number.isFinite(company.exitDecisionWindowMs) && company.exitDecisionWindowMs > 0 && company.exitDecisionWindowMs <= DAY_MS)) {
    bad.push("exitDecisionWindowMs");
  }
  if (company.exitDecisionExpiry !== "CONFLICT" && company.exitDecisionExpiry !== "AUTO_IF_CONFIRMED_OUTSIDE") bad.push("exitDecisionExpiry");
  if (typeof company.transitPaid !== "boolean") bad.push("transitPaid");
  if (!isNum(company.transitRateMultiplier, 0, 10)) bad.push("transitRateMultiplier");
  if (typeof company.transitCountsTowardOvertime !== "boolean") bad.push("transitCountsTowardOvertime");
  if (company.employerPortalEnabled !== undefined && typeof company.employerPortalEnabled !== "boolean") bad.push("employerPortalEnabled");
  if (company.timezone !== undefined && !isPayrollTimezone(company.timezone)) bad.push("timezone");
  if (company.calendarHistory !== undefined && !Array.isArray(company.calendarHistory)) bad.push("calendarHistory");
  if (company.arrivalDwellMs !== undefined && !(Number.isInteger(company.arrivalDwellMs) && company.arrivalDwellMs >= 0 && company.arrivalDwellMs <= MAX_ARRIVAL_DWELL_MS)) {
    bad.push("arrivalDwellMs");
  }
  if (company.arrivalAccuracyM !== undefined && !isInt(company.arrivalAccuracyM, 1, 500)) bad.push("arrivalAccuracyM");
  if (company.arrivalReadings !== undefined && !isInt(company.arrivalReadings, 1, 10)) bad.push("arrivalReadings");
  return bad;
}

/**
 * Copia de `defaults` con los campos válidos de `stored`. Un NaN, un null o
 * un rango imposible no sustituye al defecto.
 */
export function sanitizeCompanyPolicy(stored: Partial<CompanyPolicy> | null | undefined, defaults: CompanyPolicy): CompanyPolicy {
  const merged = { ...defaults, ...(stored ?? {}) } as CompanyPolicy;
  const bad = invalidCompanyFields(merged);
  if (!bad.length) return merged;
  const next = { ...merged } as Record<string, unknown>;
  const base = defaults as unknown as Record<string, unknown>;
  for (const field of bad) next[field] = base[field];
  return next as unknown as CompanyPolicy;
}
