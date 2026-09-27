// --- src/utils/dateUtils.ts --- (portado de GEOTrack, sin lecturas de reloj)
/**
 * Utilidades de fecha SEGURAS PARA HERMES.
 * ============================================================================
 * Causa raíz del bug "Invalid Date" (Android/Hermes): el plugin `timezone` de
 * dayjs convierte con `date.toLocaleString("en-US", { timeZone })` y vuelve a
 * parsear ese texto ("9/26/2026, 11:42:00 PM") con `new Date(texto)`. Hermes
 * no parsea formatos que no sean ISO → NaN → "Invalid Date" en toda la UI, y
 * getWeekStart() devolvía NaN (filtros semanales vacíos, periodId
 * "WInvalid Date", date_string "Invalid Date" persistido en SQLite).
 *
 * Este módulo NO depende de dayjs ni de parseo de cadenas de `Date`:
 *  - `parseTimestamp` es el ÚNICO parser: epoch ms/s (número o cadena), Date,
 *    ISO 8601, formato SQLite "YYYY-MM-DD HH:MM:SS" y RFC 1123 (cabecera HTTP).
 *  - La zona corporativa se resuelve con `Intl.DateTimeFormat#formatToParts`
 *    cuando existe y responde coherente; si no, reglas DST de EE. UU. para
 *    America/Los_Angeles (fallback aritmético puro).
 *  - Toda la aritmética de calendario se hace con Date.UTC/getUTC* sobre el
 *    "reloj de pared" corporativo.
 *  - Los formateadores nunca devuelven "Invalid Date": fallback "—".
 */

/**
 * Zona horaria corporativa (sede física) para estandarizar reportes,
 * independiente de la ubicación del dispositivo. Heredado de GEOTrack.
 * TODO: mover a CompanyPolicy.timezone cuando exista el campo en la zona admin.
 */
export const CORPORATE_TIMEZONE = "America/Los_Angeles";

/** Texto que se muestra cuando una fecha no es válida o no existe. */
export const DATE_FALLBACK = "—";

const MS_MIN = 60_000;
const MS_DAY = 86_400_000;
/** Por debajo de esto un número se interpreta como epoch en SEGUNDOS (≈ 1973 en ms). */
const EPOCH_SECONDS_THRESHOLD = 1e11;

// ---------------------------------------------------------------------------
// Parser central
// ---------------------------------------------------------------------------
const pad = (n: number, w = 2): string => String(Math.trunc(Math.abs(n))).padStart(w, "0");

const daysInMonth = (y: number, m1: number): number => new Date(Date.UTC(y, m1, 0)).getUTCDate();

const validYmd = (y: number, m1: number, d: number): boolean =>
  y >= 1000 && y <= 9999 && m1 >= 1 && m1 <= 12 && d >= 1 && d <= daysInMonth(y, m1);

const numberToMs = (n: number): number | null => {
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n < EPOCH_SECONDS_THRESHOLD ? n * 1000 : n;
  return Number.isFinite(ms) ? Math.round(ms) : null;
};

