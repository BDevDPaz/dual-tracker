/**
 * Accesores puros de CompanyPolicy con valores por defecto (spec v1.3 §5.1/§5.6).
 * Pantallas, dominio y aplicación leen el calendario y las banderas legales por aquí.
 */
import type { CompanyPolicy, PayrollLegalFlags } from "../core/contracts/settings";
import { CORPORATE_TIMEZONE, DEFAULT_CALENDAR_HISTORY, isPayrollTimezone, type CalendarHistory, type PayrollTimezone } from "./dateUtils";

export const DEFAULT_LEGAL_FLAGS: PayrollLegalFlags = Object.freeze({
  transitionWeeklyThreshold: "FULL",
  caDoubleTime: false,
  caSeventhDay: false,
});

/** Zona de pared de la empresa. Un id desconocido o ausente es Los Ángeles. */
export function companyTimezone(company: { timezone?: string | null } | null | undefined): PayrollTimezone {
  return isPayrollTimezone(company?.timezone) ? company.timezone : CORPORATE_TIMEZONE;
}

/** Historial de calendario de la empresa (por defecto 00:00 / lunes). */
export function companyCalendar(company: Pick<CompanyPolicy, "calendarHistory"> | null | undefined): CalendarHistory {
  const h = company?.calendarHistory;
  return h && h.length ? [...h].sort((a, b) => a.effectiveFromMs - b.effectiveFromMs) : DEFAULT_CALENDAR_HISTORY;
}

/** Banderas legales efectivas. */
export function legalFlags(company: Pick<CompanyPolicy, "payrollLegalFlags"> | null | undefined): PayrollLegalFlags {
  return { ...DEFAULT_LEGAL_FLAGS, ...(company?.payrollLegalFlags ?? {}) };
}

/** Cambio de calendario pendiente (entrada con effectiveFromMs > nowMs), si existe. */
export function pendingCalendarChange(company: Pick<CompanyPolicy, "calendarHistory"> | null | undefined, nowMs: number) {
  const h = companyCalendar(company);
  const last = h[h.length - 1];
  return last && last.effectiveFromMs > nowMs ? last : null;
}
