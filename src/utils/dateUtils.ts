// --- src/utils/dateUtils.ts --- (portado de GEOTrack, sin lecturas de reloj)
import dayjs from "./dayjsSetup";

/** Formatea un timestamp a hora local corporativa (Ej: 08:30 AM). */
export const formatTime = (timestamp: number | null | undefined): string => {
  if (!timestamp) return "--:--";
  return dayjs.tz(timestamp).format("hh:mm A");
};

/** Formatea un timestamp a fecha legible (Ej: dom., 31 may. 2026). */
export const formatDate = (timestamp: number | null | undefined): string => {
  if (!timestamp) return "---";
  return dayjs.tz(timestamp).format("ddd, D MMM YYYY");
};

/** Convierte milisegundos a una cadena de duración (Ej: 8h 30m). */
export const formatDuration = (ms: number): string => {
  if (!ms || ms < 0) return "0h 0m";
  const d = dayjs.duration(ms);
  const h = Math.floor(d.asHours());
  const m = d.minutes();
  return `${h}h ${m}m`;
};

/** Horas decimales con 2 decimales (Ej: 8.25 h). */
export const formatHours = (hours: number): string =>
  `${(Number.isFinite(hours) ? hours : 0).toFixed(2)} h`;

/** Moneda USD simple (heredado de ReportGenerator de GEOTrack/LEDTracker). */
export const formatCurrency = (amount: number): string =>
  `$${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`;

/** Fecha YYYY-MM-DD de un timestamp en la zona corporativa. */
export const toDateString = (ts: number): string =>
  dayjs.tz(ts).format("YYYY-MM-DD");

/**
 * Inicio de semana ISO (lunes 00:00, zona corporativa) que contiene `ts`.
 * Usado por Historial (flechas de semana) y por PayrollEngine (overtime semanal).
 */
export const getWeekStart = (ts: number): number =>
  dayjs.tz(ts).startOf("isoWeek").valueOf();

/** Fin de semana ISO (domingo 23:59:59.999) que contiene `ts`. */
export const getWeekEnd = (ts: number): number =>
  dayjs.tz(ts).endOf("isoWeek").valueOf();

/** Desplaza un inicio de semana N semanas. */
export const shiftWeek = (weekStartTs: number, weeks: number): number =>
  dayjs.tz(weekStartTs).add(weeks, "week").valueOf();

/** Identificador de periodo semanal estable: "W2026-09-21". */
export const weekPeriodId = (weekStartTs: number): string =>
  `W${dayjs.tz(weekStartTs).format("YYYY-MM-DD")}`;

/** Inversa de weekPeriodId. Devuelve null si el id no es válido. */
export const parseWeekPeriodId = (
  periodId: string,
): { start: number; end: number } | null => {
  const match = /^W(\d{4}-\d{2}-\d{2})$/.exec(periodId);
  if (!match) return null;
  const start = dayjs.tz(match[1], "YYYY-MM-DD").startOf("isoWeek").valueOf();
  return { start, end: getWeekEnd(start) };
};

/** Rango legible de un periodo. */
export const formatRange = (start: number, end: number): string =>
  `${formatDate(start)} – ${formatDate(end)}`;

/** "HH:mm" (24 h) de un timestamp en la zona corporativa (edición de sesión). */
export const toHHmm = (ts: number | null | undefined): string =>
  ts ? dayjs.tz(ts).format("HH:mm") : "";

/**
 * Combina el día de `baseTs` con una hora "HH:mm" (zona corporativa).
 * Devuelve null si el texto no es una hora válida. No "salta" al día
 * siguiente: una jornada que cruza medianoche se rechaza como INVALID_TIMES.
 * TODO(propuesta): edición de jornadas nocturnas.
 */
export const atTimeOfDay = (baseTs: number, hhmm: string): number | null => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec((hhmm ?? "").trim());
  if (!m) return null;
  return dayjs.tz(baseTs).hour(Number(m[1])).minute(Number(m[2])).second(0).millisecond(0).valueOf();
};
