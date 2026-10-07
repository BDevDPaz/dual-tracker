/**
 * Sanity checks de src/utils/dateUtils.ts (parser/formatter seguros para Hermes)
 * y del criterio "solo jornadas CERRADAS" de PayrollEngine.
 *
 *   Node (camino Intl):   npx -y tsx scripts/check-dates.ts
 *   Hermes (sin Intl →    npx -y esbuild scripts/check-dates.ts --bundle --target=es2017 --outfile=/tmp/check-dates.js
 *   camino aritmético):   hermes /tmp/check-dates.js
 *
 * Los formatos probados son los que la app realmente guarda: epoch ms en
 * columnas INTEGER *_ms (SQLite puede devolverlas como número o texto),
 * date_string "YYYY-MM-DD" (y el "Invalid Date" que persistían builds previos),
 * periodId "W<YYYY-MM-DD>", ISO de nowIso() y cabecera HTTP Date.
 */
import type { CompanyPolicy, SessionRecord } from "../src/core/contracts";
import { PayrollEngineService } from "../src/services/domain/PayrollEngineService";
import {
  DATE_FALLBACK,
  corporateOffsetMinutes,
  formatDate,
  formatDateTime,
  formatRange,
  formatTime,
  getWeekEnd,
  getWeekStart,
  isDateString,
  pacificOffsetMinutes,
  parseTimestamp,
  parseWeekPeriodId,
  shiftWeek,
  toDateString,
  toHHmm,
  atTimeOfDay,
  atTimeOfDayAfter,
  resolveSessionEditTimes,
  weekPeriodId,
  nextWorkdayBoundary,
  parsePeriodId,
  periodIdAt,
  shiftPeriod,
  workdayStartAt,
  workweekEndAt,
  workweekStartAt,
  type CalendarHistory,
} from "../src/utils/dateUtils";

declare const print: ((...a: unknown[]) => void) | undefined;
const log = (msg: string) => (typeof print === "function" ? print(msg) : console.log(msg));
const engine = typeof (globalThis as { HermesInternal?: unknown }).HermesInternal !== "undefined" ? "Hermes" : "Node";
const hasIntl = typeof Intl !== "undefined";

let failed = 0;
let passed = 0;
function eq(name: string, actual: unknown, expected: unknown) {
  const ok = Object.is(actual, expected) || JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else {
    failed++;
    log(`FAIL ${name}: got ${JSON.stringify(actual)} expected ${JSON.stringify(expected)}`);
  }
}

// Sáb 26 sep 2026 23:42:00 PDT (-07:00) = 27 sep 06:42 UTC
const T = Date.UTC(2026, 8, 27, 6, 42, 0);

// --- Parser central -------------------------------------------------------
eq("epoch ms number", parseTimestamp(T), T);
eq("epoch ms string (SQLite TEXT)", parseTimestamp(String(T)), T);
eq("epoch ms float string", parseTimestamp(`${T}.0`), T);
eq("epoch seconds number", parseTimestamp(T / 1000), T);
eq("epoch seconds string", parseTimestamp(String(T / 1000)), T);
eq("Date object", parseTimestamp(new Date(T)), T);
eq("ISO Z (nowIso)", parseTimestamp(new Date(T).toISOString()), T);
eq("ISO offset", parseTimestamp("2026-09-27T08:42:00+02:00"), T);
eq("ISO offset no colon", parseTimestamp("2026-09-27T08:42:00+0200"), T);
eq("SQLite space format = UTC", parseTimestamp("2026-09-27 06:42:00"), T);
eq("SQLite space format w/ ms", parseTimestamp("2026-09-27 06:42:00.000"), T);
eq("ISO T sin zona = reloj corporativo", parseTimestamp("2026-09-26T23:42:00"), T);
eq("date-only = medianoche corporativa", parseTimestamp("2026-09-26"), Date.UTC(2026, 8, 26, 7));
eq("RFC 1123 (HTTP Date)", parseTimestamp("Sun, 27 Sep 2026 06:42:00 GMT"), T);
eq("whitespace", parseTimestamp(`  ${T}  `), T);
for (const bad of ["Invalid Date", "", "   ", "abc", "2026-02-30", "2026-13-01", "9/26/2026, 11:42:00 PM", null, undefined, NaN, Infinity, 0, -5, {}, "WInvalid Date"]) {
  eq(`invalid → null: ${String(bad)}`, parseTimestamp(bad), null);
}

