/**
 * utils — dateUtils (portado de scripts/check-dates.ts, camino Node + Intl).
 * El script se conserva para ejecutar el camino sin Intl en Hermes real.
 */
import {
  DATE_FALLBACK,
  atTimeOfDay,
  corporateOffsetMinutes,
  formatDate,
  formatDateTime,
  formatRange,
  formatTime,
  getWeekEnd,
  getWeekStart,
  isDateString,
  isValidRange,
  pacificOffsetMinutes,
  parseTimestamp,
  parseWeekPeriodId,
  shiftWeek,
  toDateString,
  toHHmm,
  weekPeriodId,
} from "../dateUtils";

// Sáb 26 sep 2026 23:42:00 PDT (-07:00) = 27 sep 06:42 UTC
const T = Date.UTC(2026, 8, 27, 6, 42, 0);
const W = Date.UTC(2026, 8, 21, 7); // lun 21 sep 2026 00:00 PDT

describe("dateUtils.parseTimestamp", () => {
  test.each<[string, unknown, number]>([
    ["epoch ms number", T, T],
    ["epoch ms string (SQLite TEXT)", String(T), T],
    ["epoch ms float string", `${T}.0`, T],
    ["epoch seconds number", T / 1000, T],
    ["epoch seconds string", String(T / 1000), T],
    ["Date object", new Date(T), T],
    ["ISO Z", new Date(T).toISOString(), T],
    ["ISO offset", "2026-09-27T08:42:00+02:00", T],
    ["ISO offset sin dos puntos", "2026-09-27T08:42:00+0200", T],
    ["SQLite espacio = UTC", "2026-09-27 06:42:00", T],
    ["SQLite con ms", "2026-09-27 06:42:00.000", T],
    ["ISO sin zona = reloj corporativo", "2026-09-26T23:42:00", T],
    ["date-only = medianoche corporativa", "2026-09-26", Date.UTC(2026, 8, 26, 7)],
    ["RFC 1123 (HTTP Date)", "Sun, 27 Sep 2026 06:42:00 GMT", T],
    ["espacios", `  ${T}  `, T],
  ])("%s", (_n, input, expected) => {
    expect(parseTimestamp(input)).toBe(expected);
  });

  test.each<unknown>(["Invalid Date", "", "   ", "abc", "2026-02-30", "2026-13-01", "9/26/2026, 11:42:00 PM", null, undefined, NaN, Infinity, 0, -5, {}, "WInvalid Date"])(
    "inválido → null: %p",
    (bad) => {
      expect(parseTimestamp(bad)).toBeNull();
    },
  );
});

describe("dateUtils formateadores (nunca 'Invalid Date')", () => {
  test("formatos corporativos", () => {
    expect(formatDate(T)).toBe("sáb, 26 sep 2026");
    expect(formatTime(T)).toBe("11:42 PM");
    expect(formatTime(Date.UTC(2026, 8, 27, 7, 5))).toBe("12:05 AM");
    expect(formatTime(Date.UTC(2026, 8, 27, 19, 5))).toBe("12:05 PM");
    expect(formatDate(String(T))).toBe("sáb, 26 sep 2026");
    expect(formatDateTime(T)).toBe("sáb, 26 sep 2026 11:42 PM");
    expect(toHHmm(T)).toBe("23:42");
    expect(atTimeOfDay(T, "08:15")).toBe(Date.UTC(2026, 8, 26, 15, 15));
    expect(atTimeOfDay(T, "25:00")).toBeNull();
    expect(formatRange(W, getWeekEnd(W))).toBe("lun, 21 sep 2026 – dom, 27 sep 2026");
  });

  test.each<unknown>([NaN, null, undefined, 0, "Invalid Date", "garbage"])("fallback con %p", (bad) => {
    expect(formatDate(bad as never)).toBe(DATE_FALLBACK);
    expect(formatTime(bad as never)).toBe(DATE_FALLBACK);
    expect(formatDateTime(bad as never)).toBe(DATE_FALLBACK);
  });

  test("ninguna salida contiene 'Invalid'", () => {
    const outputs = [formatDate(T), formatTime(T), formatDate(NaN), formatRange(NaN, T), formatDateTime("x"), formatRange(NaN, NaN)].join("|");
    expect(outputs).not.toMatch(/invalid/i);
  });
});

describe("dateUtils date_string y semanas", () => {
  test("date_string", () => {
    expect(toDateString(T)).toBe("2026-09-26");
    expect(toDateString(NaN)).toBe("");
    expect(isDateString("2026-09-26")).toBe(true);
    expect(isDateString("Invalid Date")).toBe(false);
    expect(isDateString("2026-02-30")).toBe(false);
  });

  test("semanas lunes 00:00 corporativo y periodId", () => {
    expect(getWeekStart(T)).toBe(W);
    expect(getWeekEnd(T)).toBe(Date.UTC(2026, 8, 28, 7) - 1);
    expect(getWeekStart(W)).toBe(W);
    expect(getWeekStart(String(T))).toBe(W);
    expect(Number.isNaN(getWeekStart(NaN))).toBe(true);
    expect(shiftWeek(W, -1)).toBe(Date.UTC(2026, 8, 14, 7));
    expect(weekPeriodId(T)).toBe("W2026-09-21");
    expect(weekPeriodId(NaN)).toBe("");
    expect(parseWeekPeriodId("W2026-09-21")).toEqual({ start: W, end: Date.UTC(2026, 8, 28, 7) - 1 });
    expect(parseWeekPeriodId("W2026-09-24")?.start).toBe(W);
    expect(parseWeekPeriodId("WInvalid Date")).toBeNull();
    expect(parseWeekPeriodId("W2026-02-31")).toBeNull();
    expect(isValidRange(W, getWeekEnd(W))).toBe(true);
    expect(isValidRange(NaN, W)).toBe(false);
  });

  test("DST fin (1 nov 2026) e inicio (8 mar 2026)", () => {
    const O = Date.UTC(2026, 9, 26, 7);
    expect(getWeekStart(Date.UTC(2026, 10, 1, 20))).toBe(O);
    expect(getWeekEnd(O)).toBe(Date.UTC(2026, 10, 2, 8) - 1);
    expect(shiftWeek(O, 1)).toBe(Date.UTC(2026, 10, 2, 8));
    expect(pacificOffsetMinutes(Date.UTC(2026, 2, 8, 9, 59))).toBe(-480);
    expect(pacificOffsetMinutes(Date.UTC(2026, 2, 8, 10, 0))).toBe(-420);
    expect(shiftWeek(Date.UTC(2026, 2, 2, 8), 1)).toBe(Date.UTC(2026, 2, 9, 7));
  });

  test("offset efectivo (Intl) == reglas US Pacific, cada hora 2025–2030", () => {
    let mismatches = 0;
    for (let ts = Date.UTC(2025, 0, 1); ts < Date.UTC(2031, 0, 1); ts += 3_600_000) {
      if (corporateOffsetMinutes(ts) !== pacificOffsetMinutes(ts)) mismatches++;
    }
    expect(mismatches).toBe(0);
  });
});
