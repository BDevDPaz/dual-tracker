/**
 * Presentación de la nómina. No recalcula overtime: reparte, para que se vean,
 * los minutos enteros que ya cerró PayrollEngine.
 *
 *  - El pago es en centavos enteros: cada línea redondea half-up
 *    `(minutos × tarifaEnCentavos) / 60` y el bruto es la suma de esas líneas.
 *  - Las horas del documento son centésimas. La suma de las filas es el
 *    redondeo half-up del total de minutos (resto mayor), así el encabezado
 *    cuadra con las filas y el total sigue siendo el de los minutos reales.
 *  - La nota en pantalla o en el PDF se recorta; el texto guardado no se toca.
 */
import type { PayrollStatement } from "../../core/contracts";

/** Centavos de una línea. Tarifa en dólares (se lleva a centavos half-up). */
export function moneyCents(minutes: number, rate: number): number {
  if (!Number.isFinite(minutes) || !Number.isFinite(rate) || minutes === 0 || rate === 0) return 0;
  const rateCents = Math.round(rate * 100);
  return Math.round((minutes * rateCents) / 60);
}

/** Centésimas de hora (enteras) desde minutos enteros, half-up. */
export function minutesToHundredths(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.round((minutes * 100) / 60);
}

/**
 * Reparte centésimas entre filas de minutos. La suma es
 * `minutesToHundredths(suma de minutos)`. Cada fila se queda a lo sumo a una
 * centésima de su propio redondeo, salvo que el resto no quepa de otra forma.
 */
export function allocateDisplayHundredths(minuteRows: readonly number[]): number[] {
  const safe = minuteRows.map((m) => (Number.isFinite(m) && m > 0 ? m : 0));
  if (!safe.length) return [];
  const total = safe.reduce((a, m) => a + m, 0);
  const target = minutesToHundredths(total);
  const exact = safe.map((m) => (m * 100) / 60);
  const base = exact.map((x) => Math.floor(x + 1e-9));
  let left = target - base.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - base[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const out = [...base];
  if (left > 0) {
    for (let k = 0; k < left; k++) out[order[k % order.length].i] += 1;
  } else if (left < 0) {
    const rev = [...order].reverse();
    for (let k = 0; left < 0 && k < rev.length * 4; k++) {
      const i = rev[k % rev.length].i;
      if (out[i] > 0) {
        out[i] -= 1;
        left += 1;
      }
    }
  }
  return out;
}

/** "4.17" desde centésimas enteras (sin pasar por un float de horas). */
export function formatHundredths(hundredths: number): string {
  const neg = hundredths < 0;
  const v = Math.abs(Math.trunc(hundredths));
  const whole = Math.floor(v / 100);
  const frac = v % 100;
  return `${neg ? "-" : ""}${whole}.${String(frac).padStart(2, "0")}`;
}

/** "$179.08" desde centavos enteros. */
export function formatCents(cents: number): string {
  const neg = cents < 0;
  const v = Math.abs(Math.trunc(cents));
  return `${neg ? "-" : ""}$${Math.floor(v / 100)}.${String(v % 100).padStart(2, "0")}`;
}

const PAID: ReadonlySet<PayrollStatement["lines"][number]["kind"]> = new Set([
  "REGULAR",
  "OVERTIME_DAILY",
  "OVERTIME_WEEKLY",
  "OVERTIME_DOUBLE",
  "TRANSIT",
]);

export interface StatementRowDisplay {
  sessionId: number;
  workedMinutes: number;
  /** Centésimas de hora ya repartidas para que la suma cuadre con el total. */
  hundredths: number;
  hours: string;
  amountCents: number;
  amount: string;
}

export interface StatementDisplay {
  regularMinutes: number;
  overtimeMinutes: number;
  transitMinutes: number;
  workedMinutes: number;
  regular: string;
  overtime: string;
  transit: string;
  worked: string;
  grossCents: number;
  gross: string;
  rows: StatementRowDisplay[];
}

/**
 * Vista de un statement ya cerrado. No cambia los minutos ni los importes:
 * solo decide cómo se escriben para que filas y encabezado sumen lo mismo.
 */
export function displayStatement(st: PayrollStatement): StatementDisplay {
  const sumKind = (kinds: readonly string[]) =>
    st.lines.filter((l) => kinds.includes(l.kind)).reduce((a, l) => a + l.minutes, 0);
  const regularMinutes = sumKind(["REGULAR"]);
  const overtimeMinutes = sumKind(["OVERTIME_DAILY", "OVERTIME_WEEKLY", "OVERTIME_DOUBLE"]);
  const transitMinutes = sumKind(["TRANSIT"]);
  const [regularH, overtimeH, transitH] = allocateDisplayHundredths([regularMinutes, overtimeMinutes, transitMinutes]);
  const workedMinutes = regularMinutes + overtimeMinutes + transitMinutes;

  const bySession = new Map<number, { minutes: number; cents: number }>();
  for (const id of st.sessionIds) bySession.set(id, { minutes: 0, cents: 0 });
  for (const l of st.lines) {
    const row = bySession.get(l.sessionId) ?? { minutes: 0, cents: 0 };
    if (PAID.has(l.kind)) row.minutes += l.minutes;
    row.cents += moneyCents(l.minutes, l.rate);
    bySession.set(l.sessionId, row);
  }
  const ids = st.sessionIds.filter((id) => bySession.has(id));
  const hundredths = allocateDisplayHundredths(ids.map((id) => bySession.get(id)!.minutes));
  const rows: StatementRowDisplay[] = ids.map((id, i) => {
    const row = bySession.get(id)!;
    return {
      sessionId: id,
      workedMinutes: row.minutes,
      hundredths: hundredths[i] ?? 0,
      hours: formatHundredths(hundredths[i] ?? 0),
      amountCents: row.cents,
      amount: formatCents(row.cents),
    };
  });
  const grossCents = rows.reduce((a, r) => a + r.amountCents, 0);
  return {
    regularMinutes,
    overtimeMinutes,
    transitMinutes,
    workedMinutes,
    regular: formatHundredths(regularH ?? 0),
    overtime: formatHundredths(overtimeH ?? 0),
    transit: formatHundredths(transitH ?? 0),
    worked: formatHundredths((regularH ?? 0) + (overtimeH ?? 0) + (transitH ?? 0)),
    grossCents,
    gross: formatCents(grossCents),
    rows,
  };
}

/** Recorte solo para mostrar. No altera espacios internos ni el valor guardado. */
export function trimDisplayNote(note: string): string {
  return note.replace(/^[\s\u00a0\u200b\ufeff]+|[\s\u00a0\u200b\ufeff]+$/gu, "");
}

function isRegionalIndicator(cp: number): boolean {
  return cp >= 0x1f1e6 && cp <= 0x1f1ff;
}

/** Emoji (bandera, pictograma, tono, ZWJ, selector de variación). Sin \p{}: Hermes. */
function isEmojiUnit(cp: number): boolean {
  return (
    isRegionalIndicator(cp) ||
    cp === 0x200d ||
    cp === 0xfe0f ||
    (cp >= 0x1f3fb && cp <= 0x1f3ff) ||
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x2600 && cp <= 0x27bf) ||
    (cp >= 0x2300 && cp <= 0x23ff) ||
    cp === 0x20e3 ||
    (cp >= 0x1f1e6 && cp <= 0x1f1ff)
  );
}

