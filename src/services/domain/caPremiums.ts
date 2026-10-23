/**
 * Primas de comida y descanso (California, LC 226.7 / 512) y avisos N11 / N20.
 * No reparte overtime: eso sigue en allocate(). Una prima es 1 h a la tarifa
 * regular (con bono no discrecional) y no suma minutos de trabajo.
 */
import type { PayrollCompliance, PayrollLine, PayrollRates, SessionRecord } from "../../core/contracts";
import { workdayStartAt, type CalendarHistory } from "../../utils/dateUtils";
import { moneyCents } from "./payrollDisplay";
import { deductibleLunchMinutes } from "./segmentation";

export const FIRST_MEAL_DEADLINE_MIN = 300;
export const FIRST_MEAL_NOTICE_MIN = 270;
export const SECOND_MEAL_AFTER_MIN = 600;
export const SECOND_WAIVER_MAX_MIN = 720;
export const FIRST_WAIVER_MAX_MIN = 360;
export const REST_NOTICE_MIN = 210;
export const REST_BLOCK_MIN = 240;
export const PREMIUM_MINUTES = 60;
const MIN_MS = 60_000;

export interface PremiumAllocItem {
  sessionId: number;
  dateString: string;
  siteId: number | null;
  startMs: number;
  spanMinutes: number;
  workMinutes: number;
  transitPaidMinutes: number;
  dayKey: string;
}

export interface MealRestNotice {
  code: "N11" | "N20";
  body: string;
  deadlineMs?: number;
}

interface RecordedMeal {
  startAtMs: number | null;
  dutyFree: boolean;
}

function dutyFree(meal: {
  startAtMs: number | null;
  endAtMs: number | null;
  deductedMinutes?: number | null;
  interrupted?: boolean;
}): boolean {
  if (meal.interrupted) return false;
  if (meal.startAtMs != null && meal.endAtMs != null) return meal.endAtMs - meal.startAtMs >= 30 * MIN_MS;
  if (meal.deductedMinutes != null) return meal.deductedMinutes >= 30;
  return false;
}

function mealsOf(session: SessionRecord): RecordedMeal[] {
  const c = session.bookkeeping.compliance;
  const primary = {
    ...session.lunch,
    interrupted: Boolean(session.lunch.interrupted || c?.mealInterrupted),
  };
  const out: RecordedMeal[] = [{ startAtMs: primary.startAtMs, dutyFree: dutyFree(primary) }];
  const second = c?.secondMeal;
  if (second) out.push({ startAtMs: second.startAtMs ?? null, dutyFree: dutyFree({ ...second, deductedMinutes: second.deductedMinutes ?? null }) });
  return out.filter((m) => m.dutyFree || m.startAtMs != null || false);
}

/** Minutos trabajados (trabajo + tránsito pagado) antes de `atMs` en la jornada. */
export function workedMinutesBefore(items: readonly PremiumAllocItem[], atMs: number): number {
  let mins = 0;
  for (const it of [...items].sort((a, b) => a.startMs - b.startMs)) {
    const worked = it.workMinutes + it.transitPaidMinutes;
    const end = it.startMs + it.spanMinutes * MIN_MS;
    if (end <= atMs) mins += worked;
    else if (it.startMs < atMs) mins += Math.min(worked, Math.floor((atMs - it.startMs) / MIN_MS));
  }
  return mins;
}

/** Descansos de 10 min exigidos: 0 bajo 3 h 30; luego uno por cada 4 h o fracción mayor. */
export function requiredRestBreaks(workedMinutes: number): number {
  if (workedMinutes < REST_NOTICE_MIN) return 0;
  return Math.ceil((workedMinutes - 120) / REST_BLOCK_MIN);
}

/**
 * La renuncia de la segunda comida solo vale si la primera no se renunció
 * y la jornada no pasa de 12 h. A las 12 h exactas sigue valiendo.
 */
export function secondMealWaiverAccepted(input: { waiveFirst: boolean; waiveSecond: boolean; workedMinutes: number }): boolean {
  return input.waiveSecond && !input.waiveFirst && input.workedMinutes <= SECOND_WAIVER_MAX_MIN;
}

