/** P1 (spec v1.3 §5.1) — Calendario laboral configurable: prospectivo, transición, ledger, anulación. */
import type { CalendarEntry } from "../../../../core/contracts";
import { Store, StoreActions } from "../../../../core/store";
import { companyCalendar } from "../../../../utils/companyPolicy";
import {
  DEFAULT_CALENDAR_HISTORY,
  getWeekEnd,
  getWeekStart,
  payrollExportPeriodAt,
  periodIdAt,
  workweekEndAt,
  workweekStartAt,
} from "../../../../utils/dateUtils";
import { PayrollEngineService } from "../../../domain/PayrollEngineService";
import { EvidencePackService } from "../../../evidence/EvidencePackService";
import { PersistenceService } from "../../../persistence/PersistenceService";
import { SettingsService } from "../../../persistence/SettingsService";
import { SecurityService } from "../../../runtime/SecurityService";
import { routeIntent } from "../../intentRouter";
import { cancelCalendarChange, requestCalendarChange } from "../calendarChange";
import { COMPANY, HOUR, RATES, makeClosedSession } from "../../../../../test/fixtures/session.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../../test/helpers";
import { time } from "../../../../../test/time";

/** Miércoles 23 sep 2026 10:00 PDT. */
const WED = Date.UTC(2026, 8, 23, 17);
/** Lunes 28 sep 2026 00:00 PDT = fin de la semana que contiene WED. */
const E = Date.UTC(2026, 8, 28, 7);

async function settings() {
  await seedWorld();
  return SettingsService.load();
}
const calendarLedger = async () => (await PersistenceService.listLedger()).filter((e) => e.intent.startsWith("CALENDAR_"));

