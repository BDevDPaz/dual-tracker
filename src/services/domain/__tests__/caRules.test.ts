/** P6 (spec v1.3 §5.6) — Doble tiempo > 12 h y séptimo día consecutivo, detrás de banderas legales. */
import type { CompanyPolicy, SessionRecord } from "../../../core/contracts";
import { getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { PayrollEngineService } from "../PayrollEngineService";
import { CA_DAILY8_WEEKLY40_V1, CA_DAILY8_WEEKLY40_V2 } from "../payrollPolicies";
import { COMPANY, HOUR, RATES, makeClosedSession } from "../../../../test/fixtures/session.fixture";

const V2 = CA_DAILY8_WEEKLY40_V2.id;
const OFF: CompanyPolicy = { ...COMPANY, overtimePolicyId: V2 };
const ON: CompanyPolicy = { ...OFF, payrollLegalFlags: { caDoubleTime: true, caSeventhDay: true } };

function st(sessions: SessionRecord[], company: CompanyPolicy, policyId = V2) {
  const ts = sessions[0].actualStartAtMs!;
  return PayrollEngineService.buildStatement({
    periodStart: getWeekStart(ts),
    periodEnd: getWeekEnd(ts),
    sessions,
    rates: RATES,
    company,
    policyId,
    nowMs: ts + 30 * 24 * HOUR,
  });
}
/** Lun 21-sep-2026 07:00 PDT. */
const MON_7 = Date.UTC(2026, 8, 21, 14);
const day = (i: number, hours: number, startHour = 0) => makeClosedSession(MON_7 + i * 24 * HOUR + startHour * HOUR, hours, { id: i + 1 });

describe("P6 — reglas CA opcionales [CONFIRMAR CON ASESORÍA LEGAL]", () => {
  test("por defecto NO se aplican: 13 h = 8 regular + 5 OT, sin appliedRules", () => {
    const s = st([day(0, 13)], OFF);
    expect(s.regularHours).toBe(8);
    expect(s.overtimeDailyHours).toBe(5);
    expect(s.overtimeDoubleHours).toBeUndefined();
    expect(s.appliedRules).toBeUndefined();
    expect(s.lines.some((l) => l.kind === "OVERTIME_DOUBLE")).toBe(false);
  });

  test("13 h en una jornada con caDoubleTime: 8 regular + 4 OT + 1 doble a 2×", () => {
    const s = st([day(0, 13)], ON);
    expect(s.regularHours).toBe(8);
    expect(s.overtimeDailyHours).toBe(4);
    expect(s.overtimeDoubleHours).toBe(1);
    expect(s.overtimeHours).toBe(5);
    const dbl = s.lines.find((l) => l.kind === "OVERTIME_DOUBLE")!;
    expect(dbl.rate).toBe(RATES.hourlyRate * 2);
    expect(dbl.amount).toBe(40);
    expect(s.appliedRules).toEqual(["CA_DOUBLE_TIME_12H", "CA_SEVENTH_DAY"]);
  });

  test("doble tiempo acumulado entre dos sesiones del mismo día", () => {
    const a = makeClosedSession(MON_7, 7, { id: 1 });
    const b = makeClosedSession(MON_7 + 8 * HOUR, 7, { id: 2 });
    const s = st([a, b], ON);
    expect(s.regularHours).toBe(8);
    expect(s.overtimeDailyHours).toBe(4);
    expect(s.overtimeDoubleHours).toBe(2);
  });

  test("séptima jornada consecutiva: primeras 8 h OT y el exceso doble; nada regular ese día", () => {
    const week = [0, 1, 2, 3, 4, 5].map((i) => day(i, 6));
    const seventh = day(6, 10);
    const s = st([...week, seventh], ON);
    const l7 = s.lines.filter((l) => l.sessionId === 7);
    expect(l7.find((l) => l.kind === "REGULAR")!.minutes).toBe(0);
    expect(l7.find((l) => l.kind === "OVERTIME_DAILY")!.minutes).toBe(8 * 60);
    expect(l7.find((l) => l.kind === "OVERTIME_DOUBLE")!.minutes).toBe(2 * 60);
    expect(s.regularHours).toBe(36);
    // Sin la bandera, el día 7 es regular (36 + 4 = 40) y el resto OT diaria.
    const off = st([...week, seventh], OFF);
    expect(off.regularHours).toBe(40);
    expect(off.overtimeDailyHours).toBe(2);
  });

  test("seis días no activan la regla del séptimo día", () => {
    const s = st([0, 1, 2, 3, 4, 5].map((i) => day(i, 6)), ON);
    expect(s.regularHours).toBe(36);
    expect(s.overtimeHours).toBe(0);
  });

  test("interacción con segmentos nocturnos: 18:00–08:00 (14 h) se reparte por jornada y no alcanza 12 h en ninguna", () => {
    const night = makeClosedSession(Date.UTC(2026, 8, 22, 1), 14, { id: 1 }); // lun 18:00 PDT → mar 08:00
    const s = st([night], ON);
    expect(s.overtimeDoubleHours).toBeUndefined();
    expect(s.regularHours).toBe(14);
    const v1 = st([night], { ...ON, overtimePolicyId: CA_DAILY8_WEEKLY40_V1.id }, CA_DAILY8_WEEKLY40_V1.id);
    // v1 no declara umbrales P6: 8 regular + 6 OT sin doble tiempo aunque la bandera esté activa.
    expect(v1.overtimeDailyHours).toBe(6);
    expect(v1.overtimeDoubleHours).toBeUndefined();
    expect(v1.appliedRules).toBeUndefined();
  });

  test("preview de sesión aplica el doble tiempo diario si la bandera está activa", () => {
    const p = PayrollEngineService.previewSession(day(0, 13), RATES, ON, MON_7 + 20 * HOUR, V2)!;
    expect(p.regularMinutes).toBe(8 * 60);
    expect(p.overtimeDailyMinutes).toBe(5 * 60);
    expect(p.grossEstimate).toBe(8 * 20 + 4 * 30 + 1 * 40);
  });
});
