/**
 * Segmentación por jornada y atribución de pausas (spec v1.3 §5.2 N1 y §5.3).
 * ============================================================================
 * Dominio puro: sin Expo, SQLite ni reloj.
 *  - segmentInterval: parte [start, end) en los límites de jornada del
 *    calendario vigente en cada instante (incluye cambios de calendario).
 *  - Atribución: almuerzo (lunch_start/end), pausas (pauses_json) y tramos de
 *    tránsito se descuentan en el segmento donde ocurrieron; si cruzan un
 *    límite, se parten. Redondeo ACUMULADO al minuto: la suma por segmentos es
 *    igual al redondeo del total.
 *  - Respaldo (solo sesiones antiguas): prorrateo por duración de segmento,
 *    redondeo al minuto y resto al primer segmento, con advertencia
 *    PAUSE_PRORATED o LUNCH_PRORATED.
 *  - Una sesión de un solo segmento da exactamente los mismos minutos que
 *    computeSessionMinutes (sin cambios respecto a v1).
 */
import type { CompanyPolicy, SessionRecord } from "../../core/contracts";
import { companyCalendar } from "../../utils/companyPolicy";
import { nextWorkdayBoundary, toDateString, workdayStartAt, workweekStartAt, type CalendarHistory } from "../../utils/dateUtils";
import { TransitPolicyService } from "./TransitPolicyService";

const MIN = 60_000;

export interface DaySegment {
  index: number;
  startMs: number;
  endMs: number;
  /** Inicio de la jornada (clave de la cubeta diaria). */
  workdayStartMs: number;
  /** "YYYY-MM-DD" de la jornada (dateString de las líneas). */
  dateString: string;
  /** Inicio del periodo semanal (clave de la cubeta semanal). */
  weekStartMs: number;
}

/** Parte [startMs, endMs) en jornadas. Un intervalo vacío devuelve un segmento vacío. */
export function segmentInterval(startMs: number, endMs: number, history: CalendarHistory): DaySegment[] {
  const mk = (index: number, s: number, e: number): DaySegment => {
    const workdayStartMs = workdayStartAt(s, history);
    return { index, startMs: s, endMs: e, workdayStartMs, dateString: toDateString(workdayStartMs), weekStartMs: workweekStartAt(s, history) };
  };
  if (!(endMs > startMs)) return [mk(0, startMs, startMs)];
  const out: DaySegment[] = [];
  let cur = startMs;
  let guard = 0;
  while (cur < endMs && guard++ < 1000) {
    const e = Math.min(nextWorkdayBoundary(cur, history), endMs);
    out.push(mk(out.length, cur, e));
    cur = e;
  }
  return out;
}

type Interval = readonly [number, number];

/** Minutos de `intervals` en cada segmento con redondeo acumulado (suma = round(total)). */
export function cumulativeMinutes(intervals: readonly Interval[], segs: readonly DaySegment[]): number[] {
  let cumMs = 0;
  let prev = 0;
  return segs.map((seg) => {
    for (const [a, b] of intervals) cumMs += Math.max(0, Math.min(b, seg.endMs) - Math.max(a, seg.startMs));
    const r = Math.round(cumMs / MIN);
    const m = r - prev;
    prev = r;
    return m;
  });
}

/** Prorrateo por peso (minutos de segmento): floor y resto al primer segmento. */
export function prorate(totalMinutes: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, w) => a + w, 0);
  if (totalMinutes <= 0 || !weights.length) return weights.map(() => 0);
  if (sum <= 0) return weights.map((_, i) => (i === 0 ? totalMinutes : 0));
  const base = weights.map((w) => Math.floor((totalMinutes * w) / sum));
  base[0] += totalMinutes - base.reduce((a, b) => a + b, 0);
  return base;
}

export interface SegmentMinutes {
  segment: DaySegment;
  spanMinutes: number;
  lunchMinutes: number;
  pauseMinutes: number;
  transitPaidMinutes: number;
  transitOtMinutes: number;
  transitUnpaidMinutes: number;
  transitRateMultiplier: number;
  workMinutes: number;
  warnings: string[];
}

/** Fin efectivo de la sesión (misma regla que computeSessionMinutes). */
export function sessionEndMs(session: SessionRecord, nowMs: number): number {
  const b = session.bookkeeping;
  return session.endAtMs ?? (session.domainStatus === "SALIDA" && b.firstExitAtMs ? b.firstExitAtMs : nowMs);
}

/**
 * Desglose por segmento de jornada. Devuelve null para sesiones borradas o
 * canceladas (como computeSessionMinutes).
 */
