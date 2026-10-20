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
 * Instants that define declared or paid time. Bookkeeping stamps
 * (updatedAt, the capture of an earlier edit) are not schedule.
 */
export function scheduleInstants(record: SessionRecord): number[] {
  const out: number[] = [];
  const push = (n: number | null | undefined) => {
    if (typeof n === "number" && Number.isFinite(n)) out.push(n);
  };
  push(record.declaredStartAtMs);
  push(record.actualStartAtMs);
  push(record.endAtMs);
  push(record.lunch?.startAtMs);
  push(record.lunch?.endAtMs);
  for (const t of record.transitSegments ?? []) {
    push(t.startAtMs);
    push(t.endAtMs);
  }
  for (const p of record.bookkeeping?.pauses ?? []) {
    push(p.startAtMs);
    push(p.endAtMs);
  }
  push(record.bookkeeping?.lastPauseStartMs);
  push(record.bookkeeping?.firstExitAtMs);
  return out;
}

/**
 * Future instants on `next` that were not already stored. A legacy row can
 * be deleted or corrected; it cannot gain a new future instant.
 */
export function newFutureInstants(next: SessionRecord, previous: SessionRecord | null, ceilingMs: number): number[] {
  const prior = new Set((previous ? scheduleInstants(previous) : []).filter((t) => t > ceilingMs));
  return scheduleInstants(next).filter((t) => t > ceilingMs && !prior.has(t));
}

export class FutureTimestampError extends Error {
  readonly code = "FUTURE_TIME" as const;
  constructor() {
    super("FUTURE_TIME");
    this.name = "FutureTimestampError";
  }
}

/** Almuerzo declarado: tiene que caber en [inicio, fin] y durar más de cero. */
export function lunchOutsideSession(sessionStartMs: number, sessionEndMs: number, lunchStartMs: number, lunchEndMs: number): boolean {
  if (!Number.isFinite(lunchStartMs) || !Number.isFinite(lunchEndMs)) return true;
  if (lunchEndMs <= lunchStartMs) return true;
  if (lunchStartMs < sessionStartMs || lunchEndMs > sessionEndMs) return true;
  return false;
}