// ISO 8601 y SQLite: 2026-09-26, 2026-09-26T23:42, 2026-09-26 23:42:00.123, …Z, …+02:00
const ISO_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:([T ])(\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;
// RFC 1123 / 2822: "Sat, 26 Sep 2026 06:42:00 GMT"
const RFC_RE = /^(?:[A-Za-z]{3},\s*)?(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s*(GMT|UTC|UT|Z|[+-]\d{4})?$/;
const RFC_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const parseZone = (z: string | undefined): number | null => {
  if (!z) return null;
  const u = z.toUpperCase();
  if (u === "Z" || u === "GMT" || u === "UTC" || u === "UT") return 0;
  const m = /^([+-])(\d{2}):?(\d{2})?$/.exec(u);
  if (!m) return null;
  const mins = Number(m[2]) * 60 + Number(m[3] ?? 0);
  return m[1] === "-" ? -mins : mins;
};

/**
 * Convierte cualquier representación de fecha usada por la app en epoch ms.
 * Devuelve null si no es interpretable (nunca NaN).
 *
 * Reglas de cadenas sin zona:
 *  - "YYYY-MM-DD HH:MM:SS" (separador espacio, formato de SQLite
 *    CURRENT_TIMESTAMP/datetime()) → UTC, como lo escribe SQLite.
 *  - "YYYY-MM-DDTHH:MM[:SS]" (separador T) → reloj de pared corporativo.
 *  - "YYYY-MM-DD" → medianoche corporativa de ese día.
 */
export function parseTimestamp(input: unknown): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return numberToMs(input);
  if (input instanceof Date) return numberToMs(input.getTime());
  if (typeof input !== "string") return null;

  const s = input.trim();
  if (!s) return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) return numberToMs(Number(s));

  const iso = ISO_RE.exec(s);
  if (iso) {
    const y = Number(iso[1]);
    const mo = Number(iso[2]);
    const d = Number(iso[3]);
    if (!validYmd(y, mo, d)) return null;
    const hasTime = iso[4] !== undefined;
    const h = hasTime ? Number(iso[5]) : 0;
    const mi = hasTime ? Number(iso[6]) : 0;
    const sec = iso[7] !== undefined ? Number(iso[7]) : 0;
    const ms = iso[8] !== undefined ? Number(iso[8].slice(0, 3).padEnd(3, "0")) : 0;
    if (h > 23 || mi > 59 || sec > 59) return null;
    const zone = parseZone(iso[9]);
    if (iso[9] !== undefined && zone === null) return null;
    if (zone !== null) return Date.UTC(y, mo - 1, d, h, mi, sec, ms) - zone * MS_MIN;
    if (hasTime && iso[4] === " ") return Date.UTC(y, mo - 1, d, h, mi, sec, ms);
    return fromWallClock(y, mo, d, h, mi, sec, ms);
  }

  const rfc = RFC_RE.exec(s);
  if (rfc) {
    const mo = RFC_MONTHS.indexOf(rfc[2].toLowerCase()) + 1;
    const y = Number(rfc[3]);
    const d = Number(rfc[1]);
    if (mo === 0 || !validYmd(y, mo, d)) return null;
    const zone = parseZone(rfc[7]) ?? 0;
    return Date.UTC(y, mo - 1, d, Number(rfc[4]), Number(rfc[5]), Number(rfc[6] ?? 0)) - zone * MS_MIN;
  }

  return null;
}

/** true si `input` es interpretable como fecha. */
export const isValidTimestamp = (input: unknown): boolean => parseTimestamp(input) !== null;

// ---------------------------------------------------------------------------
// Zona corporativa (sin parseo de cadenas)
// ---------------------------------------------------------------------------
type Dtf = { formatToParts: (d: Date) => { type: string; value: string }[] };
let dtf: Dtf | null | undefined; // undefined = aún no probado; null = no disponible

function getDtf(): Dtf | null {
  if (dtf !== undefined) return dtf;
  dtf = null;
  try {
    if (typeof Intl !== "undefined" && typeof Intl.DateTimeFormat === "function") {
      const f = new Intl.DateTimeFormat("en-US", {
        timeZone: CORPORATE_TIMEZONE,
        hour12: false,
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
      }) as unknown as Dtf;
      if (typeof f.formatToParts === "function") dtf = f;
    }
  } catch {
    dtf = null;
  }
  return dtf;
}

function intlOffsetMinutes(ts: number): number | null {
  const f = getDtf();
  if (!f) return null;
  try {
    const parts = f.formatToParts(new Date(ts));
    const get = (type: string) => {
      const p = parts.find((x) => x.type === type);
      return p ? parseInt(p.value, 10) : NaN;
    };
    const hour = get("hour") % 24; // algunos motores devuelven "24" a medianoche
    const wall = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
    const off = Math.round((wall - (ts - (((ts % 1000) + 1000) % 1000))) / MS_MIN);
    return Number.isFinite(off) && Math.abs(off) <= 14 * 60 ? off : null;
  } catch {
    return null;
  }
}

/** n-ésimo domingo (n=1..) de un mes, como día del mes. */
const nthSunday = (y: number, m0: number, n: number): number => {
  const firstDow = new Date(Date.UTC(y, m0, 1)).getUTCDay();
  return 1 + ((7 - firstDow) % 7) + (n - 1) * 7;
};

/**
 * Fallback aritmético: horario del Pacífico de EE. UU. (reglas desde 2007).
 * DST: 2.º domingo de marzo 02:00 PST (10:00 UTC) → 1.er domingo de noviembre
 * 02:00 PDT (09:00 UTC).
 */
