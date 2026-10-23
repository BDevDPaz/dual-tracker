/** P4 (spec v1.3 §5.4) — RESOLVE_SPLIT: precondiciones, reparto, invariantes, ledger y re-vinculación. */
import type { SessionRecord } from "../../../core/contracts";
import { PersistenceService } from "../../persistence/PersistenceService";
import { IntegrityLedgerService } from "../IntegrityLedgerService";
import { PayrollEngineService } from "../PayrollEngineService";
import { SessionEngineService } from "../SessionEngineService";
import { CA_DAILY8_WEEKLY40_V1 } from "../payrollPolicies";
import { transition } from "../sessionMachine";
import { COMPANY, HOUR, MIN, MONDAY_8AM, RATES, makeClosedSession, makeCtx, makeSegment, makeSession } from "../../../../test/fixtures/session.fixture";
import { makeBreadcrumb } from "../../../../test/fixtures/spatial.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../test/helpers";
import { time } from "../../../../test/time";

const net = (s: SessionRecord) => {
  const lunch = s.lunch.startAtMs !== null && s.lunch.endAtMs !== null ? s.lunch.endAtMs - s.lunch.startAtMs : (s.lunch.deductedMinutes ?? 0) * MIN;
  return s.endAtMs! - (s.actualStartAtMs ?? s.declaredStartAtMs) - s.totalPausedMs - lunch;
};
const deductions = (s: SessionRecord) => s.endAtMs! - (s.actualStartAtMs ?? s.declaredStartAtMs) - net(s);

function split(s: SessionRecord, at: number, note = "Dos turnos", ctx = makeCtx({ nowMs: MONDAY_8AM + 20 * HOUR })) {
  const r = transition(null, { type: "RESOLVE_SPLIT", sessionId: s.id, splitAtMs: at, note }, ctx, s);
  return r;
}
function mustSplit(s: SessionRecord, at: number, ctx?: Parameters<typeof split>[3]) {
  const r = split(s, at, "Dos turnos", ctx);
  if (!r.ok) throw new Error(`${r.code} ${r.detail ?? ""}`);
  return { a: r.next, b: r.extra! };
}