export function mealAlreadyStarted(sessions: readonly SessionRecord[]): boolean {
  return sessions.some((s) => {
    const l = s.lunch;
    if (l.startAtMs != null) return true;
    if ((l.deductedMinutes ?? 0) > 0) return true;
    if (l.taken) return true;
    const second = s.bookkeeping.compliance?.secondMeal;
    return Boolean(second && (second.startAtMs != null || (second.deductedMinutes ?? 0) > 0));
  });
}

export function planMealRestNotices(input: {
  nowMs: number;
  workedMinutes: number;
  mealAlreadyStarted: boolean;
  restAcknowledged: boolean;
  formatTime: (ms: number) => string;
}): MealRestNotice[] {
  const notices: MealRestNotice[] = [];
  if (input.workedMinutes >= FIRST_MEAL_NOTICE_MIN && input.workedMinutes < FIRST_MEAL_DEADLINE_MIN && !input.mealAlreadyStarted) {
    const deadlineMs = input.nowMs + (FIRST_MEAL_DEADLINE_MIN - input.workedMinutes) * MIN_MS;
    notices.push({ code: "N11", deadlineMs, body: `Tu almuerzo vence a las ${input.formatTime(deadlineMs)}` });
  }
  if (input.workedMinutes >= REST_NOTICE_MIN && !input.restAcknowledged) {
    notices.push({ code: "N20", body: "Te toca un descanso de 10 minutos." });
  }
  return notices;
}

/** «Lo tomé»: marca el descanso y no toca pausas ni minutos. */
export function applyRestAcknowledgement(session: SessionRecord): SessionRecord {
  const compliance: PayrollCompliance = { ...session.bookkeeping.compliance, restBreaksTaken: true };
  return { ...session, bookkeeping: { ...session.bookkeeping, compliance } };
}

function flag(sessions: readonly SessionRecord[], key: "waiveFirstMeal" | "waiveSecondMeal"): boolean {
  return sessions.some((s) => s.bookkeeping.compliance?.[key] === true);
}

function sessionEnd(s: SessionRecord): number | null {
  return s.endAtMs;
}

