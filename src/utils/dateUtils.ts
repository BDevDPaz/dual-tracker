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
 *  - La zona de nómina se resuelve con `Intl.DateTimeFormat#formatToParts`
 *    cuando existe y responde coherente; si no, el desfase fijo o las reglas
 *    DST de EE. UU. de esa zona (fallback aritmético puro).
 *  - Toda la aritmética de calendario se hace con Date.UTC/getUTC* sobre el
 *    "reloj de pared" corporativo.
 *  - Los formateadores nunca devuelven "Invalid Date": fallback "—".
 */

/**
 * Zona por defecto de la nómina (sede del Pacífico). Heredado de GEOTrack.
 * La empresa puede elegir otra en CompanyPolicy.timezone. El reloj de pared
 * cambia; las reglas de horas extra siguen siendo las de California.
 */
import type { CalendarEntry } from "../core/contracts/settings";
import { getLanguage, type Language } from "../i18n";

export const CORPORATE_TIMEZONE = "America/Los_Angeles";

/** Zonas que Ajustes puede guardar. El id es IANA. */
export const PAYROLL_TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Phoenix",
  "America/Chicago",
  "America/New_York",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Guatemala",
  "America/El_Salvador",
  "America/Tegucigalpa",
  "America/Managua",
  "America/Costa_Rica",
  "America/Panama",
  "America/Belize",
] as const;

export type PayrollTimezone = (typeof PAYROLL_TIMEZONES)[number];

/** Desfase estándar en minutos (UTC → pared) y si observa el DST de EE. UU. */
const ZONE_RULES: Record<PayrollTimezone, { standard: number; dst: boolean }> = {
  "America/Los_Angeles": { standard: -480, dst: true },
  "America/Denver": { standard: -420, dst: true },
  "America/Phoenix": { standard: -420, dst: false },
  "America/Chicago": { standard: -360, dst: true },
  "America/New_York": { standard: -300, dst: true },
  "America/Anchorage": { standard: -540, dst: true },
  "Pacific/Honolulu": { standard: -600, dst: false },
  "America/Guatemala": { standard: -360, dst: false },
  "America/El_Salvador": { standard: -360, dst: false },
  "America/Tegucigalpa": { standard: -360, dst: false },
  "America/Managua": { standard: -360, dst: false },
  "America/Costa_Rica": { standard: -360, dst: false },
  "America/Panama": { standard: -300, dst: false },
  "America/Belize": { standard: -360, dst: false },
};

export function isPayrollTimezone(zone: unknown): zone is PayrollTimezone {
  return typeof zone === "string" && Object.prototype.hasOwnProperty.call(ZONE_RULES, zone);
}

/** Texto que se muestra cuando una fecha no es válida o no existe. */
export const DATE_FALLBACK = "—";

const MS_MIN = 60_000;
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
const dtfByZone = new Map<string, Dtf | null>();

