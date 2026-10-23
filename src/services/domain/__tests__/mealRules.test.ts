/** R10, T12/E10, E21 de umbral, N11 — comida sobre el total del día. */
import type { PayrollCompliance, SessionRecord } from "../../../core/contracts";
import { formatTime, getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { FIRST_MEAL_NOTICE_MIN, mealAlreadyStarted, planMealRestNotices, secondMealWaiverAccepted } from "../caPremiums";
import { PayrollEngineService } from "../PayrollEngineService";
import { CA_POLICY_ID, COMPANY, HOUR, MIN, MONDAY_8AM, RATES, makeClosedSession } from "../../../../test/fixtures/session.fixture";

const DAY = 24 * HOUR;

function statement(sessions: SessionRecord[]) {
  return PayrollEngineService.buildStatement({
    periodStart: getWeekStart(MONDAY_8AM),
    periodEnd: getWeekEnd(MONDAY_8AM),
    sessions,
    rates: RATES,
    company: COMPANY,
    policyId: CA_POLICY_ID,
    nowMs: MONDAY_8AM + 7 * DAY,
  });
}

function workedDay(workMin: number, compliance?: PayrollCompliance): SessionRecord {
  const start = MONDAY_8AM;
  return makeClosedSession(start, (workMin + 30) / 60, {
    lunch: { taken: true, startAtMs: start + 3 * HOUR, endAtMs: start + 3 * HOUR + 30 * MIN, deductedMinutes: null },
    ...(compliance ? { bookkeeping: { compliance } } : {}),
  });
}

describe("reglas de comida", () => {
  test("R10 la renuncia de la segunda comida no vale si la primera se renunció o el día pasa de 720 min", () => {
    expect(secondMealWaiverAccepted({ waiveFirst: true, waiveSecond: true, workedMinutes: 660 })).toBe(false);
    expect(secondMealWaiverAccepted({ waiveFirst: false, waiveSecond: true, workedMinutes: 721 })).toBe(false);
    expect(secondMealWaiverAccepted({ waiveFirst: false, waiveSecond: true, workedMinutes: 720 })).toBe(true);
    expect(secondMealWaiverAccepted({ waiveFirst: false, waiveSecond: true, workedMinutes: 700 })).toBe(true);

    const both = statement([workedDay(660, { waiveFirstMeal: true, waiveSecondMeal: true })]);
    expect(both.lines.filter((l) => l.kind === "MEAL_PREMIUM")).toHaveLength(1);
    const over = statement([workedDay(721, { waiveSecondMeal: true })]);
    expect(over.lines.filter((l) => l.kind === "MEAL_PREMIUM")).toHaveLength(1);
    const ok = statement([workedDay(700, { waiveSecondMeal: true })]);
    expect(ok.lines.filter((l) => l.kind === "MEAL_PREMIUM")).toHaveLength(0);
  });

  test("T12/E10 el total del día manda y el hueco entre jornadas no es una comida", () => {
    const a = makeClosedSession(MONDAY_8AM, 3, { id: 1 });
    const b = makeClosedSession(MONDAY_8AM + 4 * HOUR, 3, { id: 2 });
    const st = statement([a, b]);
    expect(st.lunchMinutes).toBe(0);
    expect(st.regularHours).toBe(6);
    expect(st.lines.filter((l) => l.kind === "MEAL_PREMIUM")).toHaveLength(1);
    expect(st.warnings).toContain("MEAL_GAP_AMBIGUOUS#2");

    const ate = makeClosedSession(MONDAY_8AM, 4, {
      id: 1,
      lunch: { taken: true, startAtMs: MONDAY_8AM + 2 * HOUR, endAtMs: MONDAY_8AM + 2 * HOUR + 30 * MIN, deductedMinutes: null },
    });
    const later = makeClosedSession(MONDAY_8AM + 5 * HOUR, 2, { id: 2 });
    const withMeal = statement([ate, later]);
    expect(withMeal.lunchMinutes).toBe(30);
    expect(withMeal.lines.filter((l) => l.kind === "MEAL_PREMIUM")).toHaveLength(0);
    expect(withMeal.warnings).toContain("MEAL_GAP_AMBIGUOUS#2");
  });

  test("exactamente 300 min no exigen la primera comida; 301 sí", () => {
    expect(statement([makeClosedSession(MONDAY_8AM, 5)]).lines.some((l) => l.kind === "MEAL_PREMIUM")).toBe(false);
    expect(statement([makeClosedSession(MONDAY_8AM, 301 / 60)]).lines.some((l) => l.kind === "MEAL_PREMIUM")).toBe(true);
  });

  test("N11 a las 4 h 30 el aviso usa el total del día y no sale si ya empezó a comer", () => {
    const now = MONDAY_8AM + 270 * MIN;
    const due = planMealRestNotices({
      nowMs: now,
      workedMinutes: 200 + 70,
      mealAlreadyStarted: false,
      restAcknowledged: true,
      formatTime,
    });
    expect(due).toHaveLength(1);
    expect(due[0].code).toBe("N11");
    expect(due[0].body).toBe(`Tu almuerzo vence a las ${formatTime(now + (300 - 270) * MIN)}`);
    expect(FIRST_MEAL_NOTICE_MIN).toBe(270);

    const early = planMealRestNotices({
      nowMs: now,
      workedMinutes: 269,
      mealAlreadyStarted: false,
      restAcknowledged: true,
      formatTime,
    });
    expect(early.some((n) => n.code === "N11")).toBe(false);

    const started = makeClosedSession(MONDAY_8AM, 4, {
      lunch: { taken: true, startAtMs: MONDAY_8AM + 2 * HOUR, endAtMs: null, deductedMinutes: null },
    });
    expect(mealAlreadyStarted([started])).toBe(true);
    const quiet = planMealRestNotices({
      nowMs: now,
      workedMinutes: 270,
      mealAlreadyStarted: mealAlreadyStarted([started]),
      restAcknowledged: true,
      formatTime,
    });
    expect(quiet.some((n) => n.code === "N11")).toBe(false);
  });
});
