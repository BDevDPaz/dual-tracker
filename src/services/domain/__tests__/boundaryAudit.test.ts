/** Regresiones de la auditoría: corte de semana, DST de otoño, duración cero, centavos. */
import { fromWallClock, getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { COMPANY, RATES, makeClosedSession } from "../../../../test/fixtures/session.fixture";
import { PayrollEngineService } from "../PayrollEngineService";
import { CA_DAILY8_WEEKLY40_V2 } from "../payrollPolicies";
import { displayStatement, moneyCents } from "../payrollDisplay";

const V2 = CA_DAILY8_WEEKLY40_V2.id;
const company = { ...COMPANY, overtimePolicyId: V2 };

function statementAt(sessions: ReturnType<typeof makeClosedSession>[], ts: number, rate = RATES.hourlyRate) {
  return PayrollEngineService.buildStatement({
    periodStart: getWeekStart(ts),
    periodEnd: getWeekEnd(ts),
    sessions,
    rates: { ...RATES, hourlyRate: rate },
    company,
    policyId: V2,
    nowMs: ts + 14 * 24 * 60 * 60 * 1000,
  });
}

describe("auditoría — corte, DST y centavos", () => {
  test("dom 18 oct 19:50 → lun 19 oct 00:25 a $35: 250 min y 25 min, $145.83 y $14.58", () => {
    const start = fromWallClock(2026, 10, 18, 19, 50);
    const end = fromWallClock(2026, 10, 19, 0, 25);
    const s = makeClosedSession(start, 0, { id: 9, endAtMs: end });
    const w1 = statementAt([s], start, 35);
    const w2 = statementAt([s], end, 35);
    const mins = (st: typeof w1) => st.lines.filter((l) => l.kind === "REGULAR").reduce((a, l) => a + l.minutes, 0);
    expect(mins(w1)).toBe(250);
    expect(mins(w2)).toBe(25);
    expect(w1.grossEstimate).toBe(145.83);
    expect(w2.grossEstimate).toBe(14.58);
    expect(moneyCents(250, 35) + moneyCents(25, 35)).toBe(16041);
    const d1 = displayStatement(w1);
    const d2 = displayStatement(w2);
    expect(d1.rows.map((r) => r.hours)).toEqual(["4.17"]);
    expect(d2.rows.map((r) => r.hours)).toEqual(["0.42"]);
    expect(d1.rows[0].amountCents + d2.rows[0].amountCents).toBe(16041);
  });

  test("1 nov 2026 01:00–02:00 (fallback en LA) son 120 minutos pagados", () => {
    const start = fromWallClock(2026, 11, 1, 1, 0);
    const end = fromWallClock(2026, 11, 1, 2, 0);
    expect(end - start).toBe(120 * 60_000);
    const st = statementAt([makeClosedSession(start, 0, { endAtMs: end })], start);
    expect(st.lines.filter((l) => l.kind === "REGULAR").reduce((a, l) => a + l.minutes, 0)).toBe(120);
    expect(st.regularHours).toBe(2);
  });

  test("una jornada de 0 minutos entra al statement y no suma pago", () => {
    const t = fromWallClock(2026, 10, 18, 4, 45);
    const st = statementAt([makeClosedSession(t, 0, { endAtMs: t, id: 3 })], t);
    expect(st.sessionIds).toEqual([3]);
    expect(st.regularHours).toBe(0);
    expect(st.grossEstimate).toBe(0);
    expect(displayStatement(st).rows[0]).toMatchObject({ hours: "0.00", amountCents: 0, workedMinutes: 0 });
  });
});
