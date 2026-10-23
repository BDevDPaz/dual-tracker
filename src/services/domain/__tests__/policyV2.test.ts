/** P2 (spec v1.3 §5.2) — Política v2: segmentación por jornada, política por periodo, edición nocturna, DST. */
import type { CalendarEntry, CompanyPolicy, SessionRecord } from "../../../core/contracts";
import { atTimeOfDayAfter, getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { PersistenceService } from "../../persistence/PersistenceService";
import { PayrollEngineService, policyForPeriod } from "../PayrollEngineService";
import { SessionEngineService } from "../SessionEngineService";
import { CA_DAILY8_WEEKLY40_V1, CA_DAILY8_WEEKLY40_V2 } from "../payrollPolicies";
import { COMPANY, HOUR, RATES, makeClosedSession, makeSegment } from "../../../../test/fixtures/session.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../test/helpers";
import { time } from "../../../../test/time";

const V1 = CA_DAILY8_WEEKLY40_V1.id;
const V2 = CA_DAILY8_WEEKLY40_V2.id;
const C2: CompanyPolicy = { ...COMPANY, overtimePolicyId: V2 };

function statement(sessions: SessionRecord[], periodTs: number, policyId = V2, company: CompanyPolicy = C2) {
  return PayrollEngineService.buildStatement({
    periodStart: getWeekStart(periodTs, company.calendarHistory),
    periodEnd: getWeekEnd(periodTs, company.calendarHistory),
    sessions,
    rates: RATES,
    company,
    policyId,
    nowMs: periodTs + 30 * 24 * HOUR,
  });
}
const byDay = (st: ReturnType<typeof statement>, kind = "REGULAR") =>
  st.lines.filter((l) => l.kind === kind).map((l) => [l.dateString, l.minutes / 60]);

/** Mar 22 sep 2026 22:00 PDT. */
const TUE_22 = Date.UTC(2026, 8, 23, 5);

describe("P2 — CA_DAILY8_WEEKLY40_v2", () => {
  test("tránsito que cruza la medianoche se parte en las dos jornadas", () => {
    const seg = makeSegment({ startAtMs: TUE_22 + HOUR, endAtMs: TUE_22 + 3 * HOUR });
    const st = statement([makeClosedSession(TUE_22, 8, { transitSegments: [seg] })], TUE_22);
    expect(st.lines.filter((l) => l.kind === "TRANSIT").map((l) => [l.dateString, l.minutes])).toEqual([
      ["2026-09-22", 60],
      ["2026-09-23", 60],
    ]);
    expect(byDay(st)).toEqual([
      ["2026-09-22", 1],
      ["2026-09-23", 5],
    ]);
  });

  test("22:00–06:00 → 2 h a J1 y 6 h a J2", () => {
    const st = statement([makeClosedSession(TUE_22, 8)], TUE_22);
    expect(byDay(st)).toEqual([
      ["2026-09-22", 2],
      ["2026-09-23", 6],
    ]);
    expect(st.regularHours).toBe(8);
    expect(st.policyId).toBe(V2);
  });

  test("20:00–07:00 → sin OT diaria con v2 frente a 3 h con v1", () => {
    const s = makeClosedSession(TUE_22 - 2 * HOUR, 11);
    const v2 = statement([s], TUE_22);
    const v1 = statement([s], TUE_22, V1, COMPANY);
    expect(v2.overtimeDailyHours).toBe(0);
    expect(byDay(v2)).toEqual([
      ["2026-09-22", 4],
      ["2026-09-23", 7],
    ]);
    expect(v1.overtimeDailyHours).toBe(3);
  });

  test("sesión que cruza el límite de semana: aparece en los dos statements con sus minutos", () => {
    const sun22 = Date.UTC(2026, 8, 28, 5); // dom 27-sep 22:00 PDT
    const s = makeClosedSession(sun22, 8, { id: 7 });
    const w1 = statement([s], sun22);
    const w2 = statement([s], sun22 + 3 * HOUR);
    expect(w1.sessionIds).toEqual([7]);
    expect(w2.sessionIds).toEqual([7]);
    expect(w1.regularHours).toBe(2);
    expect(w2.regularHours).toBe(6);
    // v1 atribuye todo a la semana de inicio.
    expect(statement([s], sun22 + 3 * HOUR, V1, COMPANY).sessionIds).toEqual([]);
  });

  test("OT semanal por segmento: la cubeta semanal es la de cada segmento", () => {
    // Lun–vie 8 h diurnas (40 h) + domingo noche 22:00–02:00 que cruza a la semana siguiente.
    const days = Array.from({ length: 5 }, (_, i) => makeClosedSession(Date.UTC(2026, 8, 21 + i, 15), 8, { id: i + 1 }));
    const night = makeClosedSession(Date.UTC(2026, 8, 28, 5), 4, { id: 9 });
    const st = statement([...days, night], Date.UTC(2026, 8, 22, 15));
    expect(st.regularHours).toBe(40);
    expect(st.overtimeWeeklyHours).toBe(2);
  });

  test("calendario con jornada a las 06:00: 04:00–12:00 → 2 h a la jornada anterior y 6 h a la del día", () => {
    const cal: CalendarEntry[] = [{ effectiveFromMs: 0, workdayStartMinutes: 360, workweekStartDay: 1 }];
    const company = { ...C2, calendarHistory: cal };
    const s = makeClosedSession(Date.UTC(2026, 8, 23, 11), 8); // mié 04:00 PDT
    expect(byDay(statement([s], Date.UTC(2026, 8, 23, 11), V2, company))).toEqual([
      ["2026-09-22", 2],
      ["2026-09-23", 6],
    ]);
  });

  test("DST: noche de otoño 22:00–06:00 = 9 h; de primavera = 7 h", () => {
    const fallStart = Date.UTC(2026, 10, 1, 5); // sáb 31-oct 22:00 PDT
    const fallEnd = atTimeOfDayAfter(fallStart, "06:00")!;
    expect((fallEnd - fallStart) / HOUR).toBe(9);
    const fall = makeClosedSession(fallStart, 0, { endAtMs: fallEnd });
    // Misma semana (sáb→dom): 2 h el sábado y 7 h reales el domingo (25 h de día civil).
    expect(byDay(statement([fall], fallStart))).toEqual([
      ["2026-10-31", 2],
      ["2026-11-01", 7],
    ]);

    const springStart = Date.UTC(2026, 2, 8, 6); // sáb 7-mar 22:00 PST
    const springEnd = atTimeOfDayAfter(springStart, "06:00")!;
    expect((springEnd - springStart) / HOUR).toBe(7);
    const spring = makeClosedSession(springStart, 0, { endAtMs: springEnd });
    expect(byDay(statement([spring], springStart))).toEqual([
      ["2026-03-07", 2],
      ["2026-03-08", 5],
    ]);
  });

  test("preview por sesión usa la política indicada (v2 segmenta)", () => {
    const s = makeClosedSession(TUE_22 - 2 * HOUR, 11, { policyId: V1 });
    expect(PayrollEngineService.previewSession(s, RATES, C2, 0, V2)!.overtimeDailyMinutes).toBe(0);
    expect(PayrollEngineService.previewSession(s, RATES, C2, 0)!.overtimeDailyMinutes).toBe(180);
  });

  test("policyForPeriod: pack más reciente del periodo o la vigente", () => {
    const packs = [
      { periodStart: 1, periodEnd: 2, policyId: V1, createdAtMs: 10 },
      { periodStart: 1, periodEnd: 2, policyId: V2, createdAtMs: 5 },
    ];
    expect(policyForPeriod(packs, 1, 2, V2)).toBe(V1);
    expect(policyForPeriod(packs, 3, 4, V2)).toBe(V2);
  });

  describe("edición: salida al día siguiente (N6)", () => {
    beforeEach(() => PersistenceService.init());

    test("atTimeOfDayAfter: salida ≤ entrada → día siguiente", () => {
      expect(atTimeOfDayAfter(TUE_22, "06:00")).toBe(TUE_22 + 8 * HOUR);
      expect(atTimeOfDayAfter(TUE_22, "23:00")).toBe(TUE_22 + HOUR);
      expect(atTimeOfDayAfter(TUE_22, "22:00")).toBe(TUE_22 + 24 * HOUR);
      expect(atTimeOfDayAfter(TUE_22, "25:00")).toBeNull();
    });

    test("MANUAL_PATCH acepta una jornada nocturna y rechaza > 24 h", async () => {
      time.set(Date.UTC(2026, 8, 21, 15));
      const { siteA } = await seedWorld();
      const s = await startAndArrive(siteA);
      time.travel(8 * HOUR);
      await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 0 });
      time.travel(3 * 24 * HOUR);
      const start = Date.UTC(2026, 8, 22, 5);
      const patched = await mustDispatch({ type: "MANUAL_PATCH", sessionId: s.id, declaredStartAtMs: start, endAtMs: atTimeOfDayAfter(start, "06:00"), note: "Turno de noche" });
      expect(patched.endAtMs! - patched.actualStartAtMs!).toBe(8 * HOUR);
      const r = await SessionEngineService.dispatch(
        { type: "MANUAL_PATCH", sessionId: s.id, declaredStartAtMs: start, endAtMs: start + 25 * HOUR, note: "x" },
        "UI",
      );
      expect(r).toMatchObject({ ok: false, code: "INVALID_TIMES", detail: "MAX_24H" });
    });
  });
});
