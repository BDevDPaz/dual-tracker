/**
 * Rango libre de Reportes. No calcula nómina: parte el intervalo en semanas
 * laborales para que cada una pase por el motor que ya existe.
 */
import type { PayrollStatement } from "../core/contracts/payroll";
import { REPORT_MAX_RANGE_MS } from "../config/provisional";
import { fromWallClock, getWeekEnd, getWeekStart, isDateString, shiftWeek, toDateString, type CalendarHistory } from "./dateUtils";

export type RangePreset = "CURRENT_WEEK" | "PREVIOUS_WEEK" | "QUINCENA" | "MONTH" | "CUSTOM";

export interface ClosedRange {
  start: number;
  end: number;
}

export type RangeError = "RANGE_INVALID" | "RANGE_ORDER" | "RANGE_TOO_LONG";

function civil(ts: number): { y: number; m: number; d: number } | null {
  const text = toDateString(ts);
  if (!isDateString(text)) return null;
  const [y, m, d] = text.split("-").map(Number);
  return { y, m, d };
}

/** Inicio inclusive y fin inclusive (…999) de un día civil corporativo. */
export function corporateDayBounds(ymd: string): ClosedRange | null {
  if (!isDateString(ymd)) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  const start = fromWallClock(y, m, d);
  const end = fromWallClock(y, m, d + 1) - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return { start, end };
}

export function quincenaContaining(nowMs: number): ClosedRange | null {
  const c = civil(nowMs);
  if (!c) return null;
  if (c.d <= 15) {
    const start = fromWallClock(c.y, c.m, 1);
    const end = fromWallClock(c.y, c.m, 16) - 1;
    return { start, end };
  }
  const start = fromWallClock(c.y, c.m, 16);
  const end = fromWallClock(c.y, c.m + 1, 1) - 1;
  return { start, end };
}

export function monthContaining(nowMs: number): ClosedRange | null {
  const c = civil(nowMs);
  if (!c) return null;
  return { start: fromWallClock(c.y, c.m, 1), end: fromWallClock(c.y, c.m + 1, 1) - 1 };
}

export function presetRange(preset: Exclude<RangePreset, "CUSTOM">, nowMs: number, history?: CalendarHistory | null): ClosedRange | null {
  if (preset === "CURRENT_WEEK") {
    const start = getWeekStart(nowMs, history);
    return Number.isFinite(start) ? { start, end: getWeekEnd(start, history) } : null;
  }
  if (preset === "PREVIOUS_WEEK") {
    const current = getWeekStart(nowMs, history);
    if (!Number.isFinite(current)) return null;
    const start = shiftWeek(current, -1, history);
    return Number.isFinite(start) ? { start, end: getWeekEnd(start, history) } : null;
  }
  if (preset === "QUINCENA") return quincenaContaining(nowMs);
  return monthContaining(nowMs);
}

export function validateReportRange(start: number, end: number, maxMs = REPORT_MAX_RANGE_MS): { ok: true } | { ok: false; code: RangeError } {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { ok: false, code: "RANGE_INVALID" };
  if (end < start) return { ok: false, code: "RANGE_ORDER" };
  if (end - start > maxMs) return { ok: false, code: "RANGE_TOO_LONG" };
  return { ok: true };
}

/** Semanas laborales que tocan [start, end], cada una con sus límites completos. */
export function workWeeksCovering(start: number, end: number, history?: CalendarHistory | null): ClosedRange[] {
  const first = getWeekStart(start, history);
  const last = getWeekStart(end, history);
  if (!Number.isFinite(first) || !Number.isFinite(last)) return [];
  const weeks: ClosedRange[] = [];
  let cursor = first;
  for (let guard = 0; guard < 60 && cursor <= last; guard++) {
    const weekEnd = getWeekEnd(cursor, history);
    if (!Number.isFinite(weekEnd)) break;
    weeks.push({ start: cursor, end: weekEnd });
    const next = shiftWeek(cursor, 1, history);
    if (!Number.isFinite(next) || next <= cursor) break;
    cursor = next;
  }
  return weeks;
}

export function isSingleWorkWeek(range: ClosedRange, history?: CalendarHistory | null): boolean {
  const weeks = workWeeksCovering(range.start, range.end, history);
  return weeks.length === 1 && weeks[0].start === range.start && weeks[0].end === range.end;
}

/** Suma las líneas de los statements semanales. No vuelve a repartir horas extra. */
export function combineWeekStatements(weeks: readonly PayrollStatement[]): PayrollStatement | null {
  if (!weeks.length) return null;
  const lines = weeks.flatMap((w) => w.lines);
  const sessionIds = [...new Set(weeks.flatMap((w) => w.sessionIds))];
  const byClass = { VALID: 0, MANUAL: 0, AUTO: 0, CONFLICT: 0 };
  let blocked = 0;
  for (const w of weeks) {
    byClass.VALID += w.integrityRollup.byClass.VALID;
    byClass.MANUAL += w.integrityRollup.byClass.MANUAL;
    byClass.AUTO += w.integrityRollup.byClass.AUTO;
    byClass.CONFLICT += w.integrityRollup.byClass.CONFLICT;
    blocked += w.integrityRollup.blockedCount ?? 0;
  }
  const hasConflict = weeks.some((w) => w.integrityRollup.hasConflict);
  const childCertified = weeks.every((w) => w.integrityRollup.certified);
  const classLists = weeks.every((w) => Array.isArray(w.sessionClasses)) ? weeks.flatMap((w) => w.sessionClasses ?? []) : null;
  if (classLists) {
    const seen = new Map<number, (typeof classLists)[number]>();
    for (const row of classLists) seen.set(row.id, row);
    byClass.VALID = 0;
    byClass.MANUAL = 0;
    byClass.AUTO = 0;
    byClass.CONFLICT = 0;
    blocked = 0;
    for (const row of seen.values()) {
      byClass[row.integrityClass] += 1;
      if (row.blocked) blocked += 1;
    }
  }
  const warnings = [...new Set(weeks.flatMap((w) => w.warnings))];
  const double = weeks.reduce((a, w) => a + (w.overtimeDoubleHours ?? 0), 0);
  const rules = [...new Set(weeks.flatMap((w) => w.appliedRules ?? []))];
  return {
    periodStart: weeks[0].periodStart,
    periodEnd: weeks[weeks.length - 1].periodEnd,
    lines,
    regularHours: weeks.reduce((a, w) => a + w.regularHours, 0),
    overtimeHours: weeks.reduce((a, w) => a + w.overtimeHours, 0),
    transitHours: weeks.reduce((a, w) => a + w.transitHours, 0),
    lunchMinutes: weeks.reduce((a, w) => a + w.lunchMinutes, 0),
    grossEstimate: weeks.reduce((a, w) => a + w.grossEstimate, 0),
    integrityRollup: {
      total: byClass.VALID + byClass.MANUAL + byClass.AUTO + byClass.CONFLICT,
      byClass,
      hasConflict,
      certified: childCertified && !hasConflict && blocked === 0,
      ...(blocked > 0 ? { blockedCount: blocked } : {}),
    },
    policyId: weeks[0].policyId,
    packHash: null,
    overtimeDailyHours: weeks.reduce((a, w) => a + w.overtimeDailyHours, 0),
    overtimeWeeklyHours: weeks.reduce((a, w) => a + w.overtimeWeeklyHours, 0),
    deductionMinutes: weeks.reduce((a, w) => a + w.deductionMinutes, 0),
    sessionIds,
    warnings,
    ...(double > 0 ? { overtimeDoubleHours: double } : {}),
    ...(rules.length ? { appliedRules: rules } : {}),
  };
}