export function pacificOffsetMinutes(ts: number): number {
  const y = new Date(ts).getUTCFullYear();
  const dstStart = Date.UTC(y, 2, nthSunday(y, 2, 2), 10);
  const dstEnd = Date.UTC(y, 10, nthSunday(y, 10, 1), 9);
  return ts >= dstStart && ts < dstEnd ? -420 : -480;
}

const offsetCache = new Map<number, number>();

/** Desfase (minutos, UTC→corporativo) vigente en `ts`. */
export function corporateOffsetMinutes(ts: number): number {
  const bucket = Math.floor(ts / (15 * MS_MIN)); // los cambios de hora caen en cuartos de hora
  const hit = offsetCache.get(bucket);
  if (hit !== undefined) return hit;
  const off = intlOffsetMinutes(ts) ?? pacificOffsetMinutes(ts);
  if (offsetCache.size > 2000) offsetCache.clear();
  offsetCache.set(bucket, off);
  return off;
}

/** Campos del reloj de pared corporativo (leer con getUTC*). */
const wall = (ts: number): Date => new Date(ts + corporateOffsetMinutes(ts) * MS_MIN);

/** Epoch ms de un reloj de pared corporativo (resuelve DST como luxon). */
export function fromWallClock(y: number, m1: number, d: number, h = 0, mi = 0, s = 0, ms = 0): number {
  const local = Date.UTC(y, m1 - 1, d, h, mi, s, ms);
  const o0 = corporateOffsetMinutes(local);
  let utc = local - o0 * MS_MIN;
  const o2 = corporateOffsetMinutes(utc);
  if (o0 === o2) return utc;
  utc = local - o2 * MS_MIN;
  const o3 = corporateOffsetMinutes(utc);
  if (o2 === o3) return utc;
  return local - Math.max(o2, o3) * MS_MIN;
}

/** Medianoche corporativa del día `ts` desplazada `days` días. */
const dayStart = (ts: number, days = 0): number => {
  const w = wall(ts);
  const base = Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()) + days * MS_DAY;
  const b = new Date(base);
  return fromWallClock(b.getUTCFullYear(), b.getUTCMonth() + 1, b.getUTCDate());
};

// ---------------------------------------------------------------------------
// Formateadores (nunca "Invalid Date")
// ---------------------------------------------------------------------------
type DateInput = number | string | Date | null | undefined;

const WEEKDAYS_ES = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Formatea un timestamp a hora local corporativa (Ej: 08:30 AM). */
export const formatTime = (input: DateInput): string => {
  const ts = parseTimestamp(input);
  if (ts === null) return DATE_FALLBACK;
  const w = wall(ts);
  const h = w.getUTCHours();
  return `${pad(h % 12 === 0 ? 12 : h % 12)}:${pad(w.getUTCMinutes())} ${h < 12 ? "AM" : "PM"}`;
};

/** Formatea un timestamp a fecha legible (Ej: dom, 31 may 2026). */
export const formatDate = (input: DateInput): string => {
  const ts = parseTimestamp(input);
  if (ts === null) return DATE_FALLBACK;
  const w = wall(ts);
  return `${WEEKDAYS_ES[w.getUTCDay()]}, ${w.getUTCDate()} ${MONTHS_ES[w.getUTCMonth()]} ${w.getUTCFullYear()}`;
};

/** Fecha y hora (Ej: dom, 31 may 2026 08:30 AM). */
export const formatDateTime = (input: DateInput): string => {
  const ts = parseTimestamp(input);
  return ts === null ? DATE_FALLBACK : `${formatDate(ts)} ${formatTime(ts)}`;
};