// --- Formateadores: nunca "Invalid Date" ------------------------------------
eq("formatDate", formatDate(T), "sáb, 26 sep 2026");
eq("formatTime", formatTime(T), "11:42 PM");
eq("formatTime midnight", formatTime(Date.UTC(2026, 8, 27, 7, 5)), "12:05 AM");
eq("formatTime noon", formatTime(Date.UTC(2026, 8, 27, 19, 5)), "12:05 PM");
eq("formatDate string ms", formatDate(String(T)), "sáb, 26 sep 2026");
eq("formatDateTime", formatDateTime(T), "sáb, 26 sep 2026 11:42 PM");
eq("toHHmm", toHHmm(T), "23:42");
eq("atTimeOfDay", atTimeOfDay(T, "08:15"), Date.UTC(2026, 8, 26, 15, 15));
eq("atTimeOfDay invalid", atTimeOfDay(T, "25:00"), null);
// Edición: HH:mm sin tocar no reconstruye (N6 solo si el usuario cambia un reloj).
const SAME_MIN = Date.UTC(2026, 8, 21, 8, 56, 10);
const sameMin = resolveSessionEditTimes(SAME_MIN, SAME_MIN + 30_000, "01:56", "01:56");
eq("edit untouched same minute keeps ms", sameMin.end! - sameMin.start!, 30_000);
eq("edit untouched same minute not next day", sameMin.nextDay, false);
eq("edit untouched same minute not changed", sameMin.timesChanged, false);
const rebuilt = atTimeOfDay(SAME_MIN, "01:56")!;
eq("N6 equal clock is still +24h", atTimeOfDayAfter(rebuilt, "01:56"), rebuilt + 24 * 60 * 60 * 1000);
const typedEqual = resolveSessionEditTimes(Date.UTC(2026, 8, 21, 15), Date.UTC(2026, 8, 22, 0), "09:00", "09:00");
eq("edit typed equal clocks is next day", typedEqual.nextDay, true);
eq("edit typed equal clocks is 24h", typedEqual.end! - typedEqual.start!, 24 * 60 * 60 * 1000);
for (const bad of [NaN, null, undefined, 0, "Invalid Date", "garbage"]) {
  eq(`formatDate fallback ${String(bad)}`, formatDate(bad as never), DATE_FALLBACK);
  eq(`formatTime fallback ${String(bad)}`, formatTime(bad as never), DATE_FALLBACK);
  eq(`formatDateTime fallback ${String(bad)}`, formatDateTime(bad as never), DATE_FALLBACK);
}
eq("formatRange invalid", formatRange(NaN, NaN), DATE_FALLBACK);
const outputs = [formatDate(T), formatTime(T), formatDate(NaN), formatRange(NaN, T), formatDateTime("x")].join("|");
eq("no 'Invalid' anywhere", /invalid/i.test(outputs), false);

// --- date_string ----------------------------------------------------------
eq("toDateString", toDateString(T), "2026-09-26");
eq("toDateString invalid", toDateString(NaN), "");
eq("isDateString ok", isDateString("2026-09-26"), true);
eq("isDateString 'Invalid Date'", isDateString("Invalid Date"), false);
eq("isDateString 2026-02-30", isDateString("2026-02-30"), false);

// --- Semanas (lunes 00:00 corporativo) -----------------------------------
const W = Date.UTC(2026, 8, 21, 7); // lun 21 sep 2026 00:00 PDT
eq("getWeekStart", getWeekStart(T), W);
eq("getWeekEnd", getWeekEnd(T), Date.UTC(2026, 8, 28, 7) - 1);
eq("getWeekStart idempotent", getWeekStart(W), W);
eq("getWeekStart string ms", getWeekStart(String(T)), W);
eq("getWeekStart invalid → NaN", Number.isNaN(getWeekStart(NaN)), true);
eq("shiftWeek -1", shiftWeek(W, -1), Date.UTC(2026, 8, 14, 7));
eq("weekPeriodId", weekPeriodId(W), "W2026-09-21");
eq("weekPeriodId from mid-week", weekPeriodId(T), "W2026-09-21");
eq("weekPeriodId invalid", weekPeriodId(NaN), "");
eq("parseWeekPeriodId", parseWeekPeriodId("W2026-09-21"), { start: W, end: Date.UTC(2026, 8, 28, 7) - 1 });
eq("parseWeekPeriodId non-monday", parseWeekPeriodId("W2026-09-24")?.start, W);
eq("parseWeekPeriodId 'WInvalid Date'", parseWeekPeriodId("WInvalid Date"), null);
eq("parseWeekPeriodId bad date", parseWeekPeriodId("W2026-02-31"), null);
eq("formatRange week", formatRange(W, getWeekEnd(W)), "lun, 21 sep 2026 – dom, 27 sep 2026");

