/**
 * Prueba de campo W2026-10-19-a2db0ad6: la sesión 3 se editó a
 * 00:25–23:58 del 20 oct 2026 y el expediente se selló a las 00:29.
 * El fin quedaba unas 23 h por delante y se pagó. No se vuelve a guardar.
 * La nómina y el hash de un sello válido no cambian.
 */
import type { CompanyPolicy } from "../../../core/contracts";
import { getWeekEnd, getWeekStart, atTimeOfDayAfter } from "../../../utils/dateUtils";
import { FeedbackService } from "../../application/FeedbackService";
import { routeIntent } from "../../application/intentRouter";
import { EvidencePackService, packHashBody } from "../../evidence/EvidencePackService";
import { TimeAuthorityService } from "../../evidence/TimeAuthorityService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { IntegrityLedgerService } from "../IntegrityLedgerService";
import { PayrollEngineService } from "../PayrollEngineService";
import { CA_DAILY8_WEEKLY40_V2 } from "../payrollPolicies";
import { SessionEngineService } from "../SessionEngineService";
import { transition } from "../sessionMachine";
import { FutureTimestampError, FUTURE_TIME_TOLERANCE_MS } from "../sessionTimeGuard";
import { COMPANY, HOUR, MIN, MONDAY_8AM, makeClosedSession, makeCtx, makeSession } from "../../../../test/fixtures/session.fixture";
import { makeExit } from "../../../../test/fixtures/spatial.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../test/helpers";
import { time } from "../../../../test/time";

/** 20 oct 2026, 00:25 / 23:58 / 00:29:55.108 PT. */
const FIELD_START = 1792481100000;
const FIELD_END = 1792565880000;
const FIELD_SEAL = 1792481395108;

const ON: CompanyPolicy = {
  ...COMPANY,
  overtimePolicyId: CA_DAILY8_WEEKLY40_V2.id,
  payrollLegalFlags: { caDoubleTime: true, caSeventhDay: true },
};

function paidMinutes(kind: string, lines: { kind: string; minutes: number }[]): number {
  return lines.filter((l) => l.kind === kind).reduce((acc, l) => acc + l.minutes, 0);
}