export function evaluateDayPremiums(input: {
  items: readonly PremiumAllocItem[];
  sessions: ReadonlyMap<number, SessionRecord>;
  rates: PayrollRates;
  hourlyRateOf: (sessionId: number) => number;
  splitByWorkday: boolean;
  history?: CalendarHistory;
}): { lines: PayrollLine[]; warnings: string[]; appliedRules: string[] } {
  const lines: PayrollLine[] = [];
  const warnings: string[] = [];
  const appliedRules: string[] = [];
  const byDay = new Map<string, PremiumAllocItem[]>();
  for (const it of input.items) {
    const list = byDay.get(it.dayKey) ?? [];
    list.push(it);
    byDay.set(it.dayKey, list);
  }

  let meal = false;
  let rest = false;
  for (const dayItems of byDay.values()) {
    const worked = dayItems.reduce((a, it) => a + it.workMinutes + it.transitPaidMinutes, 0);
    const ids = [...new Set(dayItems.map((it) => it.sessionId))];
    const sessions = ids.map((id) => input.sessions.get(id)).filter((s): s is SessionRecord => Boolean(s));
    const earliest = [...dayItems].sort((a, b) => a.startMs - b.startMs || a.sessionId - b.sessionId)[0];
    if (!earliest) continue;

    const firstRequired = worked > FIRST_MEAL_DEADLINE_MIN;
    const secondRequired = worked >= SECOND_MEAL_AFTER_MIN;
    const waiveFirst = flag(sessions, "waiveFirstMeal");
    const waiveSecond = flag(sessions, "waiveSecondMeal");
    const firstWaiverOk = waiveFirst && worked > FIRST_MEAL_DEADLINE_MIN && worked <= FIRST_WAIVER_MAX_MIN;
    const secondWaiverOk = secondMealWaiverAccepted({ waiveFirst, waiveSecond, workedMinutes: worked }) && secondRequired;

    let firstFilled = !firstRequired || firstWaiverOk;
    let secondFilled = !secondRequired || secondWaiverOk;
    const recorded = sessions.flatMap((s) => mealsOf(s)).filter((m) => m.dutyFree);
    const timed = recorded.filter((m) => m.startAtMs != null).sort((a, b) => a.startAtMs! - b.startAtMs!);
    const untimed = recorded.filter((m) => m.startAtMs == null);
    for (const m of timed) {
      const before = workedMinutesBefore(dayItems, m.startAtMs!);
      if (!firstFilled && before <= FIRST_MEAL_DEADLINE_MIN) {
        firstFilled = true;
        continue;
      }
      if (!secondFilled && before <= SECOND_MEAL_AFTER_MIN) {
        secondFilled = true;
      }
    }
    for (const _m of untimed) {
      if (!firstFilled) {
        firstFilled = true;
        continue;
      }
      if (!secondFilled) secondFilled = true;
    }
    if (!firstFilled || !secondFilled) {
      lines.push(premiumLine(earliest, "MEAL_PREMIUM", premiumRate(dayItems, input)));
      meal = true;
    }

    if (requiredRestBreaks(worked) > 0 && sessions.some((s) => s.bookkeeping.compliance?.restBreaksTaken === false)) {
      lines.push(premiumLine(earliest, "REST_PREMIUM", premiumRate(dayItems, input)));
      rest = true;
    }

    const ordered = [...sessions].sort(
      (a, b) => (a.actualStartAtMs ?? a.declaredStartAtMs) - (b.actualStartAtMs ?? b.declaredStartAtMs),
    );
    for (let i = 1; i < ordered.length; i++) {
      const prev = ordered[i - 1];
      const next = ordered[i];
      const prevEnd = sessionEnd(prev);
      const nextStart = next.actualStartAtMs ?? next.declaredStartAtMs;
      if (prevEnd == null || nextStart - prevEnd < 30 * MIN_MS) continue;
      if (input.splitByWorkday && workdayStartAt(prevEnd - 1, input.history) !== workdayStartAt(nextStart, input.history)) continue;
      const tag = `MEAL_GAP_AMBIGUOUS#${next.id}`;
      if (!warnings.includes(tag)) warnings.push(tag);
    }
  }

  if (meal) appliedRules.push("CA_MEAL_PREMIUM");
  if (rest) appliedRules.push("CA_REST_PREMIUM");
  return { lines, warnings, appliedRules };
}

function premiumRate(
  dayItems: readonly PremiumAllocItem[],
  input: { rates: PayrollRates; hourlyRateOf: (sessionId: number) => number },
): number {
  let num = 0;
  let den = 0;
  for (const it of dayItems) {
    const mins = it.workMinutes + it.transitPaidMinutes;
    num += mins * input.hourlyRateOf(it.sessionId);
    den += mins;
  }
  const hourly = den > 0 ? num / den : input.rates.hourlyRate;
  return hourly + (input.rates.nondiscretionaryBonusPerHour ?? 0);
}

function premiumLine(it: PremiumAllocItem, kind: "MEAL_PREMIUM" | "REST_PREMIUM", rate: number): PayrollLine {
  return {
    sessionId: it.sessionId,
    dateString: it.dateString,
    siteId: it.siteId,
    kind,
    minutes: PREMIUM_MINUTES,
    rate,
    amount: moneyCents(PREMIUM_MINUTES, rate) / 100,
    warnings: [],
  };
}

/** Minutos de la segunda comida que sí se descuentan (declarada y ≥ 30 min). */
export function secondMealDeductionMinutes(session: SessionRecord, spanMinutes: number, pauseAndLunch: number, nowMs: number): number {
  const second = session.bookkeeping.compliance?.secondMeal;
  if (!second) return 0;
  const d = deductibleLunchMinutes(
    {
      taken: true,
      startAtMs: second.startAtMs,
      endAtMs: second.endAtMs,
      deductedMinutes: second.deductedMinutes ?? null,
      interrupted: second.interrupted,
    },
    spanMinutes,
    pauseAndLunch,
    nowMs,
    false,
  );
  const room = Math.max(0, spanMinutes - pauseAndLunch);
  return Math.min(d.minutes, room);
}