/**
 * Parte el texto en trozos de texto plano y secuencias emoji (una bandera son
 * dos indicadores regionales; un ZWJ no se corta).
 */
export function splitEmojiSequences(text: string): { emoji: boolean; text: string }[] {
  const chars = [...text];
  const out: { emoji: boolean; text: string }[] = [];
  let buf = "";
  let emoji = false;
  const flush = () => {
    if (!buf) return;
    out.push({ emoji, text: buf });
    buf = "";
  };
  for (let i = 0; i < chars.length; i++) {
    const cp = chars[i].codePointAt(0) ?? 0;
    if (isRegionalIndicator(cp) && i + 1 < chars.length && isRegionalIndicator(chars[i + 1].codePointAt(0) ?? 0)) {
      if (!emoji) flush();
      emoji = true;
      buf += chars[i] + chars[i + 1];
      i += 1;
      continue;
    }
    if (isEmojiUnit(cp)) {
      if (!emoji) flush();
      emoji = true;
      buf += chars[i];
      continue;
    }
    if (emoji) flush();
    emoji = false;
    buf += chars[i];
  }
  flush();
  return out;
}

/**
 * HTML de una nota ya escapada por trozos. El emoji va en un span que no se
 * parte, pegado a la palabra anterior (el PDF de WebKit si no lo baja de línea).
 */
export function noteToHtml(note: string, escape: (s: string) => string): string {
  const trimmed = trimDisplayNote(note);
  let html = "";
  for (const part of splitEmojiSequences(trimmed)) {
    if (!part.emoji) {
      html += escape(part.text);
      continue;
    }
    // Un salto o espacios justo antes del emoji lo bajaban de línea en el PDF.
    if (/[\s\u00a0]$/.test(html)) html = html.replace(/[\s\u00a0]+$/u, " ");
    if (/[\s\u00a0]$/.test(html)) html = html.replace(/(\s)$/u, "\u2060$1\u2060");
    html += `<span class="grapheme">${escape(part.text)}</span>`;
  }
  return html;
}

/**
 * Nombre visible de un destino. Alias vacío → dirección. Si alias y dirección
 * son el mismo texto, una sola vez. Si faltan los dos, cadena vacía (la vista
 * pone "Sin destino" / `#id`).
 */
export function formatSiteName(
  site: { alias?: string | null; address?: string | null } | null | undefined,
): { primary: string; address: string | null } {
  const alias = (site?.alias ?? "").trim();
  const address = (site?.address ?? "").trim();
  if (alias && address && alias.toLowerCase() !== address.toLowerCase()) return { primary: alias, address };
  if (alias) return { primary: alias, address: null };
  if (address) return { primary: address, address: null };
  return { primary: "", address: null };
}
