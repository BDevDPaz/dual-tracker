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
import { nextWorkdayBoundary, toDateString, withCorporateZone, workdayStartAt, workweekStartAt, type CalendarHistory } from "../../utils/dateUtils";
import { LoggingService } from "../persistence/LoggingService";
import { TransitPolicyService } from "./TransitPolicyService";

/** Tope de jornadas al partir un intervalo. Si se alcanza, se trunca y se anota: no se recorta en silencio. */
export const SEGMENT_GUARD = 1000;

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

/** Parte [startMs, endMs) en jornadas. Un intervalo vacío devuelve un segmento vacío. `zone` es la zona en que se registró la jornada. */
export function segmentInterval(startMs: number, endMs: number, history: CalendarHistory, zone?: string | null): DaySegment[] {
  return withCorporateZone(zone, () => segmentIntervalInZone(startMs, endMs, history));
}

function segmentIntervalInZone(startMs: number, endMs: number, history: CalendarHistory): DaySegment[] {
  const mk = (index: number, s: number, e: number): DaySegment => {
    const workdayStartMs = workdayStartAt(s, history);
    return { index, startMs: s, endMs: e, workdayStartMs, dateString: toDateString(workdayStartMs), weekStartMs: workweekStartAt(s, history) };
  };
  if (!(endMs > startMs)) return [mk(0, startMs, startMs)];
  const out: DaySegment[] = [];
  let cur = startMs;
  let guard = 0;
  while (cur < endMs && guard++ < SEGMENT_GUARD) {
    const e = Math.min(nextWorkdayBoundary(cur, history), endMs);
    out.push(mk(out.length, cur, e));
    cur = e;
  }
  if (cur < endMs) {
    LoggingService.log("ROJO", "INTEGRIDAD_COMPROMETIDA", "ERROR", "Segmentación truncada: el intervalo supera el tope de jornadas", {
      startMs,
      endMs,
      segments: out.length,
      guard: SEGMENT_GUARD,
    });
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

/**
 * Almuerzo fijo que la nómina puede descontar. No pasa de la jornada menos
 * las pausas: un dato viejo de 60 min en una jornada de 36 no infla el almuerzo.
 * Quien guarda rechaza ese caso; esto solo lee.
 */
export function cappedFixedLunchMinutes(deductedMinutes: number, spanMinutes: number, pauseMinutes: number): number {
  const declared = Math.max(0, Math.round(deductedMinutes));
  const room = Math.max(0, spanMinutes - Math.max(0, pauseMinutes));
  return Math.min(declared, room);
}

const MEAL_QUALIFY_MS = 30 * MIN;

export interface DeductibleLunch {
  taken?: boolean;
  startAtMs: number | null;
  endAtMs: number | null;
  deductedMinutes: number | null;
  interrupted?: boolean;
}

/**
 * Minutos de comida que sí se restan. Menos de 30 min exactos (ms) o una
 * comida interrumpida no se descuentan. Una comida con hora usa floor, no
 * redondeo hacia arriba. Una declarada de 30 min o más sigue el tope de jornada.
 */
export function deductibleLunchMinutes(
  meal: DeductibleLunch,
  spanMinutes: number,
  pauseMinutes: number,
  nowMs: number,
  open: boolean,
): { minutes: number; unknown: boolean } {
  if (meal.interrupted) return { minutes: 0, unknown: false };
  const timed =
    meal.startAtMs != null && meal.endAtMs != null
      ? Math.max(0, meal.endAtMs - meal.startAtMs)
      : meal.startAtMs != null && meal.endAtMs == null && open
        ? Math.max(0, nowMs - meal.startAtMs)
        : null;
  if (timed != null) {
    if (timed < MEAL_QUALIFY_MS) return { minutes: 0, unknown: false };
    return { minutes: Math.floor(timed / MIN), unknown: false };
  }
  if (meal.deductedMinutes !== null && meal.deductedMinutes !== undefined) {
    if (meal.deductedMinutes < 30) return { minutes: 0, unknown: false };
    return { minutes: cappedFixedLunchMinutes(meal.deductedMinutes, spanMinutes, pauseMinutes), unknown: false };
  }
  if (meal.taken) return { minutes: 0, unknown: true };
  return { minutes: 0, unknown: false };
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
  /** Tramos cancelados pagados cuyo inicio cae en este segmento. Vacío si no hay. */
  cancelledTransits: { minutes: number; endAtMs: number; note: string | null }[];
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
  const segs = segmentInterval(startMs, endMs, history, b.recordedTimeZone);
  const spans = cumulativeMinutes([[startMs, endMs]], segs);
  const n = segs.length;
  const warn: string[][] = segs.map(() => []);

  // Pausas no-almuerzo (antes del almuerzo fijo: el tope es jornada − pausas).
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

  // Almuerzo. Menos de 30 min o interrumpido no se descuenta (no se inventan 30).
  let lunch = segs.map(() => 0);
  const l = session.lunch;
  const interrupted = Boolean(l.interrupted || b.compliance?.mealInterrupted);
  const lunchEnd = l.startAtMs && !l.endAtMs && session.domainStatus === "PAUSADA" ? nowMs : l.endAtMs;
  const spanTotal = spans.reduce((a, x) => a + x, 0);
  const pauseSum = pause.reduce((a, x) => a + x, 0);
  const deducted = deductibleLunchMinutes(
    { ...l, endAtMs: lunchEnd, interrupted },
    spanTotal,
    pauseSum,
    nowMs,
    session.domainStatus === "PAUSADA",
  );
  if (deducted.unknown) warn[0].push("LUNCH_DURATION_UNKNOWN");
  if (deducted.minutes > 0 && l.startAtMs && lunchEnd) {
    lunch = n === 1 ? [deducted.minutes] : cumulativeMinutes([[l.startAtMs, lunchEnd]], segs);
  } else if (deducted.minutes > 0) {
    lunch = n === 1 ? [deducted.minutes] : prorate(deducted.minutes, spans);
    if (n > 1) warn[0].push("LUNCH_PRORATED");
  }
  const second = b.compliance?.secondMeal;
  if (second) {
    const extra = deductibleLunchMinutes(
      {
        taken: true,
        startAtMs: second.startAtMs,
        endAtMs: second.endAtMs,
        deductedMinutes: second.deductedMinutes ?? null,
        interrupted: second.interrupted,
      },
      spanTotal,
      pauseSum + lunch.reduce((a, x) => a + x, 0),
      nowMs,
      false,
    );
    if (extra.minutes > 0) {
      if (n === 1) lunch = [lunch[0] + extra.minutes];
      else if (second.startAtMs != null && second.endAtMs != null) {
        const part = cumulativeMinutes([[second.startAtMs, second.endAtMs]], segs);
        lunch = lunch.map((x, i) => x + part[i]);
      } else {
        lunch = lunch.map((x, i) => x + (i === 0 ? extra.minutes : 0));
      }
    }
  }

  // Tránsito
  const paidOt: Interval[] = [];
  const paidNoOt: Interval[] = [];
  const unpaid: Interval[] = [];
  let transitRateMultiplier = company.transitRateMultiplier;
  let singlePaid = 0;
  let singleOt = 0;
  let singleUnpaid = 0;
  const cancelledAll: { minutes: number; endAtMs: number; note: string | null; startAtMs: number }[] = [];
  const markTransitClip = (t: (typeof session.transitSegments)[number]) => {
    if ((t.clipped || TransitPolicyService.overlapsOutside(t, startMs, endMs)) && !warn[0].includes("TRANSIT_CLIPPED")) warn[0].push("TRANSIT_CLIPPED");
  };
  for (const t of session.transitSegments) {
    if (t.suppressed || (t.cancelled && t.paid !== true)) continue;
    const a = Math.max(t.startAtMs, startMs);
    const b = Math.min(t.endAtMs ?? endMs, endMs);
    if (b <= a) {
      markTransitClip(t);
      continue;
    }
    const iv: Interval = [a, b];
    const d = TransitPolicyService.decide(t, company);
    const minutes = TransitPolicyService.boundedMinutes(t, startMs, endMs);
    markTransitClip(t);
    if (d.paid) {
      transitRateMultiplier = d.rateMultiplier;
      (d.countsTowardOvertime ? paidOt : paidNoOt).push(iv);
      singlePaid += minutes;
      if (d.countsTowardOvertime) singleOt += minutes;
      if (t.cancelled) cancelledAll.push({ minutes, endAtMs: t.endAtMs ?? endMs, note: t.cancelNote ?? null, startAtMs: t.startAtMs });
    } else {
      unpaid.push(iv);
      singleUnpaid += minutes;
    }
  }
  const tOt = n === 1 ? [singleOt] : cumulativeMinutes(paidOt, segs);
  const tNoOt = n === 1 ? [singlePaid - singleOt] : cumulativeMinutes(paidNoOt, segs);
  const tUnpaid = n === 1 ? [singleUnpaid] : cumulativeMinutes(unpaid, segs);

  // El prorrateo deja el resto en el primer segmento. Si ese tramo ya está
  // lleno de pausa (o de tránsito), el descuento que no cabe pasa al siguiente.
  // El último tramo conserva lo que llega: un solo segmento no cambia de línea.
  let lunchCarry = 0;
  const lunchFit = lunch.map((assigned, i) => {
    const want = assigned + lunchCarry;
    if (i === lunch.length - 1) {
      lunchCarry = 0;
      return want;
    }
    const room = Math.max(0, spans[i] - pause[i] - (tOt[i] + tNoOt[i]) - tUnpaid[i]);
    const used = Math.min(want, room);
    lunchCarry = want - used;
    return used;
  });

  return segs.map((segment, i) => {
    const transitPaidMinutes = tOt[i] + tNoOt[i];
    const workMinutes = Math.max(0, spans[i] - lunchFit[i] - pause[i] - transitPaidMinutes - tUnpaid[i]);
    const warnings = [...warn[i]];
    if (i === 0 && n === 1 && spans[0] > 0 && workMinutes === 0) warnings.push("NO_WORK_MINUTES");
    return {
      segment,
      spanMinutes: spans[i],
      lunchMinutes: lunchFit[i],
      pauseMinutes: pause[i],
      transitPaidMinutes,
      transitOtMinutes: tOt[i],
      transitUnpaidMinutes: tUnpaid[i],
      transitRateMultiplier,
      workMinutes,
      warnings,
      cancelledTransits: cancelledFor(segment, cancelledAll, n === 1),
    };
  });
}

function cancelledFor(
  segment: { startMs: number; endMs: number },
  rows: { minutes: number; endAtMs: number; note: string | null; startAtMs: number }[],
  only: boolean,
): { minutes: number; endAtMs: number; note: string | null }[] {
  const picked = only ? rows : rows.filter((r) => r.startAtMs >= segment.startMs && r.startAtMs < segment.endMs);
  return picked.map(({ minutes, endAtMs, note }) => ({ minutes, endAtMs, note }));
}

/** ¿La jornada [start, end) cruza un límite de jornada? (LunchModal pide la hora, §5.3). */
export function crossesWorkdayBoundary(startMs: number, endMs: number, history: CalendarHistory): boolean {
  return nextWorkdayBoundary(startMs, history) < endMs;
}
