/**
 * Porción de una jornada que cae dentro de un periodo (spec v1.3 §5.2 N5).
 * La nómina ya parte los minutos en segmentation.ts; esto solo dice qué reloj
 * y qué fecha hay que mostrar para que la porción se pueda seguir.
 */
import type { SessionRecord } from "../../core/contracts";
import type { CalendarHistory } from "../../utils/dateUtils";
import { segmentInterval, sessionEndMs } from "./segmentation";

const MIN = 60_000;

export interface PeriodSlice {
  displayStartMs: number;
  displayEndMs: number;
  /** Inicio real de la jornada, si esta porción no es el comienzo. */
  continuesFromMs: number | null;
  /** Fin real de la jornada, si esta porción no es el final. */
  continuesUntilMs: number | null;
  /** La porción redondea a 0 minutos (accidental o sub-minuto). */
  zeroDuration: boolean;
}

/** ¿El reloj de pared de la porción, redondeado al minuto, dura cero? */
export function isZeroDuration(startMs: number, endMs: number): boolean {
  return Math.round((endMs - startMs) / MIN) <= 0;
}

/**
 * Segmentos de jornada cuyo inicio cae en [periodStart, periodEnd]. null si
 * la jornada no aporta minutos a ese periodo.
 */
export function periodSliceOf(
  session: SessionRecord,
  periodStart: number,
  periodEnd: number,
  history: CalendarHistory,
  nowMs: number,
): PeriodSlice | null {
  const startMs = session.actualStartAtMs ?? session.declaredStartAtMs;
  const endMs = sessionEndMs(session, nowMs);
  const segs = segmentInterval(startMs, endMs, history, session.bookkeeping.recordedTimeZone).filter((seg) => seg.startMs >= periodStart && seg.startMs <= periodEnd);
  if (!segs.length) return null;
  const displayStartMs = segs[0].startMs;
  const displayEndMs = segs[segs.length - 1].endMs;
  return {
    displayStartMs,
    displayEndMs,
    continuesFromMs: startMs < displayStartMs ? startMs : null,
    continuesUntilMs: endMs > displayEndMs ? endMs : null,
    zeroDuration: isZeroDuration(displayStartMs, displayEndMs),
  };
}