describe("hora futura", () => {
  beforeEach(() => PersistenceService.init());

  test("el caso de campo no se edita, no entra en el libro y la nómina de esos minutos sigue igual", async () => {
    expect(new Date(FIELD_START).toISOString()).toBe("2026-10-20T07:25:00.000Z");
    expect(new Date(FIELD_END).toISOString()).toBe("2026-10-21T06:58:00.000Z");
    expect(new Date(FIELD_SEAL).toISOString()).toBe("2026-10-20T07:29:55.108Z");
    expect((FIELD_END - FIELD_START) / MIN).toBe(1413);
    expect(FIELD_END - FIELD_SEAL).toBeGreaterThan(23 * HOUR);

    time.set(FIELD_START);
    const { siteA } = await seedWorld();
    const open = await startAndArrive(siteA, 0);
    time.set(FIELD_SEAL);
    const ledgerBefore = (await PersistenceService.listLedger()).length;
    const whileOpen = await SessionEngineService.dispatch(
      { type: "MANUAL_PATCH", sessionId: open.id, declaredStartAtMs: FIELD_START, endAtMs: FIELD_END, note: "ajuste de campo" },
      "UI",
    );
    expect(whileOpen).toMatchObject({ ok: false, code: "FUTURE_TIME" });
    expect((await PersistenceService.getSession(open.id))!.endAtMs).toBeNull();
    expect((await PersistenceService.listLedger()).length).toBe(ledgerBefore);

    const closed = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 0 });
    expect(closed.endAtMs).toBe(FIELD_SEAL);
    const afterClose = (await PersistenceService.listLedger()).length;
    const edited = await routeIntent({
      type: "PATCH_SESSION",
      sessionId: closed.id,
      declaredStartAtMs: FIELD_START,
      endAtMs: FIELD_END,
      note: "ajuste de campo",
    });
    expect(edited).toMatchObject({ ok: false, code: "FUTURE_TIME" });
    expect((await PersistenceService.listLedger()).length).toBe(afterClose);
    expect((await PersistenceService.getSession(closed.id))!.endAtMs).toBe(FIELD_SEAL);
    const toast = FeedbackService.pending().at(-1)!;
    expect(FeedbackService.render(toast, "es").message).toBe("Esa hora es posterior a ahora. No se puede anotar tiempo que todavía no ha pasado.");
    expect(FeedbackService.render(toast, "en").message).toBe("That time is later than now. Time that has not happened yet cannot be recorded.");

    const within = await mustDispatch({
      type: "MANUAL_PATCH",
      sessionId: closed.id,
      declaredStartAtMs: FIELD_START,
      endAtMs: FIELD_SEAL + 90_000,
      note: "dentro de la tolerancia",
    });
    expect(within.endAtMs).toBe(FIELD_SEAL + 90_000);
    const tooFar = await SessionEngineService.dispatch(
      { type: "MANUAL_PATCH", sessionId: closed.id, declaredStartAtMs: FIELD_START, endAtMs: FIELD_SEAL + 3 * MIN, note: "tres minutos" },
      "UI",
    );
    expect(tooFar).toMatchObject({ ok: false, code: "FUTURE_TIME" });

    const imagined = makeClosedSession(FIELD_START, 0, {
      id: 3,
      endAtMs: FIELD_END,
      lunch: { taken: true, startAtMs: null, endAtMs: null, deductedMinutes: 60 },
    });
    const statement = PayrollEngineService.buildStatement({
      periodStart: getWeekStart(FIELD_START),
      periodEnd: getWeekEnd(FIELD_START),
      sessions: [imagined],
      rates: { hourlyRate: 25, overtimeMultiplier: 1.5 },
      company: ON,
      policyId: CA_DAILY8_WEEKLY40_V2.id,
      nowMs: FIELD_END + HOUR,
    });
    expect(paidMinutes("REGULAR", statement.lines)).toBe(480);
    expect(paidMinutes("OVERTIME_DAILY", statement.lines)).toBe(240);
    expect(paidMinutes("OVERTIME_DOUBLE", statement.lines)).toBe(633);
    expect(paidMinutes("LUNCH_DEDUCTION", statement.lines)).toBe(60);
    expect(paidMinutes("REGULAR", statement.lines) + paidMinutes("OVERTIME_DAILY", statement.lines) + paidMinutes("OVERTIME_DOUBLE", statement.lines)).toBe(1353);
    expect(statement.grossEstimate).toBe(877.5);
    expect(statement.appliedRules).toEqual(["CA_DOUBLE_TIME_12H"]);
  });

  test("el repositorio no persiste un fin futuro y un fallo revierte el libro", async () => {
    time.set(FIELD_SEAL);
    const bad = makeClosedSession(FIELD_START, 0, { endAtMs: FIELD_END });
    await expect(PersistenceService.insertSession(bad)).rejects.toBeInstanceOf(FutureTimestampError);
    expect(await PersistenceService.listSessions({ includeDeleted: true })).toHaveLength(0);

    await expect(
      PersistenceService.transaction(async (db) => {
        await IntegrityLedgerService.append(
          { sessionId: null, actor: "SYSTEM", intent: "OS_KILL", fromState: null, toState: null, reason: "NO", timestampMs: FIELD_SEAL, integrityClass: null },
          db,
        );
        await PersistenceService.insertSession(bad, db);
      }),
    ).rejects.toBeInstanceOf(FutureTimestampError);
    expect(await PersistenceService.listLedger()).toHaveLength(0);
    expect(await PersistenceService.listSessions({ includeDeleted: true })).toHaveLength(0);
  });

  test("un fin ya guardado se puede corregir, no adelantar; el sello lo rechaza y un sello válido verifica", async () => {
    time.set(FIELD_END + MIN);
    const id = await PersistenceService.insertSession(
      makeClosedSession(FIELD_START, 0, { endAtMs: FIELD_END, lunch: { taken: true, startAtMs: null, endAtMs: null, deductedMinutes: 60 } }),
    );
    time.set(FIELD_SEAL);
    const stored = (await PersistenceService.getSession(id))!;
    await PersistenceService.updateSession({ ...stored, bookkeeping: { ...stored.bookkeeping, manualNote: "ya estaba" } });
    expect((await PersistenceService.getSession(id))!.bookkeeping.manualNote).toBe("ya estaba");
    expect((await PersistenceService.getSession(id))!.endAtMs).toBe(FIELD_END);
    await expect(PersistenceService.updateSession({ ...stored, endAtMs: FIELD_END + HOUR })).rejects.toBeInstanceOf(FutureTimestampError);
    expect((await PersistenceService.getSession(id))!.endAtMs).toBe(FIELD_END);

    const period = { periodStart: getWeekStart(FIELD_START), periodEnd: getWeekEnd(FIELD_START) };
    expect(period.periodStart).toBe(1792393200000);
    expect(period.periodEnd).toBe(1792997999999);
    const refused = await routeIntent({ type: "SEAL_PACK", ...period });
    expect(refused).toMatchObject({ ok: false, code: "SESSION_ENDS_AFTER_SEAL" });
    expect(await EvidencePackService.list()).toHaveLength(0);
    expect((await PersistenceService.listLedger()).some((e) => e.intent === "PAYROLL_SEALED")).toBe(false);
    const sealToast = FeedbackService.pending().at(-1)!;
    expect(FeedbackService.render(sealToast, "es").message).toContain("No se puede sellar");
    expect(FeedbackService.render(sealToast, "en").message).toContain("cannot be sealed");

    const corrected = (await PersistenceService.getSession(id))!;
    await PersistenceService.updateSession({ ...corrected, endAtMs: FIELD_SEAL });
    const sealed = await EvidencePackService.seal(period);
    expect(sealed.ok).toBe(true);
    if (!sealed.ok) return;
    expect(sealed.data.manifest.sealedAtMs).toBe(FIELD_SEAL);
    expect(await EvidencePackService.verify(sealed.data)).toMatchObject({ valid: true, failures: [] });
    expect(Object.keys(packHashBody(sealed.data.manifest))).toEqual([
      "packId",
      "periodStart",
      "periodEnd",
      "sealedAtMs",
      "policyId",
      "sessionIds",
      "statementHash",
      "evidenceHash",
      "certified",
      "manifestVersion",
      "contentHash",
      "sealWarnings",
    ]);
    expect(sealed.data.manifest.sealWarnings ?? []).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: "SESSION_ENDS_AFTER_SEAL" })]));

    const earlyId = await PersistenceService.insertSession(makeClosedSession(FIELD_SEAL - 2 * HOUR, 0, { endAtMs: FIELD_SEAL + 90_000 }));
    const again = await EvidencePackService.seal({ ...period, reissue: true });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.data.manifest.sessionIds).toEqual(expect.arrayContaining([id, earlyId]));
  });

  test("fin ≤ inicio se rechaza; la medianoche solo vale si el día siguiente ya pasó", async () => {
    time.set(Date.UTC(2026, 8, 21, 20));
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA, 0);
    time.travel(2 * HOUR);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 0 });
    const start = s.actualStartAtMs!;
    const same = await SessionEngineService.dispatch(
      { type: "MANUAL_PATCH", sessionId: s.id, declaredStartAtMs: start, endAtMs: start, note: "vacío" },
      "UI",
    );
    expect(same).toMatchObject({ ok: false, code: "INVALID_TIMES", detail: "END_NOT_AFTER_START" });

    const nightStart = Date.UTC(2026, 8, 22, 5);
    const nightEnd = atTimeOfDayAfter(nightStart, "06:00")!;
    expect(nightEnd - nightStart).toBe(8 * HOUR);
    time.set(nightEnd + HOUR);
    const night = await mustDispatch({
      type: "MANUAL_PATCH",
      sessionId: s.id,
      declaredStartAtMs: nightStart,
      endAtMs: nightEnd,
      note: "turno de noche",
    });
    expect(night.endAtMs).toBe(nightEnd);

    time.set(nightStart + HOUR);
    const ahead = await SessionEngineService.dispatch(
      { type: "MANUAL_PATCH", sessionId: s.id, declaredStartAtMs: nightStart, endAtMs: nightEnd, note: "aún no amanece" },
      "UI",
    );
    expect(ahead).toMatchObject({ ok: false, code: "FUTURE_TIME" });
    expect((await PersistenceService.getSession(s.id))!.endAtMs).toBe(nightEnd);
  });

  test("cierre, almuerzo y traslado no anotan un instante posterior al techo", async () => {
    const laterExit = MONDAY_8AM + 3 * HOUR;
    const salida = makeSession({ domainStatus: "SALIDA", bookkeeping: { firstExitAtMs: laterExit, firstExitReliable: true } });
    const early = makeCtx({ nowMs: MONDAY_8AM + HOUR });
    expect(transition(salida, { type: "CLOSE_DAY", mode: "EXIT_CONFIRMED" }, early).ok).toBe(false);
    expect(transition(salida, { type: "LUNCH_START" }, early)).toMatchObject({ ok: false, code: "FUTURE_TIME" });
    expect(transition(salida, { type: "TRANSFER_START", toSiteId: 2 }, early)).toMatchObject({ ok: false, code: "FUTURE_TIME" });

    const closeCtx = makeCtx({ nowMs: MONDAY_8AM + 8 * HOUR });
    const lunchFuture = transition(
      makeSession(),
      { type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 30, lunchStartAtMs: closeCtx.nowMs + FUTURE_TIME_TOLERANCE_MS + MIN },
      closeCtx,
    );
    expect(lunchFuture).toMatchObject({ ok: false, code: "FUTURE_TIME" });
    const outside = transition(
      makeSession(),
      { type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 30, lunchStartAtMs: MONDAY_8AM - 30 * MIN },
      makeCtx({ nowMs: MONDAY_8AM + 8 * HOUR }),
    );
    expect(outside).toMatchObject({ ok: false, code: "INVALID_TIMES", detail: "LUNCH_OUTSIDE_SESSION" });

    const paused = makeSession({
      domainStatus: "PAUSADA",
      lunch: { taken: true, startAtMs: MONDAY_8AM - 10 * MIN, endAtMs: null, deductedMinutes: null },
    });
    expect(transition(paused, { type: "RESUME" }, makeCtx({ nowMs: MONDAY_8AM + 30 * MIN }))).toMatchObject({
      ok: false,
      code: "INVALID_TIMES",
      detail: "LUNCH_OUTSIDE_SESSION",
    });

    time.set(MONDAY_8AM);
    const { siteA, siteB } = await seedWorld();
    const live = await startAndArrive(siteA, 0);
    const exit = await SessionEngineService.dispatch(
      { type: "EXIT_DETECTED", fact: makeExit({ sessionId: live.id, siteId: siteA, timestampMs: time.now() + 10 * MIN }) },
      "GEOFENCE",
    );
    expect(exit).toMatchObject({ ok: false, code: "FUTURE_TIME" });
    expect((await PersistenceService.getSession(live.id))!.domainStatus).toBe("ACTIVA");
    expect((await PersistenceService.getSession(live.id))!.bookkeeping.firstExitAtMs).toBeNull();

    time.travel(4 * HOUR);
    const badLunch = await SessionEngineService.dispatch(
      { type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 30, lunchStartAtMs: MONDAY_8AM - 30 * MIN },
      "UI",
    );
    expect(badLunch).toMatchObject({ ok: false, code: "INVALID_TIMES", detail: "LUNCH_OUTSIDE_SESSION" });
    const futureLunch = await SessionEngineService.dispatch(
      { type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 60, lunchStartAtMs: time.now() + 2 * HOUR },
      "UI",
    );
    expect(futureLunch).toMatchObject({ ok: false, code: "FUTURE_TIME" });
    expect((await PersistenceService.getSession(live.id))!.domainStatus).toBe("ACTIVA");

    const moved = await mustDispatch({ type: "TRANSFER_START", toSiteId: siteB });
    expect(moved.domainStatus).toBe("TRASLADO");
    expect(moved.transitSegments[0].startAtMs).toBeLessThanOrEqual(TimeAuthorityService.futureCeiling());
  });

  test("el huérfano rechaza fin ≤ inicio y un fin fuera de la tolerancia", () => {
    const open = makeSession({ bookkeeping: { integrityReason: "ORPHAN_SESSION" } });
    const now = MONDAY_8AM + 4 * HOUR;
    const ctx = makeCtx({ nowMs: now });
    expect(transition(open, { type: "CONFIRM_ORPHAN_END", endAtMs: MONDAY_8AM, note: "igual" }, ctx)).toMatchObject({
      ok: false,
      code: "INVALID_TIMES",
      detail: "END_NOT_AFTER_START",
    });
    expect(transition(open, { type: "CONFIRM_ORPHAN_END", endAtMs: now + 3 * MIN, note: "luego" }, ctx)).toMatchObject({
      ok: false,
      code: "FUTURE_TIME",
    });
    const barely = transition(open, { type: "CONFIRM_ORPHAN_END", endAtMs: now + MIN, note: "casi" }, ctx);
    expect(barely.ok).toBe(true);
    if (barely.ok) expect(barely.next.endAtMs).toBe(now + MIN);
  });
});