export function computeSegmentMinutes(
  session: SessionRecord,
  company: CompanyPolicy,
  nowMs: number,
  history: CalendarHistory = companyCalendar(company),
): SegmentMinutes[] | null {
  const b = session.bookkeeping;
  if (b.isDeleted || b.cancelled) return null;
  const startMs = session.actualStartAtMs ?? session.declaredStartAtMs;
  const endMs = sessionEndMs(session, nowMs);
  const segs = segmentInterval(startMs, endMs, history);
  const spans = cumulativeMinutes([[startMs, endMs]], segs);
  const n = segs.length;
  const warn: string[][] = segs.map(() => []);

  // Almuerzo
  let lunch = segs.map(() => 0);
  const l = session.lunch;
  const lunchEnd = l.startAtMs && !l.endAtMs && session.domainStatus === "PAUSADA" ? nowMs : l.endAtMs;
  if (l.startAtMs && lunchEnd) {
    lunch = n === 1 ? [Math.max(0, Math.round((lunchEnd - l.startAtMs) / MIN))] : cumulativeMinutes([[l.startAtMs, lunchEnd]], segs);
  } else if (l.deductedMinutes !== null && l.deductedMinutes !== undefined) {
    const total = Math.max(0, Math.round(l.deductedMinutes));
    lunch = n === 1 ? [total] : prorate(total, spans);
    if (n > 1 && total > 0) warn[0].push("LUNCH_PRORATED");
  } else if (l.taken) {
    warn[0].push("LUNCH_DURATION_UNKNOWN");
  }

  // Pausas no-almuerzo
  const openPause = b.lastPauseStartMs ? Math.max(0, nowMs - b.lastPauseStartMs) : 0;
  const pauseTotal = Math.round((session.totalPausedMs + openPause) / MIN);
  let pause = segs.map(() => 0);
  if (n === 1) {
    pause = [pauseTotal];
  } else {
    const recorded: Interval[] =
      b.pausesSource === "PRORATED" ? [] : (b.pauses ?? []).map((p) => [p.startAtMs, p.endAtMs ?? nowMs] as const);
    pause = cumulativeMinutes(recorded, segs);
    const residual = pauseTotal - pause.reduce((a, x) => a + x, 0);
    // Resto sin horas (> 1 min de tolerancia, §5.3 ±60 s) → prorrateo con advertencia.
    if (residual > 1) {
      const extra = prorate(residual, spans);
      pause = pause.map((x, i) => x + extra[i]);
      warn[0].push("PAUSE_PRORATED");
    }
  }
  if (b.breaksClipped) warn[0].push("PAUSE_CLIPPED");

  // Tránsito
  const paidOt: Interval[] = [];
  const paidNoOt: Interval[] = [];
  const unpaid: Interval[] = [];
  let transitRateMultiplier = company.transitRateMultiplier;
  let singlePaid = 0;
  let singleOt = 0;
  let singleUnpaid = 0;
  for (const t of session.transitSegments) {
    if (t.cancelled) continue;
    const iv: Interval = [t.startAtMs, t.endAtMs ?? endMs];
    const d = TransitPolicyService.decide(t, company);
    const minutes = TransitPolicyService.segmentMinutes(t, endMs);
    if (d.paid) {
      transitRateMultiplier = d.rateMultiplier;
      (d.countsTowardOvertime ? paidOt : paidNoOt).push(iv);
      singlePaid += minutes;
      if (d.countsTowardOvertime) singleOt += minutes;
    } else {
      unpaid.push(iv);
      singleUnpaid += minutes;
    }
  }
  const tOt = n === 1 ? [singleOt] : cumulativeMinutes(paidOt, segs);
  const tNoOt = n === 1 ? [singlePaid - singleOt] : cumulativeMinutes(paidNoOt, segs);
  const tUnpaid = n === 1 ? [singleUnpaid] : cumulativeMinutes(unpaid, segs);

  return segs.map((segment, i) => {
    const transitPaidMinutes = tOt[i] + tNoOt[i];
    const workMinutes = Math.max(0, spans[i] - lunch[i] - pause[i] - transitPaidMinutes - tUnpaid[i]);
    const warnings = [...warn[i]];
    if (i === 0 && n === 1 && spans[0] > 0 && workMinutes === 0) warnings.push("NO_WORK_MINUTES");
    return {
      segment,
      spanMinutes: spans[i],
      lunchMinutes: lunch[i],
      pauseMinutes: pause[i],
      transitPaidMinutes,
      transitOtMinutes: tOt[i],
      transitUnpaidMinutes: tUnpaid[i],
      transitRateMultiplier,
      workMinutes,
      warnings,
    };
  });
}

/** ¿La jornada [start, end) cruza un límite de jornada? (LunchModal pide la hora, §5.3). */
export function crossesWorkdayBoundary(startMs: number, endMs: number, history: CalendarHistory): boolean {
  return nextWorkdayBoundary(startMs, history) < endMs;
}
