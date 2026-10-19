/** Rango libre: presets, tope de un año y semanas laborales sin mezclar la nómina. */
import { makeStatement } from "../../../test/fixtures/payroll.fixture";
import { time } from "../../../test/time";
import { getWeekEnd, getWeekStart, toDateString } from "../dateUtils";
import {
  combineWeekStatements,
  isSingleWorkWeek,
  monthContaining,
  presetRange,
  quincenaContaining,
  validateReportRange,
  workWeeksCovering,
} from "../reportRange";

describe("rango de reportes", () => {
  const now = time.now();

  test("semana actual y anterior coinciden con el calendario laboral", () => {
    const current = presetRange("CURRENT_WEEK", now);
    const start = getWeekStart(now);
    expect(current).toEqual({ start, end: getWeekEnd(start) });
    expect(isSingleWorkWeek(current!)).toBe(true);
    const previous = presetRange("PREVIOUS_WEEK", now);
    expect(previous!.end).toBeLessThan(current!.start);
    expect(isSingleWorkWeek(previous!)).toBe(true);
  });

  test("quincena y mes son días civiles", () => {
    const q = quincenaContaining(now);
    expect(toDateString(q!.start)).toBe("2026-09-16");
    expect(toDateString(q!.end)).toBe("2026-09-30");
    const early = quincenaContaining(Date.parse("2026-09-10T18:00:00.000Z"));
    expect(toDateString(early!.start)).toBe("2026-09-01");
    expect(toDateString(early!.end)).toBe("2026-09-15");
    const month = monthContaining(now);
    expect(toDateString(month!.start)).toBe("2026-09-01");
    expect(toDateString(month!.end)).toBe("2026-09-30");
    expect(workWeeksCovering(month!.start, month!.end).length).toBeGreaterThan(1);
  });

  test("rechaza el orden y un rango de más de un año", () => {
    expect(validateReportRange(20, 10)).toEqual({ ok: false, code: "RANGE_ORDER" });
    expect(validateReportRange(Number.NaN, 10)).toEqual({ ok: false, code: "RANGE_INVALID" });
    const year = 366 * 24 * 60 * 60 * 1000;
    expect(validateReportRange(0, year)).toEqual({ ok: true });
    expect(validateReportRange(0, year + 1)).toEqual({ ok: false, code: "RANGE_TOO_LONG" });
  });

  test("sumar semanas no reparte otra vez las horas extra", () => {
    const a = makeStatement({ regularHours: 40, overtimeHours: 0 });
    const b = makeStatement({ regularHours: 40, overtimeHours: 8 });
    b.periodStart = a.periodEnd + 1;
    b.periodEnd = b.periodStart + 7 * 24 * 60 * 60 * 1000;
    const combined = combineWeekStatements([a, b]);
    expect(combined!.regularHours).toBe(80);
    expect(combined!.overtimeHours).toBe(8);
    expect(combined!.lines).toHaveLength(a.lines.length + b.lines.length);
    expect(combined!.packHash).toBeNull();
  });
});