describe("P4 — RESOLVE_SPLIT (máquina)", () => {
  const base = makeClosedSession(MONDAY_8AM, 10, {
    lunch: { taken: true, startAtMs: MONDAY_8AM + 2 * HOUR, endAtMs: MONDAY_8AM + 2.5 * HOUR, deductedMinutes: 30 },
    totalPausedMs: 15 * MIN,
    bookkeeping: {
      pauses: [{ startAtMs: MONDAY_8AM + 7 * HOUR, endAtMs: MONDAY_8AM + 7 * HOUR + 15 * MIN }],
      pausesSource: "LEDGER",
      firstExitAtMs: MONDAY_8AM + 9 * HOUR,
      firstExitReliable: true,
    },
  });

  test("conservación: A.end = B.start; neto y deducciones se conservan", () => {
    const at = MONDAY_8AM + 5 * HOUR;
    const { a, b } = mustSplit(base, at);
    expect(a.endAtMs).toBe(at);
    expect(b.actualStartAtMs).toBe(at);
    expect(b.declaredStartAtMs).toBe(at);
    expect(b.endAtMs).toBe(base.endAtMs);
    expect(net(a) + net(b)).toBe(net(base));
    expect(deductions(a) + deductions(b)).toBe(deductions(base));
    expect(b.siteId).toBe(base.siteId);
    expect(b.policyId).toBe(base.policyId);
    expect(b.bookkeeping.splitFromSessionId).toBe(base.id);
    expect(a.id).toBe(base.id);
  });

  test("almuerzo en A, pausa y first_exit en B; ambas MANUAL/SESSION_SPLIT", () => {
    const { a, b } = mustSplit(base, MONDAY_8AM + 5 * HOUR);
    expect(a.lunch.startAtMs).toBe(base.lunch.startAtMs);
    expect(b.lunch.taken).toBe(false);
    expect(a.bookkeeping.pauses).toEqual([]);
    expect(b.bookkeeping.pauses).toHaveLength(1);
    expect(a.totalPausedMs).toBe(0);
    expect(b.totalPausedMs).toBe(15 * MIN);
    expect(a.bookkeeping.firstExitAtMs).toBeNull();
    expect(b.bookkeeping.firstExitAtMs).toBe(MONDAY_8AM + 9 * HOUR);
    for (const h of [a, b]) {
      expect(h.integrityClass).toBe("MANUAL");
      expect(h.bookkeeping.integrityReason).toBe("SESSION_SPLIT");
      expect(h.bookkeeping.manualNote).toBe("Dos turnos");
    }
    expect(a.bookkeeping.original?.endAtMs).toBe(base.endAtMs);
  });

  test("almuerzo en B cuando empieza después del corte", () => {
    const { a, b } = mustSplit(base, MONDAY_8AM + 1 * HOUR);
    expect(a.lunch.taken).toBe(false);
    expect(b.lunch.startAtMs).toBe(base.lunch.startAtMs);
  });

  test("corte dentro del almuerzo o de una pausa → SPLIT_INSIDE_BREAK", () => {
    expect(split(base, MONDAY_8AM + 2 * HOUR + 10 * MIN)).toMatchObject({ ok: false, code: "SPLIT_INSIDE_BREAK" });
    expect(split(base, MONDAY_8AM + 7 * HOUR + 5 * MIN)).toMatchObject({ ok: false, code: "SPLIT_INSIDE_BREAK" });
  });

  test("corte antes del traslado: A conserva el origen y B el sitio de llegada", () => {
    const s = makeClosedSession(MONDAY_8AM, 8, {
      siteId: 2,
      transitSegments: [makeSegment({ fromSiteId: 1, toSiteId: 2, startAtMs: MONDAY_8AM + 4 * HOUR, endAtMs: MONDAY_8AM + 5 * HOUR })],
    });
    const before = mustSplit(s, MONDAY_8AM + 2 * HOUR);
    expect(before.a.siteId).toBe(1);
    expect(before.b.siteId).toBe(2);
    const after = mustSplit(s, MONDAY_8AM + 6 * HOUR);
    expect(after.a.siteId).toBe(2);
    expect(after.b.siteId).toBe(2);
  });

  test("tránsito que cruza el corte se parte en dos", () => {
    const s = makeClosedSession(MONDAY_8AM, 8, { transitSegments: [makeSegment({ startAtMs: MONDAY_8AM + 3 * HOUR, endAtMs: MONDAY_8AM + 4 * HOUR })] });
    const at = MONDAY_8AM + 3.5 * HOUR;
    const { a, b } = mustSplit(s, at);
    expect(a.transitSegments).toEqual([expect.objectContaining({ startAtMs: MONDAY_8AM + 3 * HOUR, endAtMs: at })]);
    expect(b.transitSegments).toEqual([expect.objectContaining({ startAtMs: at, endAtMs: MONDAY_8AM + 4 * HOUR })]);
    expect(a.transitSegments[0].id).not.toBe(b.transitSegments[0].id);
  });

  test("bordes: start+1min y end−1min se aceptan; fuera, INVALID_TIMES", () => {
    const s = makeClosedSession(MONDAY_8AM, 8);
    expect(split(s, MONDAY_8AM + MIN).ok).toBe(true);
    expect(split(s, MONDAY_8AM + 8 * HOUR - MIN).ok).toBe(true);
    expect(split(s, MONDAY_8AM + MIN - 1)).toMatchObject({ ok: false, code: "INVALID_TIMES" });
    expect(split(s, MONDAY_8AM + 8 * HOUR - MIN + 1)).toMatchObject({ ok: false, code: "INVALID_TIMES" });
  });

  test("sin nota → NOTE_REQUIRED; sesión abierta/borrada/cancelada → rechazo", () => {
    const s = makeClosedSession(MONDAY_8AM, 8);
    expect(split(s, MONDAY_8AM + HOUR, "  ")).toMatchObject({ ok: false, code: "NOTE_REQUIRED" });
    expect(split(makeSession(), MONDAY_8AM + HOUR)).toMatchObject({ ok: false, code: "ILLEGAL_TRANSITION" });
    expect(split(makeClosedSession(MONDAY_8AM, 8, { bookkeeping: { isDeleted: true } }), MONDAY_8AM + HOUR)).toMatchObject({ ok: false, code: "SESSION_DELETED" });
    expect(split(makeClosedSession(MONDAY_8AM, 8, { bookkeeping: { cancelled: true } }), MONDAY_8AM + HOUR)).toMatchObject({ ok: false, code: "ILLEGAL_TRANSITION" });
  });

  test("PRORATED: total_paused_ms se reparte por duración con el resto en A", () => {
    const s = makeClosedSession(MONDAY_8AM, 3, { totalPausedMs: 10 * MIN + 1, bookkeeping: { pausesSource: "PRORATED" } });
    const { a, b } = mustSplit(s, MONDAY_8AM + HOUR);
    expect(a.totalPausedMs + b.totalPausedMs).toBe(s.totalPausedMs);
    expect(b.totalPausedMs).toBe(Math.floor(((10 * MIN + 1) * 2) / 3));
  });

  test("solape preexistente: la mitad que sigue solapando queda CONFLICT/OVERLAP y la otra MANUAL", () => {
    const s = makeClosedSession(MONDAY_8AM, 8, { integrityClass: "CONFLICT", bookkeeping: { integrityReason: "OVERLAP" } });
    const { a, b } = mustSplit(s, MONDAY_8AM + 4 * HOUR, makeCtx({ splitOverlap: { a: false, b: true } }));
    expect([a.integrityClass, a.bookkeeping.integrityReason]).toEqual(["MANUAL", "SESSION_SPLIT"]);
    expect([b.integrityClass, b.bookkeeping.integrityReason]).toEqual(["CONFLICT", "OVERLAP"]);
  });

  test("solape nuevo (ambas mitades seguirían solapando) → OVERLAP", () => {
    const s = makeClosedSession(MONDAY_8AM, 8);
    expect(split(s, MONDAY_8AM + 4 * HOUR, "x", makeCtx({ splitOverlap: { a: true, b: true } }))).toMatchObject({ ok: false, code: "OVERLAP" });
  });

  test("CA: ambas mitades del mismo día comparten la cubeta diaria", () => {
    const s = makeClosedSession(MONDAY_8AM, 10, { policyId: CA_DAILY8_WEEKLY40_V1.id });
    const { a, b } = mustSplit(s, MONDAY_8AM + 5 * HOUR);
    const st = (xs: SessionRecord[]) =>
      PayrollEngineService.buildStatement({
        periodStart: MONDAY_8AM - 24 * HOUR,
        periodEnd: MONDAY_8AM + 6 * 24 * HOUR,
        sessions: xs,
        rates: RATES,
        company: COMPANY,
        policyId: CA_DAILY8_WEEKLY40_V1.id,
        nowMs: MONDAY_8AM + 30 * 24 * HOUR,
      });
    const whole = st([s]);
    const halves = st([a, { ...b, id: 2 }]);
    expect(halves.regularHours).toBe(whole.regularHours);
    expect(halves.overtimeDailyHours).toBe(whole.overtimeDailyHours);
    expect(halves.overtimeDailyHours).toBe(2);
  });
});