describe("P1 — calendario laboral", () => {
  beforeEach(() => PersistenceService.init());

  test("valores por defecto = resultados actuales", () => {
    for (const ts of [WED, E - 1, E, Date.UTC(2026, 10, 1, 20), Date.UTC(2026, 2, 8, 12)]) {
      expect(workweekStartAt(ts, DEFAULT_CALENDAR_HISTORY)).toBe(getWeekStart(ts));
      expect(workweekEndAt(ts, companyCalendar(COMPANY))).toBe(getWeekEnd(ts));
      expect(periodIdAt(ts)).toMatch(/^W/);
    }
  });

  test("cambio a las 06:00 un miércoles → efectivo al final de esa semana; semana en curso sin cambios; asiento con E", async () => {
    time.set(WED);
    const s = await settings();
    const before = getWeekStart(WED);
    const r = await requestCalendarChange(s, { workdayStartMinutes: 360, workweekStartDay: 1 });
    if (!r.ok) throw new Error(String(r.code));
    const history = companyCalendar(r.data!.settings.company);
    expect(history).toEqual([
      { effectiveFromMs: 0, workdayStartMinutes: 0, workweekStartDay: 1 },
      { effectiveFromMs: E, workdayStartMinutes: 360, workweekStartDay: 1 },
    ]);
    expect(workweekStartAt(WED, history)).toBe(before);
    expect(workweekEndAt(WED, history)).toBe(E - 1);
    // Persistido y en el Store.
    expect(companyCalendar((await SettingsService.load()).company)).toEqual(history);
    expect(companyCalendar(Store.getState().settings.company)).toEqual(history);
    const [entry] = await calendarLedger();
    expect(entry).toMatchObject({ intent: "CALENDAR_CHANGED", sessionId: null });
    expect(JSON.parse(entry.payloadJson).data).toEqual({
      from: { workdayStartMinutes: 0, workweekStartDay: 1 },
      to: { workdayStartMinutes: 360, workweekStartDay: 1 },
      requestedAtMs: WED,
      effectiveFromMs: E,
      // E (lun 00:00) no es inicio de semana del calendario nuevo (lun 06:00): transición de 6 h.
      transition: { startMs: E, endMs: Date.UTC(2026, 8, 28, 13) },
    });
  });

  test("lunes → domingo: periodo de transición de 6 días con id T…", async () => {
    time.set(WED);
    const r = await requestCalendarChange(await settings(), { workdayStartMinutes: 0, workweekStartDay: 0 });
    if (!r.ok) throw new Error(String(r.code));
    const history = companyCalendar(r.data!.settings.company);
    expect(r.data!.change!.transition).toEqual({ startMs: E, endMs: Date.UTC(2026, 9, 4, 7) });
    expect(periodIdAt(E + HOUR, history)).toBe("T2026-09-28");
    expect((workweekEndAt(E, history) + 1 - E) / (24 * HOUR)).toBe(6);
    expect(periodIdAt(Date.UTC(2026, 9, 5, 7), history)).toBe("W2026-10-04");
  });

  test("rechazo si existe un pack con periodEnd > E", async () => {
    // Sellar la semana del 28-sep y volver atrás en el tiempo para pedir el cambio.
    time.set(Date.UTC(2026, 8, 29, 15));
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(8 * HOUR);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 30 });
    const sealed = await EvidencePackService.seal({ periodStart: getWeekStart(time.now()), periodEnd: getWeekEnd(time.now()) });
    expect(sealed.ok).toBe(true);
    time.set(WED);
    const r = await requestCalendarChange(await SettingsService.load(), { workdayStartMinutes: 360, workweekStartDay: 1 });
    expect(r).toMatchObject({ ok: false, code: "CALENDAR_CHANGE_CONFLICTS_SEALED" });
    expect(await calendarLedger()).toHaveLength(0);
  });

  test("un pack de la semana en curso (periodEnd = E − 1) no bloquea", async () => {
    time.set(Date.UTC(2026, 8, 21, 15));
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(8 * HOUR);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 30 });
    expect((await EvidencePackService.seal({ periodStart: getWeekStart(time.now()), periodEnd: getWeekEnd(time.now()) })).ok).toBe(true);
    time.set(WED);
    expect((await requestCalendarChange(await SettingsService.load(), { workdayStartMinutes: 360, workweekStartDay: 1 })).ok).toBe(true);
  });

  test("anulación antes de E; anular después de E se rechaza; un segundo cambio pendiente se rechaza", async () => {
    time.set(WED);
    const r = await requestCalendarChange(await settings(), { workdayStartMinutes: 360, workweekStartDay: 1 });
    if (!r.ok) throw new Error(String(r.code));
    const s1 = r.data!.settings;
    expect(await requestCalendarChange(s1, { workdayStartMinutes: 120, workweekStartDay: 1 })).toMatchObject({ ok: false, code: "CALENDAR_CHANGE_PENDING" });
    const c = await cancelCalendarChange(s1);
    if (!c.ok) throw new Error(String(c.code));
    expect(companyCalendar(c.data!.settings.company)).toEqual(DEFAULT_CALENDAR_HISTORY);
    const entries = await calendarLedger();
    expect(entries.map((e) => e.intent)).toEqual(["CALENDAR_CHANGED", "CALENDAR_CHANGE_CANCELLED"]);
    expect(JSON.parse(entries[1].payloadJson).data.cancelled).toMatchObject({ effectiveFromMs: E, workdayStartMinutes: 360 });
    expect(await cancelCalendarChange(c.data!.settings)).toMatchObject({ ok: false, code: "NO_PENDING_CALENDAR_CHANGE" });

    const again = await requestCalendarChange(c.data!.settings, { workdayStartMinutes: 360, workweekStartDay: 1 });
    if (!again.ok) throw new Error(String(again.code));
    time.set(E + HOUR);
    expect(await cancelCalendarChange(again.data!.settings)).toMatchObject({ ok: false, code: "CALENDAR_CHANGE_ALREADY_EFFECTIVE" });
  });

  test("vía SAVE_SETTINGS exige zona admin; CANCEL_CALENDAR_CHANGE también", async () => {
    time.set(WED);
    await settings();
    StoreActions.settingsReplaced(await SettingsService.load());
    expect(await routeIntent({ type: "SAVE_SETTINGS", patch: { calendar: { workdayStartMinutes: 360, workweekStartDay: 1 } } })).toMatchObject({
      ok: false,
      code: "ADMIN_LOCKED",
    });
    expect(await routeIntent({ type: "CANCEL_CALENDAR_CHANGE" })).toMatchObject({ ok: false, code: "ADMIN_LOCKED" });
    await SecurityService.setPin("481236");
    expect((await SecurityService.unlock("481236")).ok).toBe(true);
    const r = await routeIntent({ type: "SAVE_SETTINGS", patch: { calendar: { workdayStartMinutes: 360, workweekStartDay: 1 } } });
    expect(r.ok).toBe(true);
    expect(companyCalendar(Store.getState().settings.company)).toHaveLength(2);
    // El historial no se puede escribir directamente con un parche de empresa.
    expect(await routeIntent({ type: "SAVE_SETTINGS", patch: { company: { calendarHistory: [] } } })).toMatchObject({ ok: false, code: "INVALID_VALUE" });
    expect((await routeIntent({ type: "CANCEL_CALENDAR_CHANGE" })).ok).toBe(true);
  });

  describe("nómina del periodo de transición", () => {
    const history: CalendarEntry[] = [
      { effectiveFromMs: 0, workdayStartMinutes: 0, workweekStartDay: 1 },
      { effectiveFromMs: E, workdayStartMinutes: 0, workweekStartDay: 0 },
    ];
    // Transición lun 28-sep … sáb 3-oct: 6 jornadas de 8 h = 48 h.
    const sessions = Array.from({ length: 6 }, (_, i) =>
      makeClosedSession(Date.UTC(2026, 8, 28 + i, 15), 8, { id: i + 1, bookkeeping: { dateString: `2026-${i < 3 ? "09" : "10"}-${String(i < 3 ? 28 + i : i - 2).padStart(2, "0")}` } }),
    );
    const period = { periodStart: E, periodEnd: workweekEndAt(E, history) };

    test("umbral completo por defecto (40 h)", () => {
      const st = PayrollEngineService.buildStatement({ ...period, sessions, rates: RATES, company: { ...COMPANY, calendarHistory: history }, policyId: COMPANY.overtimePolicyId, nowMs: E + 30 * 24 * HOUR });
      expect(st.regularHours).toBe(40);
      expect(st.overtimeWeeklyHours).toBe(8);
    });

    test("PRORATED (bandera legal): 40 h × 6/7", () => {
      const st = PayrollEngineService.buildStatement({
        ...period,
        sessions,
        rates: RATES,
        company: { ...COMPANY, calendarHistory: history, payrollLegalFlags: { transitionWeeklyThreshold: "PRORATED" } },
        policyId: COMPANY.overtimePolicyId,
        nowMs: E + 30 * 24 * HOUR,
      });
      expect(st.regularHours * 60).toBe(Math.round((2400 * 6) / 7));
    });

    test("la semana siguiente tiene cubeta semanal propia", () => {
      const next = makeClosedSession(Date.UTC(2026, 9, 4, 15), 8, { id: 99 });
      const st = PayrollEngineService.buildStatement({
        periodStart: Date.UTC(2026, 9, 4, 7),
        periodEnd: workweekEndAt(Date.UTC(2026, 9, 4, 7), history),
        sessions: [...sessions, next],
        rates: RATES,
        company: { ...COMPANY, calendarHistory: history },
        policyId: COMPANY.overtimePolicyId,
        nowMs: E + 30 * 24 * HOUR,
      });
      expect(st.sessionIds).toEqual([99]);
      expect(st.regularHours).toBe(8);
    });
  });

  describe("ventana de payrollExport derivada del calendario", () => {
    test("por defecto: dom ≥ 20:00 → semana en curso; lun/mar → anterior; resto → nada", () => {
      const sun20 = Date.UTC(2026, 8, 28, 3); // dom 27-sep 20:00 PDT
      expect(payrollExportPeriodAt(sun20)).toEqual({ start: getWeekStart(sun20), end: getWeekEnd(sun20) });
      expect(payrollExportPeriodAt(sun20 - HOUR)).toBeNull();
      const tue = Date.UTC(2026, 8, 30, 6); // mar 29-sep 23:00 PDT
      expect(payrollExportPeriodAt(tue)).toEqual({ start: getWeekStart(sun20), end: getWeekEnd(sun20) });
      expect(payrollExportPeriodAt(Date.UTC(2026, 8, 30, 8))).toBeNull(); // mié 01:00
    });

    test("semana domingo 06:00: sábado 20:00 de la última jornada → semana en curso", () => {
      const h: CalendarEntry[] = [{ effectiveFromMs: 0, workdayStartMinutes: 360, workweekStartDay: 0 }];
      const sat20 = Date.UTC(2026, 9, 4, 3); // sáb 3-oct 20:00 PDT
      expect(payrollExportPeriodAt(sat20, h)).toEqual({ start: Date.UTC(2026, 8, 27, 13), end: Date.UTC(2026, 9, 4, 13) - 1 });
      // Domingo 05:00 sigue en la última jornada (antes de las 06:00).
      expect(payrollExportPeriodAt(Date.UTC(2026, 9, 4, 12), h)?.start).toBe(Date.UTC(2026, 8, 27, 13));
      // Lunes 12:00 (segunda jornada) → semana anterior; martes 07:00 (tercera jornada) → nada.
      expect(payrollExportPeriodAt(Date.UTC(2026, 9, 5, 19), h)?.start).toBe(Date.UTC(2026, 8, 27, 13));
      expect(payrollExportPeriodAt(Date.UTC(2026, 9, 6, 14), h)).toBeNull();
    });
  });
});
