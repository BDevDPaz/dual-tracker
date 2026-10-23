/** R06, R07, R09, E21, E30, C08 — prima de comida. */
import type { PayrollCompliance, PayrollRates, SessionRecord } from "../../../core/contracts";
import { getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { PayrollEngineService } from "../PayrollEngineService";
import { CA_POLICY_ID, COMPANY, HOUR, MIN, MONDAY_8AM, RATES, makeClosedSession } from "../../../../test/fixtures/session.fixture";

const DAY = 24 * HOUR;

function statement(sessions: SessionRecord[], rates: PayrollRates = RATES) {
  return PayrollEngineService.buildStatement({
    periodStart: getWeekStart(MONDAY_8AM),
    periodEnd: getWeekEnd(MONDAY_8AM),
    sessions,
    rates,
    company: COMPANY,
    policyId: CA_POLICY_ID,
    nowMs: MONDAY_8AM + 7 * DAY,
  });
}

function mealLines(sessions: SessionRecord[], rates?: PayrollRates) {
  return statement(sessions, rates).lines.filter((l) => l.kind === "MEAL_PREMIUM");
}

function withMeal(workMin: number, lunchMin: number, compliance?: PayrollCompliance, id = 1): SessionRecord {
  const start = MONDAY_8AM;
  const lunch =
    lunchMin > 0
      ? { taken: true, startAtMs: start + 4 * HOUR, endAtMs: start + 4 * HOUR + lunchMin * MIN, deductedMinutes: null as number | null }
      : { taken: false, startAtMs: null, endAtMs: null, deductedMinutes: null as number | null };
  return makeClosedSession(start, (workMin + lunchMin) / 60, {
    id,
    lunch,
    ...(compliance ? { bookkeeping: { compliance } } : {}),
  });
}

describe("prima de comida", () => {
  test("R06 la prima es 1 h a la tarifa regular, bono incluido, y no suma horas ni OT", () => {
    const rates = { hourlyRate: 20, overtimeMultiplier: 1.5, nondiscretionaryBonusPerHour: 5 };
    const st = statement([makeClosedSession(MONDAY_8AM, 9)], rates);
    const meal = st.lines.find((l) => l.kind === "MEAL_PREMIUM")!;
    expect(meal.minutes).toBe(60);
    expect(meal.rate).toBe(25);
    expect(meal.amount).toBe(25);
    expect(st.regularHours).toBe(8);
    expect(st.overtimeDailyHours).toBe(1);
    expect(st.lines.find((l) => l.kind === "REGULAR")!.rate).toBe(20);
    expect(st.lines.find((l) => l.kind === "OVERTIME_DAILY")!.rate).toBe(30);
  });

  test("R07 como máximo una prima de comida y una de descanso por día", () => {
    const late = makeClosedSession(MONDAY_8AM, 13, {
      id: 1,
      lunch: { taken: true, startAtMs: MONDAY_8AM + 6 * HOUR, endAtMs: MONDAY_8AM + 6.5 * HOUR, deductedMinutes: null },
      bookkeeping: { compliance: { restBreaksTaken: false } },
    });
    const one = statement([late]);
    expect(one.lines.filter((l) => l.kind === "MEAL_PREMIUM")).toHaveLength(1);
    expect(one.lines.filter((l) => l.kind === "REST_PREMIUM")).toHaveLength(1);

    const a = makeClosedSession(MONDAY_8AM, 4, { id: 1, bookkeeping: { compliance: { restBreaksTaken: false } } });
    const b = makeClosedSession(MONDAY_8AM + 5 * HOUR, 4, { id: 2, bookkeeping: { compliance: { restBreaksTaken: false } } });
    const two = statement([a, b]);
    expect(two.lines.filter((l) => l.kind === "REST_PREMIUM")).toHaveLength(1);
    expect(two.lines.filter((l) => l.kind === "MEAL_PREMIUM")).toHaveLength(1);
  });

  test("R09 con renuncia de la primera comida, 350 min no generan prima y 370 sí", () => {
    const waiver: PayrollCompliance = { waiveFirstMeal: true };
    expect(mealLines([withMeal(350, 0, waiver)])).toHaveLength(0);
    expect(mealLines([withMeal(370, 0, waiver)])).toHaveLength(1);
  });

  test("E21 600 min sin segunda comida generan prima; 599 no la exigen", () => {
    expect(mealLines([withMeal(600, 30)])).toHaveLength(1);
    expect(mealLines([withMeal(599, 30)])).toHaveLength(0);
  });

  test("E30 un almuerzo de 20 min no se descuenta y genera prima; 31 min se descuentan enteros", () => {
    const short = makeClosedSession(MONDAY_8AM, 9, {
      lunch: { taken: true, startAtMs: MONDAY_8AM + 4 * HOUR, endAtMs: MONDAY_8AM + 4 * HOUR + 20 * MIN, deductedMinutes: null },
    });
    const shortSt = statement([short]);
    expect(shortSt.lunchMinutes).toBe(0);
    expect(shortSt.lines.filter((l) => l.kind === "MEAL_PREMIUM")).toHaveLength(1);

    const full = makeClosedSession(MONDAY_8AM, 0, {
      endAtMs: MONDAY_8AM + (8 * 60 + 31) * MIN,
      lunch: { taken: true, startAtMs: MONDAY_8AM + 4 * HOUR, endAtMs: MONDAY_8AM + 4 * HOUR + 31 * MIN, deductedMinutes: null },
    });
    const fullSt = statement([full]);
    expect(fullSt.lunchMinutes).toBe(31);
    expect(fullSt.regularHours).toBe(8);
    expect(fullSt.overtimeHours).toBe(0);
    expect(fullSt.lines.filter((l) => l.kind === "MEAL_PREMIUM")).toHaveLength(0);
  });

  test("C08 nunca se descuentan comidas que nadie declaró", () => {
    const st = statement([makeClosedSession(MONDAY_8AM, 8)]);
    expect(st.lunchMinutes).toBe(0);
    expect(st.lines.filter((l) => l.kind === "LUNCH_DEDUCTION")).toHaveLength(0);
    expect(st.regularHours).toBe(8);
  });

  test("una comida interrumpida no se descuenta y deja la prima", () => {
    const s = makeClosedSession(MONDAY_8AM, 8, {
      lunch: {
        taken: true,
        startAtMs: MONDAY_8AM + 3 * HOUR,
        endAtMs: MONDAY_8AM + 3 * HOUR + 45 * MIN,
        deductedMinutes: null,
        interrupted: true,
      },
    });
    const st = statement([s]);
    expect(st.lunchMinutes).toBe(0);
    expect(st.lines.filter((l) => l.kind === "MEAL_PREMIUM")).toHaveLength(1);
  });
});
