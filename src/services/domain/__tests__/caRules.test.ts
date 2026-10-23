/** P6 y criterios R03, R04, R05, C07 — doble tiempo, séptimo día y una sola familia CA. */
import fs from "fs";
import path from "path";
import type { CompanyPolicy, SessionRecord } from "../../../core/contracts";
import { getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { PayrollEngineService } from "../PayrollEngineService";
import { CA_DAILY8_WEEKLY40_V1, CA_DAILY8_WEEKLY40_V2, PAYROLL_POLICIES } from "../payrollPolicies";
import { COMPANY, HOUR, RATES, makeClosedSession } from "../../../../test/fixtures/session.fixture";

const V2 = CA_DAILY8_WEEKLY40_V2.id;
const OFF: CompanyPolicy = { ...COMPANY, overtimePolicyId: V2, payrollLegalFlags: { caDoubleTime: false, caSeventhDay: false } };
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

describe("P6 — doble tiempo y séptimo día", () => {
  test("R03 13 h con la configuración por defecto: 8 regular, 4 a 1.5× y 1 a 2×", () => {
    const s = st([day(0, 13)], COMPANY, CA_DAILY8_WEEKLY40_V1.id);
    expect(s.regularHours).toBe(8);
    expect(s.overtimeDailyHours).toBe(4);
    expect(s.overtimeDoubleHours).toBe(1);
    const dbl = s.lines.find((l) => l.kind === "OVERTIME_DOUBLE")!;
    expect(dbl.minutes).toBe(60);
    expect(dbl.rate).toBe(RATES.hourlyRate * 2);
    expect(dbl.amount).toBe(40);
    expect(s.appliedRules).toContain("CA_DOUBLE_TIME_12H");
  });

  test("con las banderas apagadas, 13 h siguen en 8 regular + 5 OT y sin doble tiempo", () => {
    const s = st([day(0, 13)], OFF);
    expect(s.regularHours).toBe(8);
    expect(s.overtimeDailyHours).toBe(5);
    expect(s.overtimeDoubleHours).toBeUndefined();
    expect(s.lines.some((l) => l.kind === "OVERTIME_DOUBLE")).toBe(false);
    expect(s.appliedRules ?? []).not.toContain("CA_DOUBLE_TIME_12H");
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
    expect(s.appliedRules).toEqual(["CA_DOUBLE_TIME_12H", "CA_MEAL_PREMIUM"]);
  });

  test("doble tiempo acumulado entre dos sesiones del mismo día", () => {
    const a = makeClosedSession(MON_7, 7, { id: 1 });
    const b = makeClosedSession(MON_7 + 8 * HOUR, 7, { id: 2 });
    const s = st([a, b], ON);
    expect(s.regularHours).toBe(8);
    expect(s.overtimeDailyHours).toBe(4);
    expect(s.overtimeDoubleHours).toBe(2);
  });

  test("R04 séptima jornada consecutiva: primeras 8 h a 1.5× y el exceso a 2×; nada regular ese día", () => {
    const week = [0, 1, 2, 3, 4, 5].map((i) => day(i, 6));
    const seventh = day(6, 10);
    const s = st([...week, seventh], ON);
    const l7 = s.lines.filter((l) => l.sessionId === 7);
    expect(l7.find((l) => l.kind === "REGULAR")!.minutes).toBe(0);
    expect(l7.find((l) => l.kind === "OVERTIME_DAILY")!.minutes).toBe(8 * 60);
    expect(l7.find((l) => l.kind === "OVERTIME_DOUBLE")!.minutes).toBe(2 * 60);
    expect(s.appliedRules).toEqual(["CA_SEVENTH_DAY", "CA_MEAL_PREMIUM"]);
    expect(s.regularHours).toBe(36);
    // Sin la bandera, el día 7 es regular (36 + 4 = 40) y el resto OT diaria.
    const off = st([...week, seventh], OFF);
    expect(off.regularHours).toBe(40);
    expect(off.overtimeDailyHours).toBe(2);
  });

  test("R04 seis días no activan la regla del séptimo día", () => {
    const s = st([0, 1, 2, 3, 4, 5].map((i) => day(i, 6)), ON);
    expect(s.regularHours).toBe(36);
    expect(s.overtimeHours).toBe(0);
    expect(s.appliedRules ?? []).not.toContain("CA_SEVENTH_DAY");
  });

  test("C07/E20 18:00–08:00 (14 h) se parte por jornada y ninguna llega a 12 h", () => {
    const night = makeClosedSession(Date.UTC(2026, 8, 22, 1), 14, { id: 1 }); // lun 18:00 PDT → mar 08:00
    const s = st([night], ON);
    expect(s.overtimeDoubleHours).toBeUndefined();
    expect(s.regularHours).toBe(14);
    const v1 = st([night], { ...ON, overtimePolicyId: CA_DAILY8_WEEKLY40_V1.id }, CA_DAILY8_WEEKLY40_V1.id);
    // v1 atribuye las 14 h al día de inicio: 8 regular + 4 OT + 2 doble.
    expect(v1.regularHours).toBe(8);
    expect(v1.overtimeDailyHours).toBe(4);
    expect(v1.overtimeDoubleHours).toBe(2);
    expect(v1.appliedRules).toContain("CA_DOUBLE_TIME_12H");
  });

  test("preview de sesión aplica el doble tiempo diario si la bandera está activa", () => {
    const p = PayrollEngineService.previewSession(day(0, 13), RATES, ON, MON_7 + 20 * HOUR, V2)!;
    expect(p.regularMinutes).toBe(8 * 60);
    expect(p.overtimeDailyMinutes).toBe(5 * 60);
    expect(p.grossEstimate).toBe(8 * 20 + 4 * 30 + 1 * 40 + 20);
  });

  test("R05 el catálogo es solo la familia CA y el código de producción no revive la política heredada", () => {
    expect(Object.keys(PAYROLL_POLICIES).sort()).toEqual(["CA_DAILY8_WEEKLY40_v1", "CA_DAILY8_WEEKLY40_v2"]);
    const root = path.resolve(__dirname, "../../..");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.name === "__tests__" || ent.name === "node_modules") continue;
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(ent.name)) files.push(p);
      }
    };
    walk(root);
    const banned = [/LEGACY_DAILY8/, /policyMigration/, /migratePayrollPolicyToV2/];
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      for (const re of banned) expect(text).not.toMatch(re);
    }
  });
});
