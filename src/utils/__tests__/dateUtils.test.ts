/**
 * utils — dateUtils (portado de scripts/check-dates.ts, camino Node + Intl).
 * El script se conserva para ejecutar el camino sin Intl en Hermes real.
 */
import {
  DATE_FALLBACK,
  atTimeOfDay,
  atTimeOfDayAfter,
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
  resolveSessionEditTimes,
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

describe("dateUtils — idioma y reloj de los formateadores", () => {
  const { setLanguage } = require("../../i18n") as typeof import("../../i18n");
  afterEach(() => setLanguage("es"));

  test("ES por defecto (idioma activo es)", () => {
    expect(formatDate(T)).toBe("sáb, 26 sep 2026");
    expect(formatTime(T)).toBe("11:42 PM");
  });

  test("EN explícito: días y meses en inglés", () => {
    expect(formatDate(T, { lang: "en" })).toBe("Sat, Sep 26, 2026");
    expect(formatDateTime(T, { lang: "en" })).toBe("Sat, Sep 26, 2026 11:42 PM");
    expect(formatRange(W, T, { lang: "en" })).toBe("Mon, Sep 21, 2026 – Sat, Sep 26, 2026");
  });

  test("sin opción, sigue el idioma activo (getLanguage)", () => {
    setLanguage("en");
    expect(formatDate(T)).toBe("Sat, Sep 26, 2026");
    // lang explícito gana sobre el idioma activo (documentos de evidencia en ES).
    expect(formatDate(T, { lang: "es" })).toBe("sáb, 26 sep 2026");
  });

  test("reloj de 24 h opcional", () => {
    expect(formatTime(T, { clock: "24h" })).toBe("23:42");
    expect(formatTime(Date.UTC(2026, 8, 27, 7, 5), { clock: "24h" })).toBe("00:05");
    expect(formatDateTime(T, { lang: "es", clock: "24h" })).toBe("sáb, 26 sep 2026 23:42");
  });

  test("entradas inválidas siguen devolviendo el fallback en EN", () => {
    expect(formatDate(NaN, { lang: "en" })).toBe(DATE_FALLBACK);
    expect(formatTime("x", { clock: "24h" })).toBe(DATE_FALLBACK);
  });
});

describe("resolveSessionEditTimes (edición, N6 solo si el usuario cambia un reloj)", () => {
  // lun 21 sep 2026 01:56:10.000 PDT
  const SAME_MIN_START = Date.UTC(2026, 8, 21, 8, 56, 10);
  const SAME_MIN_END = SAME_MIN_START + 30_000;
  const DAY = 24 * 60 * 60 * 1000;

  test("HH:mm sin tocar conservan los ms: una sesión del mismo minuto no pasa a 24 h", () => {
    const r = resolveSessionEditTimes(SAME_MIN_START, SAME_MIN_END, "01:56", "01:56");
    expect(r).toMatchObject({
      start: SAME_MIN_START,
      end: SAME_MIN_END,
      invalidStart: false,
      invalidEnd: false,
      timesChanged: false,
      nextDay: false,
    });
    expect(r.end! - r.start!).toBe(30_000);
    // El primitivo N6, aplicado a los HH:mm reconstruidos, sí saltaría un día.
    const rebuilt = atTimeOfDay(SAME_MIN_START, "01:56")!;
    expect(atTimeOfDayAfter(rebuilt, "01:56")).toBe(rebuilt + DAY);
  });

  test("HH:mm sin tocar no truncan segundos de una jornada normal", () => {
    const start = Date.UTC(2026, 8, 21, 15, 0, 30); // 08:00:30 PDT
    const end = Date.UTC(2026, 8, 22, 0, 0, 45); // 17:00:45 PDT
    const r = resolveSessionEditTimes(start, end, toHHmm(start), toHHmm(end));
    expect(r.start).toBe(start);
    expect(r.end).toBe(end);
    expect(r.timesChanged).toBe(false);
    expect(r.nextDay).toBe(false);
  });

  test("turno de 24 h ya guardado (mismos HH:mm, día distinto) se conserva y se anuncia", () => {
    const start = Date.UTC(2026, 8, 21, 8, 56, 0);
    const end = start + DAY;
    const r = resolveSessionEditTimes(start, end, "01:56", "01:56");
    expect(r.start).toBe(start);
    expect(r.end).toBe(end);
    expect(r.timesChanged).toBe(false);
    expect(r.nextDay).toBe(true);
  });

  test("cambiar solo la salida conserva los segundos de la entrada y no salta de día", () => {
    const r = resolveSessionEditTimes(SAME_MIN_START, SAME_MIN_END, "01:56", "01:57");
    expect(r.start).toBe(SAME_MIN_START);
    expect(r.end).toBe(Date.UTC(2026, 8, 21, 8, 57, 0));
    expect(r.timesChanged).toBe(true);
    expect(r.nextDay).toBe(false);
  });

  test("cambiar solo la entrada conserva la salida si sigue siendo posterior", () => {
    const start = Date.UTC(2026, 8, 21, 15, 0, 30);
    const end = Date.UTC(2026, 8, 22, 0, 0, 45);
    const r = resolveSessionEditTimes(start, end, "07:30", "17:00");
    expect(r.start).toBe(Date.UTC(2026, 8, 21, 14, 30, 0));
    expect(r.end).toBe(end);
    expect(r.timesChanged).toBe(true);
    expect(r.nextDay).toBe(false);
  });

  test("igualdad tecleada a propósito (N6): los dos relojes nuevos son un turno de 24 h", () => {
    const start = Date.UTC(2026, 8, 21, 15, 15, 30); // 08:15:30
    const end = Date.UTC(2026, 8, 22, 0, 0, 45); // 17:00:45
    const r = resolveSessionEditTimes(start, end, "09:00", "09:00");
    expect(r.timesChanged).toBe(true);
    expect(r.nextDay).toBe(true);
    expect(r.start).toBe(Date.UTC(2026, 8, 21, 16, 0, 0));
    expect(r.end).toBe(Date.UTC(2026, 8, 22, 16, 0, 0));
    expect(r.end! - r.start!).toBe(DAY);
  });

  test("poner la salida en el mismo HH:mm de la entrada, sin tocar la entrada, también es N6", () => {
    const start = Date.UTC(2026, 8, 21, 15, 0, 30); // 08:00:30
    const end = Date.UTC(2026, 8, 22, 0, 0, 45); // 17:00:45
    const r = resolveSessionEditTimes(start, end, "08:00", "08:00");
    expect(r.start).toBe(start);
    expect(r.end).toBe(atTimeOfDayAfter(start, "08:00"));
    expect(r.nextDay).toBe(true);
    expect(r.timesChanged).toBe(true);
    expect(r.end! - r.start!).toBe(DAY - 30_000);
  });

  test("mover la entrada por delante de la salida guardada relee esa salida con N6", () => {
    const start = Date.UTC(2026, 8, 21, 15, 0, 0); // 08:00
    const end = Date.UTC(2026, 8, 22, 0, 0, 0); // 17:00
    const r = resolveSessionEditTimes(start, end, "18:00", "17:00");
    expect(r.start).toBe(Date.UTC(2026, 8, 22, 1, 0, 0)); // lun 21 sep 18:00 PDT
    expect(r.end).toBe(Date.UTC(2026, 8, 23, 0, 0, 0)); // mar 22 sep 17:00 PDT
    expect(r.nextDay).toBe(true);
    expect(r.timesChanged).toBe(true);
  });

  test("hora imposible no marca la sesión como cambiada", () => {
    const r = resolveSessionEditTimes(SAME_MIN_START, SAME_MIN_END, "25:00", "01:56");
    expect(r.invalidStart).toBe(true);
    expect(r.start).toBeNull();
    expect(r.timesChanged).toBe(false);
    expect(r.nextDay).toBe(false);
  });
});
