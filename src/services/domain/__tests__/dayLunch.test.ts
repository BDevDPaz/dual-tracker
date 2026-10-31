/**
 * Almuerzo a nivel día (blueprint corto): un descuento por dayKey de nómina.
 */
import type { SessionRecord } from "../../../core/contracts";
import { getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { PersistenceService } from "../../persistence/PersistenceService";
import { PayrollEngineService, computeSessionMinutes } from "../PayrollEngineService";
import { SessionEngineService } from "../SessionEngineService";
import { lunchOnDay, lunchPromptForClose, lunchUsedOnDay, payrollDayKey, qualifyingLunch } from "../dayLunch";
import { CA_DAILY8_WEEKLY40_V2 } from "../payrollPolicies";
import { transition } from "../sessionMachine";
import { CA_POLICY_ID, COMPANY, HOUR, MIN, MONDAY_8AM, RATES, makeClosedSession, makeCtx, makeSession } from "../../../../test/fixtures/session.fixture";
import { makeExit } from "../../../../test/fixtures/spatial.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../test/helpers";
import { time } from "../../../../test/time";

const DAY = 24 * HOUR;
const V2 = CA_DAILY8_WEEKLY40_V2.id;

function statement(sessions: SessionRecord[], policyId = CA_POLICY_ID) {
  return PayrollEngineService.buildStatement({
    periodStart: getWeekStart(MONDAY_8AM),
    periodEnd: getWeekEnd(MONDAY_8AM),
    sessions,
    rates: RATES,
    company: { ...COMPANY, overtimePolicyId: policyId },
    policyId,
    nowMs: MONDAY_8AM + 7 * DAY,
  });
}

function timed(start: number, at: number, minutes: number, id: number): SessionRecord {
  return makeClosedSession(start, 8, {
    id,
    lunch: { taken: true, startAtMs: at, endAtMs: at + minutes * MIN, deductedMinutes: null },
  });
}

function okNext(open: SessionRecord | null, intent: Parameters<typeof transition>[1], ctx = makeCtx(), target: SessionRecord | null = null) {
  const r = transition(open, intent, ctx, target);
  if (!r.ok) throw new Error(`${intent.type} ${r.code} ${r.detail ?? ""}`);
  return r.next;
}

describe("almuerzo por dayKey", () => {
  test("dos jornadas el mismo día descuentan el almuerzo una sola vez", () => {
    const first = timed(MONDAY_8AM, MONDAY_8AM + 2 * HOUR, 30, 1);
    const second = timed(MONDAY_8AM + 5 * HOUR, MONDAY_8AM + 6 * HOUR, 45, 2);
    const kept = { ...second.lunch };
    const st = statement([first, second]);
    expect(st.lunchMinutes).toBe(30);
    expect(st.lines.filter((l) => l.kind === "LUNCH_DEDUCTION").map((l) => l.sessionId)).toEqual([1]);
    expect(second.lunch).toEqual(kept);
    const dayKey = payrollDayKey(first, COMPANY, MONDAY_8AM + 9 * HOUR, CA_POLICY_ID);
    expect(payrollDayKey(second, COMPANY, MONDAY_8AM + 9 * HOUR, CA_POLICY_ID)).toBe(dayKey);
    expect(lunchUsedOnDay([first, second], dayKey, COMPANY, MONDAY_8AM + 9 * HOUR, CA_POLICY_ID)).toBe(true);
    expect(lunchOnDay([first, second], dayKey, COMPANY, MONDAY_8AM + 9 * HOUR, CA_POLICY_ID)?.minutes).toBe(30);
  });

  test("v2 usa el mismo dayKey de segmento: un día, un almuerzo", () => {
    const first = timed(MONDAY_8AM, MONDAY_8AM + 2 * HOUR, 30, 1);
    const second = timed(MONDAY_8AM + 5 * HOUR, MONDAY_8AM + 6 * HOUR, 60, 2);
    expect(statement([first, second], V2).lunchMinutes).toBe(30);
  });

  test("jornadas en días distintos conservan cada una su almuerzo", () => {
    const monday = timed(MONDAY_8AM, MONDAY_8AM + 2 * HOUR, 30, 1);
    const tuesday = timed(MONDAY_8AM + DAY, MONDAY_8AM + DAY + 2 * HOUR, 45, 2);
    expect(payrollDayKey(monday, COMPANY, MONDAY_8AM, CA_POLICY_ID)).not.toBe(payrollDayKey(tuesday, COMPANY, MONDAY_8AM, CA_POLICY_ID));
    expect(statement([monday, tuesday]).lunchMinutes).toBe(75);
  });

  test("pausa < 30 min no cuenta; la declaración del cierre sí", () => {
    const start = MONDAY_8AM;
    const short = makeClosedSession(start, 8, {
      id: 1,
      lunch: { taken: true, startAtMs: start + 3 * HOUR, endAtMs: start + 3 * HOUR + 20 * MIN, deductedMinutes: null },
    });
    expect(qualifyingLunch(short, start + 9 * HOUR)).toBeNull();
    expect(computeSessionMinutes(short, COMPANY, start + 9 * HOUR)?.lunchMinutes).toBe(0);
    expect(statement([short]).warnings.some((w) => w.startsWith("LUNCH_DURATION_UNKNOWN"))).toBe(false);

    const declared = makeClosedSession(start, 8, {
      id: 1,
      lunch: { taken: true, startAtMs: start + 3 * HOUR, endAtMs: start + 3 * HOUR + 20 * MIN, deductedMinutes: 45 },
    });
    expect(computeSessionMinutes(declared, COMPANY, start + 9 * HOUR)?.lunchMinutes).toBe(45);
    expect(qualifyingLunch(declared, start + 9 * HOUR)?.minutes).toBe(45);

    const exact = timed(start, start + 3 * HOUR, 30, 3);
    expect(computeSessionMinutes(exact, COMPANY, start + 9 * HOUR)?.lunchMinutes).toBe(30);
  });

  test("la segunda comida no se borra al quedarse con un solo almuerzo principal", () => {
    const first = timed(MONDAY_8AM, MONDAY_8AM + 2 * HOUR, 30, 1);
    const second = makeClosedSession(MONDAY_8AM + 5 * HOUR, 4, {
      id: 2,
      lunch: { taken: true, startAtMs: MONDAY_8AM + 6 * HOUR, endAtMs: MONDAY_8AM + 6 * HOUR + 30 * MIN, deductedMinutes: null },
      bookkeeping: {
        compliance: {
          secondMeal: {
            startAtMs: MONDAY_8AM + 7 * HOUR,
            endAtMs: MONDAY_8AM + 7 * HOUR + 30 * MIN,
            deductedMinutes: null,
          },
        },
      },
    });
    expect(statement([first, second]).lunchMinutes).toBe(60);
  });

  test("I2 si el día ya tiene almuerzo; I1 si no", () => {
    const lunch = qualifyingLunch(timed(MONDAY_8AM, MONDAY_8AM + 2 * HOUR, 40, 1), MONDAY_8AM + 8 * HOUR);
    expect(lunchPromptForClose(lunch ? { ...lunch, dayKey: "2026-09-21" } : null)).toBe("I2");
    expect(lunchPromptForClose(null)).toBe("I1");
  });

  test("pausa ≥ 30 min no se pisa con I1; pausa < 30 min sí acepta I1", () => {
    let s = okNext(makeSession(), { type: "LUNCH_START" }, makeCtx({ nowMs: MONDAY_8AM + 4 * HOUR }));
    s = okNext(s, { type: "RESUME" }, makeCtx({ nowMs: MONDAY_8AM + 4 * HOUR + 45 * MIN }));
    const kept = okNext(s, { type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 60 }, makeCtx({ nowMs: MONDAY_8AM + 8 * HOUR }));
    expect(kept.lunch.endAtMs! - kept.lunch.startAtMs!).toBe(45 * MIN);
    expect(kept.lunch.deductedMinutes).toBeNull();
    expect(computeSessionMinutes(kept, COMPANY, MONDAY_8AM + 8 * HOUR)?.lunchMinutes).toBe(45);

    let short = okNext(makeSession(), { type: "LUNCH_START" }, makeCtx({ nowMs: MONDAY_8AM + 4 * HOUR }));
    short = okNext(short, { type: "RESUME" }, makeCtx({ nowMs: MONDAY_8AM + 4 * HOUR + 20 * MIN }));
    expect(qualifyingLunch(short, MONDAY_8AM + 5 * HOUR)).toBeNull();
    const asked = okNext(short, { type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 30 }, makeCtx({ nowMs: MONDAY_8AM + 8 * HOUR }));
    expect(asked.lunch).toEqual({ taken: true, startAtMs: null, endAtMs: null, deductedMinutes: 30 });
    expect(computeSessionMinutes(asked, COMPANY, MONDAY_8AM + 8 * HOUR)?.lunchMinutes).toBe(30);
  });

  test("una pausa corta no bloquea otro almuerzo; una de 30 min sí pasa a pausa", () => {
    let short = okNext(makeSession(), { type: "LUNCH_START" }, makeCtx({ nowMs: MONDAY_8AM + 2 * HOUR }));
    short = okNext(short, { type: "RESUME" }, makeCtx({ nowMs: MONDAY_8AM + 2 * HOUR + 15 * MIN }));
    const again = okNext(short, { type: "LUNCH_START" }, makeCtx({ nowMs: MONDAY_8AM + 4 * HOUR }));
    expect(again.lunch.startAtMs).toBe(MONDAY_8AM + 4 * HOUR);
    expect(again.bookkeeping.lastPauseStartMs).toBeNull();

    let full = okNext(makeSession(), { type: "LUNCH_START" }, makeCtx({ nowMs: MONDAY_8AM + 2 * HOUR }));
    full = okNext(full, { type: "RESUME" }, makeCtx({ nowMs: MONDAY_8AM + 3 * HOUR }));
    const pause = okNext(full, { type: "LUNCH_START" }, makeCtx({ nowMs: MONDAY_8AM + 4 * HOUR }));
    expect(pause.bookkeeping.lastPauseStartMs).toBe(MONDAY_8AM + 4 * HOUR);
    expect(pause.lunch.endAtMs).toBe(MONDAY_8AM + 3 * HOUR);
  });

  test("si el día ya tiene almuerzo, la máquina no abre otro ni aplica I1", () => {
    const ctx = makeCtx({ nowMs: MONDAY_8AM + 4 * HOUR, dayLunchUsed: true });
    const rejected = transition(makeSession(), { type: "LUNCH_START" }, ctx);
    expect(rejected).toMatchObject({ ok: false, code: "ILLEGAL_TRANSITION", detail: "LUNCH_ALREADY_USED" });
    const rest = okNext(makeSession(), { type: "LUNCH_START", kind: "REST" }, ctx);
    expect(rest.domainStatus).toBe("PAUSADA");
    expect(rest.lunch.taken).toBe(false);
    const closed = okNext(
      makeSession(),
      { type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 45 },
      makeCtx({ nowMs: MONDAY_8AM + 8 * HOUR, dayLunchUsed: true }),
    );
    expect(closed.lunch).toMatchObject({ taken: false, deductedMinutes: null });
    expect(computeSessionMinutes(closed, COMPANY, MONDAY_8AM + 8 * HOUR)?.lunchMinutes).toBe(0);
  });

  test("autocierre sin I1 deja 0 min; una pausa ya terminada se conserva; sigue editable", () => {
    const openLunch = okNext(makeSession(), { type: "LUNCH_START" }, makeCtx({ nowMs: MONDAY_8AM + HOUR }));
    const wiped = okNext(
      openLunch,
      { type: "AUTO_CLOSE", cause: "MAX_OPEN_12H", confirmedOutside: true },
      makeCtx({ actor: "WATCHDOG", nowMs: MONDAY_8AM + 13 * HOUR }),
    );
    expect(wiped.lunch).toEqual({ taken: false, startAtMs: null, endAtMs: null, deductedMinutes: 0 });
    expect(computeSessionMinutes(wiped, COMPANY, MONDAY_8AM + 13 * HOUR)?.lunchMinutes).toBe(0);
    expect(wiped.domainStatus).toBe("CERRADA");

    let done = okNext(makeSession(), { type: "LUNCH_START" }, makeCtx({ nowMs: MONDAY_8AM + HOUR }));
    done = okNext(done, { type: "RESUME" }, makeCtx({ nowMs: MONDAY_8AM + HOUR + 40 * MIN }));
    const kept = okNext(
      done,
      { type: "AUTO_CLOSE", cause: "EXIT_DECISION_EXPIRED", confirmedOutside: false },
      makeCtx({ actor: "WATCHDOG", nowMs: MONDAY_8AM + 13 * HOUR }),
    );
    expect(computeSessionMinutes(kept, COMPANY, MONDAY_8AM + 13 * HOUR)?.lunchMinutes).toBe(40);

    const patched = okNext(
      null,
      { type: "MANUAL_PATCH", sessionId: wiped.id, declaredStartAtMs: wiped.declaredStartAtMs, endAtMs: wiped.endAtMs! - MIN, note: "revisar cierre" },
      makeCtx({ nowMs: MONDAY_8AM + 14 * HOUR }),
      wiped,
    );
    expect(patched.domainStatus).toBe("CERRADA");
    expect(patched.integrityClass).toBe("MANUAL");
  });
});

describe("almuerzo por dayKey — motor", () => {
  test("segunda jornada del mismo día no pregunta otro descuento; otro día sí", async () => {
    time.set(MONDAY_8AM);
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(2 * HOUR);
    await mustDispatch({ type: "LUNCH_START" });
    time.travel(20 * MIN);
    await mustDispatch({ type: "RESUME" });
    time.travel(HOUR);
    const first = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 45 });
    expect(first.lunch.deductedMinutes).toBe(45);
    expect(computeSessionMinutes(first, COMPANY, time.now())?.lunchMinutes).toBe(45);

    await startAndArrive(siteA);
    time.travel(2 * HOUR);
    const blocked = await SessionEngineService.dispatch({ type: "LUNCH_START" }, "UI");
    expect(blocked).toMatchObject({ ok: false, detail: "LUNCH_ALREADY_USED" });
    const second = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 30 });
    expect(second.lunch.taken).toBe(false);
    expect(computeSessionMinutes(second, COMPANY, time.now())?.lunchMinutes).toBe(0);

    const sameDay = await PersistenceService.listSessions();
    expect(statement(sameDay).lunchMinutes).toBe(45);

    time.set(MONDAY_8AM + DAY);
    await startAndArrive(siteA);
    time.travel(3 * HOUR);
    const nextDay = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 30 });
    expect(nextDay.lunch.deductedMinutes).toBe(30);
    expect(nextDay.bookkeeping.dateString).not.toBe(first.bookkeeping.dateString);
    const all = await PersistenceService.listSessions();
    expect(statement(all).lunchMinutes).toBe(75);
  });

  test("autocierre 12 h y failsafe de salida quedan en 0 min y se pueden editar", async () => {
    time.set(MONDAY_8AM);
    const { siteA } = await seedWorld();
    const started = await startAndArrive(siteA);
    time.travel(HOUR);
    await mustDispatch({ type: "LUNCH_START" });
    time.travel(50 * MIN);
    time.travel(13 * HOUR);
    const auto = await mustDispatch({ type: "AUTO_CLOSE", cause: "MAX_OPEN_12H", confirmedOutside: true }, "WATCHDOG");
    expect(computeSessionMinutes(auto, COMPANY, time.now())?.lunchMinutes).toBe(0);
    const patched = await mustDispatch({
      type: "MANUAL_PATCH",
      sessionId: auto.id,
      declaredStartAtMs: auto.declaredStartAtMs,
      endAtMs: auto.endAtMs! - MIN,
      note: "revisar cierre",
    });
    expect(patched.integrityClass).toBe("MANUAL");
    expect(patched.id).toBe(started.id);

    time.set(MONDAY_8AM + DAY);
    const later = await startAndArrive(siteA);
    time.travel(4 * HOUR);
    await mustDispatch({ type: "EXIT_DETECTED", fact: makeExit({ sessionId: later.id, siteId: siteA, timestampMs: time.now() }) }, "GEOFENCE");
    const expired = await mustDispatch({ type: "AUTO_CLOSE", cause: "EXIT_DECISION_EXPIRED", confirmedOutside: false }, "WATCHDOG");
    expect(computeSessionMinutes(expired, COMPANY, time.now())?.lunchMinutes).toBe(0);
    expect(expired.domainStatus).toBe("CERRADA");
    const edited = await mustDispatch({
      type: "MANUAL_PATCH",
      sessionId: expired.id,
      declaredStartAtMs: expired.declaredStartAtMs,
      endAtMs: expired.endAtMs! - MIN,
      note: "la cerró el failsafe",
    });
    expect(edited.domainStatus).toBe("CERRADA");
  });
});