/** Convierte milisegundos a una cadena de duración (Ej: 8h 30m). */
export const formatDuration = (ms: number): string => {
  if (!Number.isFinite(ms) || ms <= 0) return "0h 0m";
  const totalMin = Math.floor(ms / MS_MIN);
  return `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;
};

/** Horas decimales con 2 decimales (Ej: 8.25 h). */
export const formatHours = (hours: number): string =>
  `${(Number.isFinite(hours) ? hours : 0).toFixed(2)} h`;

/** Moneda USD simple (heredado de ReportGenerator de GEOTrack/LEDTracker). */
export const formatCurrency = (amount: number): string =>
  `$${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`;

/** Fecha YYYY-MM-DD de un timestamp en la zona corporativa ("" si no es válido). */
export const toDateString = (input: DateInput): string => {
  const ts = parseTimestamp(input);
  if (ts === null) return "";
  const w = wall(ts);
  return `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}`;
};

/** ¿Es un "YYYY-MM-DD" de calendario real? (repara date_string "Invalid Date"). */
export const isDateString = (s: unknown): s is string => {
  if (typeof s !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return !!m && validYmd(Number(m[1]), Number(m[2]), Number(m[3]));
};

/** Día de la semana (0=domingo) y hora del reloj de pared corporativo. */
export const corporateDayAndHour = (ts: number): { day: number; hour: number } => {
  const w = wall(ts);
  return { day: w.getUTCDay(), hour: w.getUTCHours() };
};

// ---------------------------------------------------------------------------
// Semanas y periodos
// ---------------------------------------------------------------------------
/**
 * Inicio de semana ISO (lunes 00:00, zona corporativa) que contiene `ts`.
 * Usado por Historial (flechas de semana) y por PayrollEngine (overtime semanal).
 * Con entrada inválida devuelve NaN; las pantallas pasan siempre TimeAuthority.now().
 */
export const getWeekStart = (input: DateInput): number => {
  const ts = parseTimestamp(input);
  if (ts === null) return NaN;
  const dow = wall(ts).getUTCDay();
  return dayStart(ts, -((dow + 6) % 7));
};

/** Fin de semana ISO (domingo 23:59:59.999) que contiene `ts`. */
export const getWeekEnd = (input: DateInput): number => {
  const start = getWeekStart(input);
  return Number.isFinite(start) ? dayStart(start, 7) - 1 : NaN;
};

/** Desplaza un inicio de semana N semanas (siempre cae en lunes 00:00). */
export const shiftWeek = (weekStartTs: number, weeks: number): number => {
  const start = getWeekStart(weekStartTs);
  return Number.isFinite(start) ? dayStart(start, weeks * 7) : NaN;
};

/** ¿Es un rango de periodo utilizable? */
export const isValidRange = (start: number, end: number): boolean =>
  Number.isFinite(start) && Number.isFinite(end) && start > 0 && end >= start;

/** Identificador de periodo semanal estable: "W2026-09-21" ("" si no es válido). */
export const weekPeriodId = (weekStartTs: number): string => {
  const d = toDateString(getWeekStart(weekStartTs));
  return d ? `W${d}` : "";
};

/** Inversa de weekPeriodId. Devuelve null si el id no es válido. */
export const parseWeekPeriodId = (
  periodId: string,
): { start: number; end: number } | null => {
  const match = /^W(\d{4})-(\d{2})-(\d{2})$/.exec((periodId ?? "").trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!validYmd(y, m, d)) return null;
  const start = getWeekStart(fromWallClock(y, m, d, 12)); // mediodía: inmune a DST
  const end = getWeekEnd(start);
  return isValidRange(start, end) ? { start, end } : null;
};

/** Rango legible de un periodo. */
export const formatRange = (start: DateInput, end: DateInput): string => {
  const a = formatDate(start);
  const b = formatDate(end);
  return a === DATE_FALLBACK || b === DATE_FALLBACK ? DATE_FALLBACK : `${a} – ${b}`;
};

/** "HH:mm" (24 h) de un timestamp en la zona corporativa (edición de sesión). */
export const toHHmm = (input: DateInput): string => {
  const ts = parseTimestamp(input);
  if (ts === null) return "";
  const w = wall(ts);
  return `${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}`;
};

/**
 * Combina el día de `baseTs` con una hora "HH:mm" (zona corporativa).
 * Devuelve null si el texto no es una hora válida. No "salta" al día
 * siguiente: una jornada que cruza medianoche se rechaza como INVALID_TIMES.
 * TODO(propuesta): edición de jornadas nocturnas.
 */
export const atTimeOfDay = (baseTs: number, hhmm: string): number | null => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec((hhmm ?? "").trim());
  const base = parseTimestamp(baseTs);
  if (!m || base === null) return null;
  const w = wall(base);
  return fromWallClock(w.getUTCFullYear(), w.getUTCMonth() + 1, w.getUTCDate(), Number(m[1]), Number(m[2]));
};
