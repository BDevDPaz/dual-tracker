/** T1 — PayrollEngine + políticas. Tiempo solo vía fixtures (prohibido Date.now() suelto). */
import type { SessionRecord } from "../../../core/contracts";
import { getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { PayrollEngineService, computeSessionMinutes, rollupIntegrity } from "../PayrollEngineService";
import { CA_DAILY8_WEEKLY40_V1, LEGACY_DAILY8_V1, getPayrollPolicy } from "../payrollPolicies";
import { CA_POLICY_ID, COMPANY, HOUR, MIN, MONDAY_8AM, RATES, makeClosedSession, makeSegment, makeSession } from "../../../../test/fixtures/session.fixture";

const DAY = 24 * HOUR;
function statement(sessions: SessionRecord[], policyId = CA_POLICY_ID, company = COMPANY) {
  return PayrollEngineService.buildStatement({
    periodStart: getWeekStart(MONDAY_8AM),
    periodEnd: getWeekEnd(MONDAY_8AM),
    sessions,
    rates: RATES,
    company,
    policyId,
    nowMs: MONDAY_8AM + 7 * DAY,
  });
}
const kinds = (st: ReturnType<typeof statement>, k: string) => st.lines.filter((l) => l.kind === k);

describe("PayrollEngineService", () => {
  test("'california-daily-8-weekly-40' de la propuesta = CA_DAILY8_WEEKLY40_v1", () => {
    expect(CA_POLICY_ID).toBe("CA_DAILY8_WEEKLY40_v1");
    expect(CA_DAILY8_WEEKLY40_V1).toMatchObject({ dailyOvertimeAfterMinutes: 480, weeklyOvertimeAfterMinutes: 2400, dailyScope: "DAY" });
    expect(getPayrollPolicy("desconocida").id).toBe(CA_POLICY_ID);
  });

  test("[obligatorio #4] 9 h en un día = 8 regular + 1 OT con CA_DAILY8_WEEKLY40_v1", () => {
    const st = statement([makeClosedSession(MONDAY_8AM, 9)]);
    expect(st.policyId).toBe(CA_POLICY_ID);
    expect(st.regularHours).toBe(8);
    expect(st.overtimeHours).toBe(1);
    expect(st.overtimeDailyHours).toBe(1);
    expect(st.grossEstimate).toBe(8 * 20 + 1 * 30);
  });

  test("[obligatorio #5] almuerzo de 60 min no entra al bruto", () => {
    const s = makeClosedSession(MONDAY_8AM, 9, {
      lunch: { taken: true, startAtMs: MONDAY_8AM + 4 * HOUR, endAtMs: MONDAY_8AM + 5 * HOUR, deductedMinutes: null },
    });
    const st = statement([s]);
    expect(st.lunchMinutes).toBe(60);
    expect(st.regularHours).toBe(8);
    expect(st.overtimeHours).toBe(0);
    expect(st.grossEstimate).toBe(160);
    const lunch = kinds(st, "LUNCH_DEDUCTION");
    expect(lunch).toHaveLength(1);
    expect(lunch[0]).toMatchObject({ minutes: 60, rate: 0, amount: 0 });
    // El bruto es exactamente la suma de líneas pagadas: el almuerzo no aporta.
    const paid = st.lines.filter((l) => l.kind !== "LUNCH_DEDUCTION").reduce((a, l) => a + l.amount, 0);
    expect(st.grossEstimate).toBe(paid);
  });

  test("almuerzo declarado en el cierre (deductedMinutes) también se descuenta", () => {
    const s = makeClosedSession(MONDAY_8AM, 9, { lunch: { taken: true, startAtMs: null, endAtMs: null, deductedMinutes: 60 } });
    expect(statement([s]).regularHours).toBe(8);
  });

  test("almuerzo tomado sin duración: advertencia, no se asumen 60 min", () => {
    const s = makeClosedSession(MONDAY_8AM, 9, { lunch: { taken: true, startAtMs: null, endAtMs: null, deductedMinutes: null } });
    const st = statement([s]);
    expect(st.warnings).toContain("LUNCH_DURATION_UNKNOWN#1");
    expect(st.regularHours + st.overtimeHours).toBe(9);
  });

  test("CA: el umbral diario suma todas las sesiones del día", () => {
    const st = statement([makeClosedSession(MONDAY_8AM, 5, { id: 1 }), makeClosedSession(MONDAY_8AM + 6 * HOUR, 5, { id: 2 })]);
    expect(st.regularHours).toBe(8);
    expect(st.overtimeDailyHours).toBe(2);
  });

  test("LEGACY_DAILY8_v1: umbral por sesión (GEOTrack)", () => {
    const st = statement([makeClosedSession(MONDAY_8AM, 5, { id: 1 }), makeClosedSession(MONDAY_8AM + 6 * HOUR, 5, { id: 2 })], LEGACY_DAILY8_V1.id);
    expect(st.regularHours).toBe(10);
    expect(st.overtimeHours).toBe(0);
  });

  test("40 h semanales: el sexto día de 8 h es OT semanal", () => {
    const week = [0, 1, 2, 3, 4, 5].map((d) => makeClosedSession(MONDAY_8AM + d * DAY, 8, { id: d + 1 }));
    const st = statement(week);
    expect(st.regularHours).toBe(40);
    expect(st.overtimeWeeklyHours).toBe(8);
    expect(st.overtimeDailyHours).toBe(0);
  });

  test("tránsito que cuenta para OT consume la cubeta diaria y se paga en su línea", () => {
    const seg = makeSegment({ startAtMs: MONDAY_8AM + 8 * HOUR, endAtMs: MONDAY_8AM + 8 * HOUR + 30 * MIN, paid: true, rateMultiplier: 1, countsTowardOvertime: true });
    const s = makeClosedSession(MONDAY_8AM, 8.5, { transitSegments: [seg] });
    const st = statement([s]);
    expect(st.transitHours).toBe(0.5);
    expect(st.regularHours).toBe(7.5);
    expect(st.overtimeDailyHours).toBe(0.5);
    expect(st.grossEstimate).toBe(7.5 * 20 + 0.5 * 30 + 0.5 * 20);
  });

  test("paid congelado no sigue un cambio posterior de transitPaid", () => {
    const window = { startAtMs: MONDAY_8AM + 2 * HOUR, endAtMs: MONDAY_8AM + 2 * HOUR + 30 * MIN };
    const paid = statement([makeClosedSession(MONDAY_8AM, 8, { transitSegments: [makeSegment({ ...window, paid: true, rateMultiplier: 1, countsTowardOvertime: true })] })], CA_POLICY_ID, { ...COMPANY, transitPaid: false });
    expect(paid.transitHours).toBe(0.5);
    const unpaid = statement([makeClosedSession(MONDAY_8AM, 8, { transitSegments: [makeSegment({ ...window, paid: false })] })], CA_POLICY_ID, { ...COMPANY, transitPaid: true });
    expect(unpaid.transitHours).toBe(0);
    expect(unpaid.regularHours).toBe(7.5);
  });

  test("minutos de tránsito fuera de la jornada no se pagan", () => {
    const seg = makeSegment({ startAtMs: MONDAY_8AM + 7.5 * HOUR, endAtMs: MONDAY_8AM + 9 * HOUR });
    const st = statement([makeClosedSession(MONDAY_8AM, 8, { transitSegments: [seg] })]);
    expect(st.transitHours).toBe(0.5);
    expect(st.warnings.some((w) => w.startsWith("TRANSIT_CLIPPED"))).toBe(true);
  });

  test("tránsito según TransitPolicy: pagado sale como línea TRANSIT y no como trabajo", () => {
    const seg = makeSegment({ startAtMs: MONDAY_8AM + 2 * HOUR, endAtMs: MONDAY_8AM + 2 * HOUR + 30 * MIN });
    const s = makeClosedSession(MONDAY_8AM, 8, { transitSegments: [seg] });
    const paid = statement([s]);
    expect(paid.transitHours).toBe(0.5);
    expect(paid.regularHours).toBe(7.5);
    const unpaid = statement([s], CA_POLICY_ID, { ...COMPANY, transitPaid: false });
    expect(unpaid.transitHours).toBe(0);
    expect(kinds(unpaid, "TRANSIT")).toHaveLength(0);
    expect(unpaid.regularHours).toBe(7.5);
  });

  test("solo sesiones CERRADAS entran; borradas y canceladas no", () => {
    const st = statement([
      makeClosedSession(MONDAY_8AM, 8, { id: 1 }),
      makeSession({ id: 2, declaredStartAtMs: MONDAY_8AM + DAY }),
      makeClosedSession(MONDAY_8AM + 2 * DAY, 8, { id: 3, bookkeeping: { isDeleted: true } }),
      makeClosedSession(MONDAY_8AM + 3 * DAY, 8, { id: 4, bookkeeping: { cancelled: true } }),
    ]);
    expect(st.sessionIds).toEqual([1, 4]);
    expect(st.regularHours).toBe(8);
    expect(st.warnings).toContain("OPEN_SESSION_EXCLUDED");
  });

  test("CONFLICT marca el statement como no certificado", () => {
    const r = rollupIntegrity([makeClosedSession(MONDAY_8AM, 8), makeClosedSession(MONDAY_8AM + DAY, 8, { id: 2, integrityClass: "CONFLICT" })]);
    expect(r).toMatchObject({ total: 2, hasConflict: true, certified: false });
    expect(r.byClass.CONFLICT).toBe(1);
  });

  test("policyId inmutable: el preview usa la política con la que nació la sesión", () => {
    const s = makeClosedSession(MONDAY_8AM, 10, { policyId: LEGACY_DAILY8_V1.id });
    const p = PayrollEngineService.previewSession(s, RATES, COMPANY, MONDAY_8AM + DAY)!;
    expect(p.policyId).toBe(LEGACY_DAILY8_V1.id);
    expect(p.regularMinutes).toBe(480);
    expect(p.overtimeDailyMinutes).toBe(120);
  });

  test("computeSessionMinutes: SALIDA abierta cuenta hasta la primera salida", () => {
    const s = makeSession({ domainStatus: "SALIDA", bookkeeping: { firstExitAtMs: MONDAY_8AM + 6 * HOUR, firstExitReliable: true } });
    expect(computeSessionMinutes(s, COMPANY, MONDAY_8AM + 9 * HOUR)?.workMinutes).toBe(360);
  });

  test("linesForSession filtra la semana por sesión", () => {
    const week = [makeClosedSession(MONDAY_8AM, 9, { id: 1 }), makeClosedSession(MONDAY_8AM + DAY, 8, { id: 2 })];
    const lines = PayrollEngineService.linesForSession(1, week, {
      rates: RATES, company: COMPANY, policyId: CA_POLICY_ID, nowMs: MONDAY_8AM + 7 * DAY,
      periodStart: getWeekStart(MONDAY_8AM), periodEnd: getWeekEnd(MONDAY_8AM),
    });
    expect(lines.every((l) => l.sessionId === 1)).toBe(true);
    expect(lines.map((l) => l.kind)).toEqual(["REGULAR", "OVERTIME_DAILY"]);
  });
});
