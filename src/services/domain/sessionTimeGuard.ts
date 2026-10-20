/**
 * Horas que se pueden guardar.
 *
 * El techo es la hora de confianza (max del reloj del teléfono y de la hora
 * de red validada) más una tolerancia corta. Un instante posterior a ese
 * techo no se persiste. La regla de medianoche (atTimeOfDayAfter, §5.2 N6)
 * sigue en el modal: si la salida en el reloj es ≤ a la entrada, el epoch ya
 * es del día siguiente y aquí solo se exige fin > inicio. Un fin ≤ inicio que
 * no pasó por esa regla se rechaza.
 *
 * El libro no se reescribe: quien llama rechaza la escritura y la transacción
 * no añade asiento.
 */
import type { SessionRecord } from "../../core/contracts";
import { FUTURE_TIME_TOLERANCE_MS } from "../../config/provisional";

export { FUTURE_TIME_TOLERANCE_MS };

export function futureCeilingMs(nowMs: number, toleranceMs = FUTURE_TIME_TOLERANCE_MS): number {
  return nowMs + toleranceMs;
}

/** Tope de un control de hora. El valor es el instante, no el HH:mm: la regla de medianoche puede caer al día siguiente. */
export function timePickerMaximum(ceilingMs: number): Date {
  return new Date(ceilingMs);
}

export function isFutureInstant(ts: number | null | undefined, ceilingMs: number): boolean {
  return typeof ts === "number" && Number.isFinite(ts) && ts > ceilingMs;
}

/**
 * Identidad de cada instante de horario. El sello de edición (updatedAt) no
 * entra. El valor no basta: copiar `firstExitAtMs` (ya futuro) a `endAtMs`
 * (que era null) es un instante nuevo.
 */
function scheduleKeys(record: SessionRecord): { key: string; ts: number }[] {
  const out: { key: string; ts: number }[] = [];
  const push = (key: string, n: number | null | undefined) => {
    if (typeof n === "number" && Number.isFinite(n)) out.push({ key, ts: n });
  };
  push("declaredStartAtMs", record.declaredStartAtMs);
  push("actualStartAtMs", record.actualStartAtMs);
  push("endAtMs", record.endAtMs);
  push("lunch.startAtMs", record.lunch?.startAtMs);
  push("lunch.endAtMs", record.lunch?.endAtMs);
  for (const [i, t] of (record.transitSegments ?? []).entries()) {
    push(`transit.${i}.start`, t.startAtMs);
    push(`transit.${i}.end`, t.endAtMs);
  }
  for (const [i, p] of (record.bookkeeping?.pauses ?? []).entries()) {
    push(`pause.${i}.start`, p.startAtMs);
    push(`pause.${i}.end`, p.endAtMs);
  }
  push("lastPauseStartMs", record.bookkeeping?.lastPauseStartMs);
  push("firstExitAtMs", record.bookkeeping?.firstExitAtMs);
  return out;
}

/** Instants that define declared or paid time. */
export function scheduleInstants(record: SessionRecord): number[] {
  return scheduleKeys(record).map((x) => x.ts);
}

/**
 * Future instants on `next` that were not already stored on the same field.
 * A legacy row can be deleted or corrected; it cannot gain a new future instant.
 */
export function newFutureInstants(next: SessionRecord, previous: SessionRecord | null, ceilingMs: number): number[] {
  const prior = new Set(
    (previous ? scheduleKeys(previous) : []).filter((x) => x.ts > ceilingMs).map((x) => `${x.key}=${x.ts}`),
  );
  return scheduleKeys(next)
    .filter((x) => x.ts > ceilingMs && !prior.has(`${x.key}=${x.ts}`))
    .map((x) => x.ts);
}

export class FutureTimestampError extends Error {
  readonly code = "FUTURE_TIME" as const;
  constructor() {
    super("FUTURE_TIME");
    this.name = "FutureTimestampError";
  }
}

/** Almuerzo fijo más largo que la jornada. El libro no se reescribe: quien llama rechaza la escritura. */
export class FixedLunchError extends Error {
  readonly code = "LUNCH_EXCEEDS_SESSION" as const;
  constructor() {
    super("LUNCH_EXCEEDS_SESSION");
    this.name = "FixedLunchError";
  }
}

/** Almuerzo declarado con hora: tiene que caber en [inicio, fin] y durar más de cero. */
export function lunchOutsideSession(sessionStartMs: number, sessionEndMs: number, lunchStartMs: number, lunchEndMs: number): boolean {
  if (!Number.isFinite(lunchStartMs) || !Number.isFinite(lunchEndMs)) return true;
  if (lunchEndMs <= lunchStartMs) return true;
  if (lunchStartMs < sessionStartMs || lunchEndMs > sessionEndMs) return true;
  return false;
}

const SPAN_MS = 60_000;

/** Minutos enteros de [inicio, fin]. Un fin que no es posterior al inicio dura 0. */
export function sessionSpanMinutes(startMs: number, endMs: number): number {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  return Math.max(0, Math.round((endMs - startMs) / SPAN_MS));
}

type FixedLunch = { startAtMs: number | null; endAtMs: number | null; deductedMinutes: number | null };

/** Minutos de pausa ya acumulados. La misma cuenta que usa la nómina antes de capar el almuerzo. */
export function recordedPauseMinutes(record: SessionRecord): number {
  return Math.max(0, Math.round(record.totalPausedMs / SPAN_MS));
}

/**
 * Almuerzo fijo (minutos declarados, sin intervalo). No puede pasar de la
 * jornada menos las pausas: es el mismo tope que `cappedFixedLunchMinutes`.
 * Un almuerzo con inicio y fin lo mira lunchOutsideSession.
 */
export function fixedLunchExceedsSession(lunch: FixedLunch, startMs: number, endMs: number, pauseMinutes = 0): boolean {
  if (lunch.startAtMs != null && lunch.endAtMs != null) return false;
  const minutes = lunch.deductedMinutes;
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return false;
  const room = sessionSpanMinutes(startMs, endMs) - Math.max(0, Math.round(pauseMinutes));
  return Math.round(minutes) > Math.max(0, room);
}

export function sessionFixedLunchExceeds(record: SessionRecord): boolean {
  if (record.endAtMs == null) return false;
  const start = record.actualStartAtMs ?? record.declaredStartAtMs;
  return fixedLunchExceedsSession(record.lunch, start, record.endAtMs, recordedPauseMinutes(record));
}

/**
 * La escritura introduce un almuerzo fijo que no cabe. Un dato ya guardado así
 * se puede anotar o borrar: no se reescribe el expediente sellado ni se bloquea
 * la fila vieja si las horas y los minutos no cambian.
 */
export function introducesFixedLunchOverflow(next: SessionRecord, previous: SessionRecord | null): boolean {
  if (!sessionFixedLunchExceeds(next)) return false;
  if (!previous || !sessionFixedLunchExceeds(previous)) return true;
  const sameLunch =
    previous.lunch.deductedMinutes === next.lunch.deductedMinutes &&
    previous.lunch.startAtMs === next.lunch.startAtMs &&
    previous.lunch.endAtMs === next.lunch.endAtMs;
  const prevStart = previous.actualStartAtMs ?? previous.declaredStartAtMs;
  const nextStart = next.actualStartAtMs ?? next.declaredStartAtMs;
  return !(sameLunch && prevStart === nextStart && previous.endAtMs === next.endAtMs);
}