// DST fin (dom 1 nov 2026): semana lun 26 oct PDT → dom 1 nov PST
const O = Date.UTC(2026, 9, 26, 7);
eq("DST-end week start", getWeekStart(Date.UTC(2026, 10, 1, 20)), O);
eq("DST-end week end", getWeekEnd(O), Date.UTC(2026, 10, 2, 8) - 1);
eq("DST-end shiftWeek +1", shiftWeek(O, 1), Date.UTC(2026, 10, 2, 8));
// DST inicio (dom 8 mar 2026 02:00 PST)
eq("DST-start before", pacificOffsetMinutes(Date.UTC(2026, 2, 8, 9, 59)), -480);
eq("DST-start after", pacificOffsetMinutes(Date.UTC(2026, 2, 8, 10, 0)), -420);
eq("DST-start week", shiftWeek(Date.UTC(2026, 2, 2, 8), 1), Date.UTC(2026, 2, 9, 7));

// Offset efectivo (Intl si existe) == reglas DST, cada hora 2025–2030
let mismatches = 0;
for (let ts = Date.UTC(2025, 0, 1); ts < Date.UTC(2031, 0, 1); ts += 3_600_000) {
  if (corporateOffsetMinutes(ts) !== pacificOffsetMinutes(ts)) mismatches++;
}
eq("corporate offset == US Pacific rules (hourly 2025-2030)", mismatches, 0);

// --- Filtro "Esta semana" + nómina: solo jornadas CERRADAS -----------------
const company: CompanyPolicy = {
  employerName: "",
  companyEmail: "",
  overtimeMultiplier: 1.5,
  overtimePolicyId: "CA_DAILY8_WEEKLY40_V1",
  defaultRadiusM: 200,
  destinationLimit: 10,
  traceRetentionDays: 90,
  traceMode: "PERIMETER",
  exitDebounceMs: 120000,
  exitDecisionWindowMs: 600000,
  exitDecisionExpiry: "CONFLICT",
  transitPaid: true,
  transitRateMultiplier: 1,
  transitCountsTowardOvertime: true,
};
const mk = (id: number, start: number, end: number | null, status: SessionRecord["domainStatus"]): SessionRecord => ({
  id,
  declaredStartAtMs: start,
  actualStartAtMs: start,
  endAtMs: end,
  domainStatus: status,
  siteId: 1,
  clientId: null,
  lunch: { taken: false, startAtMs: null, endAtMs: null, deductedMinutes: null },
  totalPausedMs: 0,
  transitSegments: [],
  integrityClass: "VALID",
  policyId: company.overtimePolicyId,
  bookkeeping: {
    dateString: toDateString(start),
    isDeleted: false,
    cancelled: false,
    lastPauseStartMs: null,
    firstExitAtMs: null,
    firstExitReliable: null,
    integrityReason: "CLEAN",
    original: null,
    manualNote: null,
    updatedAtMs: start,
  },
});
const start = T - 3 * 60_000;
const ws = getWeekStart(T);
const we = getWeekEnd(T);
eq("open session inside current week range", start >= ws && start <= we, true);
const base = { periodStart: ws, periodEnd: we, rates: { hourlyRate: 85, overtimeMultiplier: 1.5 }, company, policyId: company.overtimePolicyId, nowMs: T };
const openSt = PayrollEngineService.buildStatement({ ...base, sessions: [mk(1, start, null, "ACTIVA")] });
eq("open-only → 0 sessionIds", openSt.sessionIds.length, 0);
eq("open-only → OPEN_SESSION_EXCLUDED", openSt.warnings.includes("OPEN_SESSION_EXCLUDED"), true);
const closedSt = PayrollEngineService.buildStatement({ ...base, sessions: [mk(2, T - 2 * 3_600_000, T - 3_600_000, "CERRADA"), mk(1, start, null, "ACTIVA")] });
eq("closed session counted", closedSt.sessionIds, [2]);
eq("closed session V1", closedSt.integrityRollup.byClass.VALID, 1);
eq("closed session regular hours", closedSt.regularHours, 1);
eq("closed session dateString in lines", closedSt.lines[0]?.dateString, "2026-09-26");