function getDtf(zone: string): Dtf | null {
  const cached = dtfByZone.get(zone);
  if (cached !== undefined) return cached;
  let dtf: Dtf | null = null;
  try {
    if (typeof Intl !== "undefined" && typeof Intl.DateTimeFormat === "function") {
      const f = new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
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
  dtfByZone.set(zone, dtf);
  return dtf;
}

function intlOffsetMinutes(ts: number, zone: string): number | null {
  const f = getDtf(zone);
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

const offsetCache = new Map<string, number>();
let activeZone: PayrollTimezone = CORPORATE_TIMEZONE;

/** Zona de pared activa (la de la empresa, o Los Ángeles si aún no se cargó). */
export function activeCorporateTimezone(): PayrollTimezone {
  return activeZone;
}

/** Fija la zona de los cálculos que no reciben una zona propia. Ignora un id desconocido. */
export function setCorporateTimezone(zone: string | null | undefined): void {
  if (isPayrollTimezone(zone)) activeZone = zone;
}

/**
 * Ejecuta `fn` con otra zona de pared y restaura la anterior.
 * Una zona ausente o desconocida no cambia la activa.
 */
export function withCorporateZone<T>(zone: string | null | undefined, fn: () => T): T {
  if (!isPayrollTimezone(zone) || zone === activeZone) return fn();
  const prev = activeZone;
  activeZone = zone;
  try {
    return fn();
  } finally {
    activeZone = prev;
  }
}

/** DST de EE. UU. (desde 2007) aplicado a un desfase estándar en minutos. */
function usDstOffset(ts: number, standardMin: number): number {
  const dstMin = standardMin + 60;
  const y = new Date(ts).getUTCFullYear();
  const dstStart = Date.UTC(y, 2, nthSunday(y, 2, 2), 2 - standardMin / 60);
  const dstEnd = Date.UTC(y, 10, nthSunday(y, 10, 1), 2 - dstMin / 60);
  return ts >= dstStart && ts < dstEnd ? dstMin : standardMin;
}

function fallbackOffset(ts: number, zone: PayrollTimezone): number {
  const rule = ZONE_RULES[zone];
  if (!rule.dst) return rule.standard;
  if (zone === "America/Los_Angeles") return pacificOffsetMinutes(ts);
  return usDstOffset(ts, rule.standard);
}

/** Desfase (minutos, UTC→zona activa) vigente en `ts`. */
export function corporateOffsetMinutes(ts: number): number {
  const zone = activeZone;
  const bucket = `${zone}:${Math.floor(ts / (15 * MS_MIN))}`; // los cambios de hora caen en cuartos de hora
  const hit = offsetCache.get(bucket);
  if (hit !== undefined) return hit;
  const off = intlOffsetMinutes(ts, zone) ?? fallbackOffset(ts, zone);
  if (offsetCache.size > 4000) offsetCache.clear();
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


// ---------------------------------------------------------------------------
// Formateadores (nunca "Invalid Date")
// ---------------------------------------------------------------------------
type DateInput = number | string | Date | null | undefined;

const WEEKDAYS_ES = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type DateLanguage = Language;
export type ClockFormat = "12h" | "24h";

/**
 * Opciones de formato. Sin `lang` se usa el idioma activo (getLanguage(), ES
 * por defecto); sin `clock`, 12 h ("11:42 PM") como hasta ahora.
 * Los documentos de evidencia (reportTemplates) fijan lang: "es" explícito.
 */
export interface FormatOptions {
  lang?: DateLanguage;
  clock?: ClockFormat;
}

const langOf = (opts?: FormatOptions): DateLanguage => opts?.lang ?? getLanguage();

/** Formatea un timestamp a hora local corporativa (Ej: 08:30 AM; 24 h: 20:30). */
export const formatTime = (input: DateInput, opts?: FormatOptions): string => {
  const ts = parseTimestamp(input);
  if (ts === null) return DATE_FALLBACK;
  const w = wall(ts);
  const h = w.getUTCHours();
  if (opts?.clock === "24h") return `${pad(h)}:${pad(w.getUTCMinutes())}`;
  return `${pad(h % 12 === 0 ? 12 : h % 12)}:${pad(w.getUTCMinutes())} ${h < 12 ? "AM" : "PM"}`;
};

/** Formatea un timestamp a fecha legible (ES: sáb, 26 sep 2026 · EN: Sat, Sep 26, 2026). */
export const formatDate = (input: DateInput, opts?: FormatOptions): string => {
  const ts = parseTimestamp(input);
  if (ts === null) return DATE_FALLBACK;
  const w = wall(ts);
  if (langOf(opts) === "en") {
    return `${WEEKDAYS_EN[w.getUTCDay()]}, ${MONTHS_EN[w.getUTCMonth()]} ${w.getUTCDate()}, ${w.getUTCFullYear()}`;
  }
  return `${WEEKDAYS_ES[w.getUTCDay()]}, ${w.getUTCDate()} ${MONTHS_ES[w.getUTCMonth()]} ${w.getUTCFullYear()}`;
};

/** Fecha y hora (Ej: dom, 31 may 2026 08:30 AM). */
export const formatDateTime = (input: DateInput, opts?: FormatOptions): string => {
  const ts = parseTimestamp(input);
  return ts === null ? DATE_FALLBACK : `${formatDate(ts, opts)} ${formatTime(ts, opts)}`;
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

/**
 * Moneda USD fija (`$1.50`), sin separador de miles ni coma decimal.
 * No sigue el idioma de la UI: la nómina es en dólares y el mismo formato
 * entra en el PDF sellado (docs/IDIOMA.md).
 */
export const formatCurrency = (amount: number): string =>
  `$${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`;

/**
 * Cantidad de la UI (horas en pantalla). Español usa coma decimal; inglés, punto.
 * No entra en el PDF ni en formatCurrency / formatHundredths / formatCents:
 * el expediente sellado sigue con punto (docs/IDIOMA.md).
 */
export function formatLocaleNumber(value: number, digits = 2, lang: Language = getLanguage()): string {
  const safe = Number.isFinite(value) ? value : 0;
  const neg = safe < 0;
  const text = Math.abs(safe).toFixed(digits);
  const out = lang === "es" ? text.replace(".", ",") : text;
  return neg ? `-${out}` : out;
}

/** Reescribe el separador decimal de un texto ya formado con punto ("8.25 h"). */
export function formatUiDecimal(text: string, lang: Language = getLanguage()): string {
  if (lang === "es") return text.replace(/(\d)\.(\d)/g, "$1,$2");
  return text.replace(/(\d),(\d)/g, "$1.$2");
}

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
 * Inicio del periodo semanal que contiene `ts`. Sin historial = calendario por
 * defecto (lunes 00:00, zona corporativa), idéntico al comportamiento previo.
 * Con historial delega en workweekStartAt (spec v1.3 §5.1).
 * Con entrada inválida devuelve NaN; las pantallas pasan siempre TimeAuthority.now().
 */
export const getWeekStart = (input: DateInput, history?: CalendarHistory | null): number => workweekStartAt(input, history);

/** Fin inclusivo (… .999) del periodo semanal que contiene `ts`. */
export const getWeekEnd = (input: DateInput, history?: CalendarHistory | null): number => workweekEndAt(input, history);

/** Desplaza un inicio de periodo N periodos. */
export const shiftWeek = (weekStartTs: number, weeks: number, history?: CalendarHistory | null): number => shiftPeriod(weekStartTs, weeks, history);

/** ¿Es un rango de periodo utilizable? */
export const isValidRange = (start: number, end: number): boolean =>
  Number.isFinite(start) && Number.isFinite(end) && start > 0 && end >= start;

/** Identificador de periodo estable: "W2026-09-21" (o "T…" en transición; "" si no es válido). */
export const weekPeriodId = (weekStartTs: number, history?: CalendarHistory | null): string => periodIdAt(weekStartTs, history);

/** Inversa de weekPeriodId. Devuelve null si el id no es válido. */
export const parseWeekPeriodId = (periodId: string, history?: CalendarHistory | null): { start: number; end: number } | null =>
  parsePeriodId(periodId, history);

// ---------------------------------------------------------------------------
// Calendario laboral configurable (spec v1.3 §5.1) [CONFIRMAR CON ASESORÍA LEGAL]
// ---------------------------------------------------------------------------
export type { CalendarEntry };
export type CalendarHistory = readonly CalendarEntry[];

/** Calendario por defecto: 00:00 y lunes (idéntico al comportamiento histórico). */
export const DEFAULT_CALENDAR: CalendarEntry = Object.freeze({ effectiveFromMs: 0, workdayStartMinutes: 0, workweekStartDay: 1 });
export const DEFAULT_CALENDAR_HISTORY: CalendarHistory = Object.freeze([DEFAULT_CALENDAR]);

const histOrDefault = (h: CalendarHistory | null | undefined): CalendarHistory => (h && h.length ? h : DEFAULT_CALENDAR_HISTORY);

/** ¿Calendario válido? (rango de minutos y día). */
export const isValidCalendar = (c: { workdayStartMinutes: number; workweekStartDay: number }): boolean =>
  Number.isInteger(c.workdayStartMinutes) &&
  c.workdayStartMinutes >= 0 &&
  c.workdayStartMinutes <= 1439 &&
  Number.isInteger(c.workweekStartDay) &&
  c.workweekStartDay >= 0 &&
  c.workweekStartDay <= 6;

/** Índice de la entrada vigente en `ts` (historial ordenado por effectiveFromMs). */
function calendarIndexAt(ts: number, h: CalendarHistory): number {
  let idx = 0;
  for (let i = 0; i < h.length; i++) if (h[i].effectiveFromMs <= ts) idx = i;
  return idx;
}

/** Calendario vigente en el instante `ts`. */
export const calendarAt = (ts: number, history?: CalendarHistory | null): CalendarEntry => {
  const h = histOrDefault(history);
  return h[calendarIndexAt(ts, h)];
};

/** Instante de pared (fecha civil y minutos) → epoch ms. */
const wallDateAt = (y: number, m0: number, d: number, minutes: number): number => {
  const b = new Date(Date.UTC(y, m0, d));
  return fromWallClock(b.getUTCFullYear(), b.getUTCMonth() + 1, b.getUTCDate(), Math.floor(minutes / 60), minutes % 60);
};

/** Fecha civil (UTC-fields) de la jornada que contiene ts bajo `c`, sin acotar por historial. */
function workdayCivil(ts: number, c: CalendarEntry): { y: number; m0: number; d: number } {
  const w = wall(ts);
  let y = w.getUTCFullYear();
  let m0 = w.getUTCMonth();
  let d = w.getUTCDate();
  const start = wallDateAt(y, m0, d, c.workdayStartMinutes);
  if (ts < start) {
    const prev = new Date(Date.UTC(y, m0, d - 1));
    y = prev.getUTCFullYear();
    m0 = prev.getUTCMonth();
    d = prev.getUTCDate();
  }
  return { y, m0, d };
}

/**
 * Inicio de la jornada que contiene `ts`: [fecha + m, fecha siguiente + m) en
 * hora de pared. La primera jornada tras un cambio de calendario empieza en
 * su effectiveFromMs (la acota).
 */
export const workdayStartAt = (ts: number, history?: CalendarHistory | null): number => {
  const h = histOrDefault(history);
  const c = h[calendarIndexAt(ts, h)];
  const { y, m0, d } = workdayCivil(ts, c);
  return Math.max(wallDateAt(y, m0, d, c.workdayStartMinutes), c.effectiveFromMs);
};

/** Primer límite de jornada estrictamente posterior a `ts` (incluye cambios de calendario). */
export const nextWorkdayBoundary = (ts: number, history?: CalendarHistory | null): number => {
  const h = histOrDefault(history);
  const i = calendarIndexAt(ts, h);
  const c = h[i];
  const { y, m0, d } = workdayCivil(ts, c);
  let next = wallDateAt(y, m0, d + 1, c.workdayStartMinutes);
  if (i + 1 < h.length && h[i + 1].effectiveFromMs > ts && h[i + 1].effectiveFromMs < next) next = h[i + 1].effectiveFromMs;
  return next;
};

/** "YYYY-MM-DD" de la jornada que contiene `ts` (fecha de su inicio, en `zone` si se pasa). */
export const workdayDateString = (ts: number, history?: CalendarHistory | null, zone?: string | null): string =>
  withCorporateZone(zone, () => toDateString(workdayStartAt(ts, history)));

/** Inicio de semana laboral sin acotar (bajo el calendario `c`). */
function rawWorkweekStart(ts: number, c: CalendarEntry): number {
  const { y, m0, d } = workdayCivil(ts, c);
  const dow = new Date(Date.UTC(y, m0, d)).getUTCDay();
  const back = (dow - c.workweekStartDay + 7) % 7;
  return wallDateAt(y, m0, d - back, c.workdayStartMinutes);
}

/**
 * Inicio de la semana laboral (7 jornadas desde una jornada cuya fecha cae en
 * workweekStartDay) que contiene `ts`. Si la semana empezaría antes de la
 * entrada en vigor del calendario, el periodo empieza en esa entrada
 * (periodo de transición, §5.1).
 */
export const workweekStartAt = (input: DateInput, history?: CalendarHistory | null): number => {
  const ts = parseTimestamp(input);
  if (ts === null) return NaN;
  const h = histOrDefault(history);
  const c = h[calendarIndexAt(ts, h)];
  return Math.max(rawWorkweekStart(ts, c), c.effectiveFromMs);
};

/** Inicio (exclusivo del periodo actual) del siguiente periodo. */
function nextPeriodStart(ts: number, h: CalendarHistory): number {
  const i = calendarIndexAt(ts, h);
  const c = h[i];
  const raw = rawWorkweekStart(ts, c);
  // 7 jornadas después (en fecha civil, inmune a DST).
  const { y, m0, d } = workdayCivil(raw, c);
  let next = wallDateAt(y, m0, d + 7, c.workdayStartMinutes);
  if (i + 1 < h.length && h[i + 1].effectiveFromMs > ts && h[i + 1].effectiveFromMs < next) next = h[i + 1].effectiveFromMs;
  return next;
}

/** Fin inclusivo (… .999) del periodo semanal que contiene `ts`. */
export const workweekEndAt = (input: DateInput, history?: CalendarHistory | null): number => {
  const ts = parseTimestamp(input);
  if (ts === null) return NaN;
  return nextPeriodStart(ts, histOrDefault(history)) - 1;
};

/** ¿El periodo que contiene `ts` es de transición (acotado por un cambio de calendario)? */
export const isTransitionPeriodAt = (ts: number, history?: CalendarHistory | null): boolean => {
  const h = histOrDefault(history);
  const c = h[calendarIndexAt(ts, h)];
  return c.effectiveFromMs > 0 && rawWorkweekStart(ts, c) < c.effectiveFromMs;
};

/** Id de periodo: "W" + fecha de inicio, o "T" + fecha para un periodo de transición ("" si inválido). */
export const periodIdAt = (input: DateInput, history?: CalendarHistory | null): string => {
  const ts = parseTimestamp(input);
  if (ts === null) return "";
  const start = workweekStartAt(ts, history);
  const d = toDateString(start);
  if (!d) return "";
  return `${isTransitionPeriodAt(ts, history) ? "T" : "W"}${d}`;
};

/** Desplaza N periodos desde el periodo que contiene `ts` (devuelve su inicio). */
export const shiftPeriod = (ts: number, n: number, history?: CalendarHistory | null): number => {
  const h = histOrDefault(history);
  let start = workweekStartAt(ts, h);
  if (!Number.isFinite(start)) return NaN;
  for (let k = 0; k < Math.abs(n); k++) {
    start = n > 0 ? workweekEndAt(start, h) + 1 : workweekStartAt(start - 1, h);
  }
  return start;
};

/** Primer instante ≥ ts cuya hora de pared corporativa es `minutes` (0..1439). */
export const wallMinutesOnOrAfter = (ts: number, minutes: number): number => {
  const w = wall(ts);
  const same = wallDateAt(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate(), minutes);
  return same >= ts ? same : wallDateAt(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate() + 1, minutes);
};

/**
 * Ventana de exportación semanal derivada del calendario (spec v1.3 §5.1):
 * desde las 20:00 de la última jornada de la semana → periodo en curso; durante
 * las dos primeras jornadas del periodo siguiente → periodo anterior. Con el
 * calendario por defecto reproduce la ventana heredada (dom ≥ 20:00, lun, mar).
 */
export const payrollExportPeriodAt = (nowMs: number, history?: CalendarHistory | null): { start: number; end: number } | null => {
  const h = histOrDefault(history);
  const start = workweekStartAt(nowMs, h);
  const end = workweekEndAt(nowMs, h);
  if (!isValidRange(start, end)) return null;
  const lastWorkday = workdayStartAt(end, h);
  if (nowMs >= wallMinutesOnOrAfter(lastWorkday, 20 * 60)) return { start, end };
  const twoWorkdays = nextWorkdayBoundary(nextWorkdayBoundary(start, h), h);
  if (nowMs < twoWorkdays) {
    const prevStart = workweekStartAt(start - 1, h);
    return { start: prevStart, end: start - 1 };
  }
  return null;
};

/** Inversa de periodIdAt ("W…" o "T…"). null si el id no es válido o no corresponde a un periodo. */
export const parsePeriodId = (periodId: string, history?: CalendarHistory | null): { start: number; end: number } | null => {
  const match = /^([WT])(\d{4})-(\d{2})-(\d{2})$/.exec((periodId ?? "").trim());
  if (!match) return null;
  const y = Number(match[2]);
  const mo = Number(match[3]);
  const d = Number(match[4]);
  if (!validYmd(y, mo, d)) return null;
  const h = histOrDefault(history);
  if (match[1] === "T") {
    const entry = h.find((e) => e.effectiveFromMs > 0 && toDateString(e.effectiveFromMs) === `${match[2]}-${match[3]}-${match[4]}`);
    if (!entry || !isTransitionPeriodAt(entry.effectiveFromMs, h)) return null;
    return { start: entry.effectiveFromMs, end: workweekEndAt(entry.effectiveFromMs, h) };
  }
  // "W": se busca la semana cuyo inicio cae en esa fecha (tolerante: cualquier fecha dentro de la semana).
  const probe = wallDateAt(y, mo - 1, d, calendarAt(fromWallClock(y, mo, d, 12), h).workdayStartMinutes);
  const start = workweekStartAt(probe, h);
  const end = workweekEndAt(probe, h);
  return isValidRange(start, end) ? { start, end } : null;
};

/** Rango legible de un periodo. */
export const formatRange = (start: DateInput, end: DateInput, opts?: FormatOptions): string => {
  const a = formatDate(start, opts);
  const b = formatDate(end, opts);
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
 * siguiente; para la hora de salida usar atTimeOfDayAfter (§5.2 N6).
 */
export const atTimeOfDay = (baseTs: number, hhmm: string): number | null => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec((hhmm ?? "").trim());
  const base = parseTimestamp(baseTs);
  if (!m || base === null) return null;
  const w = wall(base);
  return fromWallClock(w.getUTCFullYear(), w.getUTCMonth() + 1, w.getUTCDate(), Number(m[1]), Number(m[2]));
};

/**
 * Hora de salida "HH:mm" relativa a una entrada (spec v1.3 §5.2 N6): si la
 * hora es ≤ a la de entrada, se toma como del día siguiente (jornadas
 * nocturnas; igualdad de reloj = 24 h de pared). La duración es la diferencia
 * real de epoch ms (DST incluido).
 *
 * No aplicar esto a los HH:mm prefijados de una sesión ya guardada: `toHHmm`
 * tira los segundos y una sesión del mismo minuto parecería terminar al día
 * siguiente. Para el modal de edición usar `resolveSessionEditTimes`.
 */
export const atTimeOfDayAfter = (startTs: number, hhmm: string): number | null => {
  const sameDay = atTimeOfDay(startTs, hhmm);
  if (sameDay === null) return null;
  if (sameDay > startTs) return sameDay;
  const w = wall(startTs);
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim())!;
  const next = new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate() + 1));
  return fromWallClock(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), Number(m[1]), Number(m[2]));
};

export interface SessionEditTimes {
  /** Entrada resuelta, o null si el texto no es un HH:mm válido. */
  start: number | null;
  /** Salida resuelta. null si el campo está vacío o la hora no es válida. */
  end: number | null;
  invalidStart: boolean;
  invalidEnd: boolean;
  /** El usuario cambió al menos un HH:mm y el par resuelto no es el almacenado. */
  timesChanged: boolean;
  /** La salida cae en un día de calendario corporativo posterior al de la entrada. */
  nextDay: boolean;
}

/**
 * Horas del modal «Editar sesión».
 *
 * Decisión (spec v1.3 §5.2 N6, coherente con `atTimeOfDayAfter` y con el tope
 * de 24 h de MANUAL_PATCH):
 *
 * - Si ningún texto HH:mm difiere del almacenado, se devuelven los epoch ms
 *   originales (segundos incluidos). Una sesión de menos de un minuto no se
 *   reinterpreta como turno de 24 h, y una edición que no toca las horas no
 *   reescribe los tiempos. `timesChanged` queda en false: MANUAL_PATCH
 *   rechazaría el parche con NO_CHANGE. La nota sola no es un ajuste de
 *   horas; entra por ADD_NOTE.
 * - Si el usuario cambia un reloj, la salida tecleada sigue N6: hora de
 *   salida ≤ hora de entrada ⇒ día siguiente. Igualdad escrita a propósito
 *   (los dos HH:mm quedan iguales habiendo cambiado al menos uno) es un
 *   turno de 24 h de pared, no duración cero el mismo día. Duración cero no
 *   se puede guardar (MANUAL_PATCH rechaza end ≤ start) y el modal ya lo
 *   anuncia con «Termina al día siguiente». No hace falta un segundo control.
 * - Si solo cambia la entrada y la salida guardada sigue siendo estrictamente
 *   posterior, esa salida se conserva al milisegundo. Si ya no lo es, su
 *   HH:mm se relee con N6 (día siguiente) y `nextDay` lo indica.
 *
 * Otros constructores de timestamp desde HH:mm no usan esta regla de «≤ ⇒
 * día siguiente» sobre un valor prefijado: el almuerzo usa
 * `wallMinutesOnOrAfter` (primer instante ≥ inicio) y el motor lo rechaza si
 * cae fuera de la sesión; RESOLVE_SPLIT parte en un timestamp ya guardado;
 * las pausas se registran en epoch ms, no se teclean como HH:mm.
 */
export const resolveSessionEditTimes = (
  storedStartMs: number,
  storedEndMs: number | null,
  inTime: string,
  outTime: string,
): SessionEditTimes => {
  const inText = (inTime ?? "").trim();
  const outText = (outTime ?? "").trim();
  const startDirty = inText !== toHHmm(storedStartMs);
  const endDirty = outText !== (storedEndMs === null ? "" : toHHmm(storedEndMs));
  const untouched = !startDirty && !endDirty;

  const start = untouched || !startDirty ? storedStartMs : atTimeOfDay(storedStartMs, inText);
  const invalidStart = inText !== "" && start === null;

  let end: number | null;
  let invalidEnd: boolean;
  if (untouched) {
    end = storedEndMs;
    invalidEnd = false;
  } else if (outText === "") {
    end = null;
    invalidEnd = false;
  } else if (start === null || atTimeOfDay(storedStartMs, outText) === null) {
    end = null;
    invalidEnd = true;
  } else if (!endDirty && storedEndMs !== null && storedEndMs > start) {
    end = storedEndMs;
    invalidEnd = false;
  } else {
    end = atTimeOfDayAfter(start, outText);
    invalidEnd = end === null;
  }

  const startDay = start === null ? "" : toDateString(start);
  const endDay = end === null ? "" : toDateString(end);
  const nextDay = startDay !== "" && endDay !== "" && startDay !== endDay;
  const timesChanged = !untouched && start !== null && !invalidEnd && (start !== storedStartMs || end !== storedEndMs);

  return { start: invalidStart ? null : start, end, invalidStart, invalidEnd, timesChanged, nextDay };
};