describe("P4 — RESOLVE_SPLIT (motor + SQLite)", () => {
  beforeEach(() => PersistenceService.init());

  async function closedWithFacts() {
    time.set(MONDAY_8AM);
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA, 0);
    for (let h = 1; h <= 7; h += 2) {
      await PersistenceService.insertSpatialFact({ ...makeBreadcrumb({ sessionId: s.id, timestampMs: MONDAY_8AM + h * HOUR, lat: 34 + h / 1000 }), siteId: siteA } as never);
    }
    time.travel(8 * HOUR);
    const closed = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 0 });
    return closed;
  }

  test("2 asientos, re-vinculación y descifrado de hechos, nota fuera del ledger, ninguna otra sesión cambia", async () => {
    const s = await closedWithFacts();
    const others = await PersistenceService.listSessions();
    const ledgerBefore = (await PersistenceService.listLedger()).length;
    const factsBefore = await PersistenceService.listSpatialFacts(s.id);
    const at = MONDAY_8AM + 4 * HOUR;
    const r = await SessionEngineService.dispatch({ type: "RESOLVE_SPLIT", sessionId: s.id, splitAtMs: at, note: "Nota secreta" }, "UI");
    if (!r.ok) throw new Error(`${r.code} ${r.detail}`);
    const all = await PersistenceService.listSessions();
    expect(all).toHaveLength(others.length + 1);
    const a = all.find((x) => x.id === s.id)!;
    const b = all.find((x) => x.bookkeeping.splitFromSessionId === s.id)!;
    expect(a.endAtMs).toBe(at);
    expect(b.actualStartAtMs).toBe(at);
    expect(b.endAtMs).toBe(s.endAtMs);

    const ledger = await PersistenceService.listLedger();
    expect(ledger.length - ledgerBefore).toBe(2);
    const [ea, eb] = ledger.slice(-2);
    const da = JSON.parse(ea.payloadJson);
    expect(da.intent ?? ea.intent).toBe("RESOLVE_SPLIT");
    expect(da.reason).toBe("SESSION_SPLIT");
    expect(da.data).toMatchObject({ sessionId: s.id, newSessionId: b.id, splitAtMs: at });
    expect(ea.payloadJson).not.toContain("Nota secreta");
    const db = JSON.parse(eb.payloadJson);
    expect(db.reason).toBe("SESSION_SPLIT_CREATED");
    expect(db.fromState).toBeNull();
    expect(db.toState).toBe("CERRADA");
    expect(db.data).toEqual({ sessionId: b.id, splitFrom: s.id, startMs: at, endMs: s.endAtMs, ledgerPayloadVersion: 2 });

    const fa = await PersistenceService.listSpatialFacts(a.id);
    const fb = await PersistenceService.listSpatialFacts(b.id);
    expect(fa.length + fb.length).toBe(factsBefore.length);
    expect(fb.every((f) => f.timestampMs >= at)).toBe(true);
    expect(fa.every((f) => f.timestampMs < at)).toBe(true);
    expect(da.data.movedFacts).toBe(fb.length);
    expect(fb.length).toBeGreaterThan(0);
    expect(fb.map((f) => f.lat)).toEqual(factsBefore.filter((f) => f.timestampMs >= at).map((f) => f.lat));

    expect((await IntegrityLedgerService.verify()).valid).toBe(true);
  });

  test("concurrencia: dos RESOLVE_SPLIT simultáneos → uno entra y el otro choca con el mutex", async () => {
    const s = await closedWithFacts();
    const [x, y] = await Promise.all([
      SessionEngineService.dispatch({ type: "RESOLVE_SPLIT", sessionId: s.id, splitAtMs: MONDAY_8AM + 4 * HOUR, note: "a" }, "UI"),
      SessionEngineService.dispatch({ type: "RESOLVE_SPLIT", sessionId: s.id, splitAtMs: MONDAY_8AM + 3 * HOUR, note: "b" }, "NOTIFICATION"),
    ]);
    expect([x.ok, y.ok].filter(Boolean)).toHaveLength(1);
    expect(y.ok ? x : y).toMatchObject({ ok: false, code: "MUTEX_BUSY" });
    expect((await PersistenceService.listSessions()).filter((q) => q.bookkeeping.splitFromSessionId === s.id)).toHaveLength(1);
  });
});