// --- Calendario laboral no por defecto (spec v1.3 §5.1) --------------------
// E = lun 28 sep 2026 00:00 PDT (fin de la semana que contiene T).
const E = Date.UTC(2026, 8, 28, 7);
const H6: CalendarHistory = [
  { effectiveFromMs: 0, workdayStartMinutes: 0, workweekStartDay: 1 },
  { effectiveFromMs: E, workdayStartMinutes: 360, workweekStartDay: 1 },
];
const HSUN: CalendarHistory = [
  { effectiveFromMs: 0, workdayStartMinutes: 0, workweekStartDay: 1 },
  { effectiveFromMs: E, workdayStartMinutes: 0, workweekStartDay: 0 },
];
eq("cal: semana en curso sin cambios", workweekStartAt(T, H6), W);
eq("cal: fin de semana en curso = E-1", workweekEndAt(T, H6), E - 1);
eq("cal: límite de jornada en E", nextWorkdayBoundary(E - 3_600_000, H6), E);
eq("cal: primera jornada nueva E→06:00", nextWorkdayBoundary(E, H6), Date.UTC(2026, 8, 28, 13));
eq("cal: jornada 06:00 (03:00 → día anterior)", workdayStartAt(Date.UTC(2026, 9, 1, 10), H6), Date.UTC(2026, 8, 30, 13));
eq("cal: transición 06:00 id", periodIdAt(E, H6), "T2026-09-28");
eq("cal: semana nueva 06:00 id", periodIdAt(Date.UTC(2026, 9, 1, 12), H6), "W2026-09-28");
eq("cal: semana nueva 06:00 inicio", workweekStartAt(Date.UTC(2026, 9, 1, 12), H6), Date.UTC(2026, 8, 28, 13));
eq("cal: lun→dom transición 6 días", (workweekEndAt(E, HSUN) + 1 - E) / 86_400_000, 6);
eq("cal: lun→dom id T", periodIdAt(E + 3_600_000, HSUN), "T2026-09-28");
eq("cal: lun→dom semana siguiente W", periodIdAt(Date.UTC(2026, 9, 4, 8), HSUN), "W2026-10-04");
eq("cal: parse T", parsePeriodId("T2026-09-28", HSUN), { start: E, end: Date.UTC(2026, 9, 4, 7) - 1 });
eq("cal: parse W", parsePeriodId("W2026-10-04", HSUN)?.start, Date.UTC(2026, 9, 4, 7));
eq("cal: parse T inexistente", parsePeriodId("T2026-09-21", HSUN), null);
eq("cal: shift -1 desde W → T", shiftPeriod(Date.UTC(2026, 9, 4, 7), -1, HSUN), E);
eq("cal: shift -1 desde T → W previa", shiftPeriod(E, -1, HSUN), W);
eq("cal: shift +2 desde W previa", shiftPeriod(W, 2, HSUN), Date.UTC(2026, 9, 4, 7));
eq("cal: por defecto = getWeekStart", workweekStartAt(T, null), getWeekStart(T));
// Otoño (1 nov 2026, 25 h) con jornada 06:00: la jornada del sáb 31 oct dura 25 h reales.
const HOCT: CalendarHistory = [{ effectiveFromMs: 0, workdayStartMinutes: 360, workweekStartDay: 1 }];
eq("cal: jornada DST otoño 25 h", (nextWorkdayBoundary(Date.UTC(2026, 10, 1, 7), HOCT) - workdayStartAt(Date.UTC(2026, 10, 1, 7), HOCT)) / 3_600_000, 25);

log(`[${engine}${hasIntl ? " + Intl" : " sin Intl"}] ${passed} passed, ${failed} failed`);
if (failed > 0) {
  if (typeof process !== "undefined") process.exit(1);
  else throw new Error(`${failed} checks failed`);
}
