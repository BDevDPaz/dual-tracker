/** T1 — sessionMachine: función pura, 7 estados. */
import type { SessionIntent, SessionRecord } from "../../../core/contracts";
import { escalate, hasTimeChanged, requiresAuditNote, transition } from "../sessionMachine";
import { HOUR, MIN, MONDAY_8AM, makeClosedSession, makeCtx, makeSegment, makeSession } from "../../../../test/fixtures/session.fixture";
import { makeExit, makeEnter } from "../../../../test/fixtures/spatial.fixture";

function okNext(open: SessionRecord | null, intent: SessionIntent, ctx = makeCtx(), target: SessionRecord | null = null) {
  const r = transition(open, intent, ctx, target);
  if (!r.ok) throw new Error(`esperaba ok, rechazo ${r.code}`);
  return r;
}
function code(open: SessionRecord | null, intent: SessionIntent, ctx = makeCtx(), target: SessionRecord | null = null) {
  const r = transition(open, intent, ctx, target);
  return r.ok ? "OK" : r.code;
}

describe("sessionMachine", () => {
  describe("START_DAY", () => {
    test("crea ESPERANDO sin actualStartAtMs", () => {
      const r = okNext(null, { type: "START_DAY", siteId: 1 });
      expect(r.isNew).toBe(true);
      expect(r.from).toBe("NO_INICIADA");
      expect(r.next.domainStatus).toBe("ESPERANDO");
      expect(r.next.actualStartAtMs).toBeNull();
      expect(r.next.integrityClass).toBe("VALID");
    });
    test("rechaza sin aviso aceptado, sin sitio, sitio inexistente o jornada abierta", () => {
      expect(code(null, { type: "START_DAY", siteId: 1 }, makeCtx({ disclosureAccepted: false }))).toBe("DISCLOSURE_NOT_ACCEPTED");
      expect(code(null, { type: "START_DAY", siteId: 0 })).toBe("SITE_REQUIRED");
      expect(code(null, { type: "START_DAY", siteId: 9 }, makeCtx({ siteExists: () => false }))).toBe("SITE_NOT_FOUND");
      expect(code(makeSession(), { type: "START_DAY", siteId: 1 })).toBe("SESSION_ALREADY_OPEN");
    });
    test("con entorno degradado nace CONFLICT, nunca VALID", () => {
      const r = okNext(null, { type: "START_DAY", siteId: 1 }, makeCtx({ degradedReason: "CLOCK_DRIFT" }));
      expect(r.next.integrityClass).toBe("CONFLICT");
      expect(r.next.bookkeeping.integrityReason).toBe("CLOCK_DRIFT");
    });
  });

  test("CLOSE_DAY desde NO_INICIADA se rechaza", () => {
    expect(code(null, { type: "CLOSE_DAY", mode: "MANUAL" })).toBe("NO_OPEN_SESSION");
  });

  test("CLOSE_DAY desde ESPERANDO es ilegal (usar CANCEL_DAY)", () => {
    const open = makeSession({ domainStatus: "ESPERANDO", actualStartAtMs: null });
    expect(code(open, { type: "CLOSE_DAY", mode: "MANUAL" })).toBe("ILLEGAL_TRANSITION");
    const r = okNext(open, { type: "CANCEL_DAY" });
    expect(r.next.domainStatus).toBe("CERRADA");
    expect(r.next.bookkeeping.cancelled).toBe(true);
  });

  describe("ARRIVAL_CONFIRMED", () => {
    test("ENTER fiable de geocerca → ACTIVA con actualStartAtMs = hora del hecho", () => {
      const open = makeSession({ domainStatus: "ESPERANDO", actualStartAtMs: null });
      const fact = makeEnter({ timestampMs: MONDAY_8AM + 7 * MIN });
      const r = okNext(open, { type: "ARRIVAL_CONFIRMED", fact }, makeCtx({ actor: "GEOFENCE" }));
      expect(r.next.domainStatus).toBe("ACTIVA");
      expect(r.next.actualStartAtMs).toBe(MONDAY_8AM + 7 * MIN);
      expect(r.reason).toBe("AUTO_CHECKIN_GEOFENCE_ENTRY");
    });
    test("ENTER no fiable no hace check-in automático", () => {
      const open = makeSession({ domainStatus: "ESPERANDO", actualStartAtMs: null });
      const fact = makeEnter({ reliable: false, reason: "ACCURACY_OVER_RADIUS" });
      expect(code(open, { type: "ARRIVAL_CONFIRMED", fact }, makeCtx({ actor: "GEOFENCE" }))).toBe("UNRELIABLE_FACT");
    });
    test("llegada desde TRASLADO cierra el tramo y cambia de sitio", () => {
      const open = makeSession({ domainStatus: "TRASLADO", transitSegments: [makeSegment({ endAtMs: null })] });
      const r = okNext(open, { type: "ARRIVAL_CONFIRMED" }, makeCtx({ nowMs: MONDAY_8AM + 20 * MIN }));
      expect(r.next.siteId).toBe(2);
      expect(r.next.transitSegments[0].endAtMs).toBe(MONDAY_8AM + 20 * MIN);
      expect(r.next.transitSegments[0]).toMatchObject({ paid: true, rateMultiplier: 1, countsTowardOvertime: true });
    });
    test("ilegal desde ACTIVA", () => {
      expect(code(makeSession(), { type: "ARRIVAL_CONFIRMED" })).toBe("ILLEGAL_TRANSITION");
    });
  });

  test("[obligatorio #1] ACTIVA + EXIT_DETECTED → SALIDA, no CERRADA", () => {
    const exitAt = MONDAY_8AM + 5 * HOUR;
    const r = okNext(makeSession(), { type: "EXIT_DETECTED", fact: makeExit({ timestampMs: exitAt }) }, makeCtx({ actor: "GEOFENCE" }));
    expect(r.next.domainStatus).toBe("SALIDA");
    expect(r.next.domainStatus).not.toBe("CERRADA");
    expect(r.next.endAtMs).toBeNull();
    expect(r.next.bookkeeping.firstExitAtMs).toBe(exitAt);
    expect(r.effects).toContainEqual({ type: "SCHEDULE_EXIT_DECISION", sessionId: 1, firstExitAtMs: exitAt });
  });

  test("EXIT conserva la PRIMERA salida", () => {
    const open = makeSession({ bookkeeping: { firstExitAtMs: MONDAY_8AM + HOUR, firstExitReliable: true } });
    const r = okNext(open, { type: "EXIT_DETECTED", fact: makeExit({ timestampMs: MONDAY_8AM + 2 * HOUR }) });
    expect(r.next.bookkeeping.firstExitAtMs).toBe(MONDAY_8AM + HOUR);
  });

  test("STAY_WORKING: SALIDA → ACTIVA limpiando firstExit; ilegal fuera de SALIDA", () => {
    const open = makeSession({ domainStatus: "SALIDA", bookkeeping: { firstExitAtMs: MONDAY_8AM + HOUR, firstExitReliable: true } });
    const r = okNext(open, { type: "STAY_WORKING" });
    expect(r.next.domainStatus).toBe("ACTIVA");
    expect(r.next.bookkeeping.firstExitAtMs).toBeNull();
    expect(r.effects).toContainEqual({ type: "CANCEL_EXIT_DECISION", sessionId: 1 });
    expect(code(makeSession(), { type: "STAY_WORKING" })).toBe("ILLEGAL_TRANSITION");
  });

  test("CLOSE_DAY desde SALIDA cierra en la primera salida", () => {
    const firstExit = MONDAY_8AM + 8 * HOUR;
    const open = makeSession({ domainStatus: "SALIDA", bookkeeping: { firstExitAtMs: firstExit, firstExitReliable: true } });
    const r = okNext(open, { type: "CLOSE_DAY", mode: "EXIT_CONFIRMED", lunchDeductedMinutes: 30 }, makeCtx({ nowMs: firstExit + HOUR }));
    expect(r.next.domainStatus).toBe("CERRADA");
    expect(r.next.endAtMs).toBe(firstExit);
    expect(r.next.lunch.deductedMinutes).toBe(30);
    expect(r.reason).toBe("EXIT_CONFIRMED_BY_USER");
  });

  test("CLOSE_DAY por actor no humano nunca queda VALID", () => {
    const r = okNext(makeSession(), { type: "CLOSE_DAY", mode: "MANUAL" }, makeCtx({ actor: "SYSTEM" }));
    expect(r.next.integrityClass).toBe("CONFLICT");
  });

  test("entorno degradado durante la jornada: ninguna transición la deja VALID (fix CLOCK_DRIFT)", () => {
    const ctx = makeCtx({ degradedReason: "CLOCK_DRIFT" });
    const closed = okNext(makeSession(), { type: "CLOSE_DAY", mode: "MANUAL" }, ctx).next;
    expect(closed.integrityClass).toBe("CONFLICT");
    expect(closed.bookkeeping.integrityReason).toBe("CLOCK_DRIFT");
    const arrived = okNext(makeSession({ domainStatus: "ESPERANDO" }), { type: "ARRIVAL_CONFIRMED" }, ctx).next;
    expect(arrived.integrityClass).toBe("CONFLICT");
    // Acciones sobre jornadas ya cerradas no se re-degradan (resolución posible).
    const conflict = makeClosedSession(MONDAY_8AM, 8, { integrityClass: "CONFLICT" });
    expect(okNext(null, { type: "RESOLVE_MANUAL", sessionId: 1, note: "ok" }, ctx, conflict).next.integrityClass).toBe("MANUAL");
  });

  test("almuerzo y pausas: primera pausa = almuerzo, siguientes = pausa", () => {
    let s = okNext(makeSession(), { type: "LUNCH_START" }, makeCtx({ nowMs: MONDAY_8AM + 4 * HOUR })).next;
    expect(s.domainStatus).toBe("PAUSADA");
    expect(s.lunch.startAtMs).toBe(MONDAY_8AM + 4 * HOUR);
    s = okNext(s, { type: "RESUME" }, makeCtx({ nowMs: MONDAY_8AM + 5 * HOUR })).next;
    expect(s.lunch.endAtMs).toBe(MONDAY_8AM + 5 * HOUR);
    s = okNext(s, { type: "LUNCH_START" }, makeCtx({ nowMs: MONDAY_8AM + 6 * HOUR })).next;
    expect(s.bookkeeping.lastPauseStartMs).toBe(MONDAY_8AM + 6 * HOUR);
    s = okNext(s, { type: "RESUME" }, makeCtx({ nowMs: MONDAY_8AM + 6 * HOUR + 10 * MIN })).next;
    expect(s.totalPausedMs).toBe(10 * MIN);
    expect(code(s, { type: "RESUME" })).toBe("ILLEGAL_TRANSITION");
  });

  describe("TRANSFER", () => {
    test("[obligatorio #6 — máquina] TRASLADO sin siteId destino se rechaza", () => {
      expect(code(makeSession(), { type: "TRANSFER_START", toSiteId: 0 })).toBe("SITE_REQUIRED");
      expect(code(makeSession(), { type: "TRANSFER_START", toSiteId: 1 })).toBe("SITE_REQUIRED"); // mismo sitio
    });
    test("desde SALIDA el tramo arranca en la primera salida; cancelar vuelve a ACTIVA", () => {
      const open = makeSession({ domainStatus: "SALIDA", bookkeeping: { firstExitAtMs: MONDAY_8AM + HOUR, firstExitReliable: true } });
      const t = okNext(open, { type: "TRANSFER_START", toSiteId: 2 }, makeCtx({ nowMs: MONDAY_8AM + 2 * HOUR })).next;
      expect(t.domainStatus).toBe("TRASLADO");
      expect(t.transitSegments[0].startAtMs).toBe(MONDAY_8AM + HOUR);
      const c = okNext(t, { type: "TRANSFER_CANCEL" }).next;
      expect(c.domainStatus).toBe("ACTIVA");
      expect(c.transitSegments[0].cancelled).toBe(true);
      expect(c.transitSegments[0].paid).toBe(false);
    });
  });

  test("LUNCH_START desde SALIDA empieza en la primera salida y cancela la decisión", () => {
    const open = makeSession({ domainStatus: "SALIDA", bookkeeping: { firstExitAtMs: MONDAY_8AM + 4 * HOUR, firstExitReliable: true } });
    const r = okNext(open, { type: "LUNCH_START" }, makeCtx({ nowMs: MONDAY_8AM + 4 * HOUR + 10 * MIN }));
    expect(r.next.domainStatus).toBe("PAUSADA");
    expect(r.next.lunch.startAtMs).toBe(MONDAY_8AM + 4 * HOUR);
    expect(r.next.bookkeeping.firstExitAtMs).toBeNull();
    expect(r.effects.some((e) => e.type === "CANCEL_EXIT_DECISION")).toBe(true);
    expect(code(makeSession({ domainStatus: "TRASLADO" }), { type: "LUNCH_START" })).toBe("ILLEGAL_TRANSITION");
  });

  test("MANUAL_PATCH recorta el tránsito que se sale del nuevo intervalo", () => {
    const closed = makeClosedSession(MONDAY_8AM, 8, {
      transitSegments: [makeSegment({ startAtMs: MONDAY_8AM + 6 * HOUR, endAtMs: MONDAY_8AM + 7 * HOUR })],
    });
    const end = MONDAY_8AM + 6 * HOUR + 30 * MIN;
    const r = okNext(null, { type: "MANUAL_PATCH", sessionId: 1, declaredStartAtMs: MONDAY_8AM, endAtMs: end, note: "corte" }, makeCtx(), closed);
    expect(r.next.transitSegments[0]).toMatchObject({ endAtMs: end, clipped: true });
    expect(r.ledgerExtra?.clippedTransits).toEqual([
      expect.objectContaining({ id: "tr-1", after: { startAtMs: MONDAY_8AM + 6 * HOUR, endAtMs: end } }),
    ]);
    const dropped = okNext(
      null,
      { type: "MANUAL_PATCH", sessionId: 1, declaredStartAtMs: MONDAY_8AM, endAtMs: MONDAY_8AM + 2 * HOUR, note: "antes del trayecto" },
      makeCtx(),
      closed,
    );
    expect(dropped.next.transitSegments).toEqual([]);
  });

  describe("AUTO_CLOSE", () => {
    test("12 h sin confirmación de salida → CONFLICT; con confirmación → AUTO; nunca VALID", () => {
      const open = makeSession();
      const now = MONDAY_8AM + 13 * HOUR;
      const a = okNext(open, { type: "AUTO_CLOSE", cause: "MAX_OPEN_12H", confirmedOutside: false }, makeCtx({ actor: "WATCHDOG", nowMs: now })).next;
      expect(a.integrityClass).toBe("CONFLICT");
      expect(a.endAtMs).toBe(MONDAY_8AM + 12 * HOUR);
      const b = okNext(open, { type: "AUTO_CLOSE", cause: "MAX_OPEN_12H", confirmedOutside: true }, makeCtx({ actor: "WATCHDOG", nowMs: now })).next;
      expect(b.integrityClass).toBe("AUTO");
    });
    test("el usuario no puede auto-cerrar; ESPERANDO huérfana se cancela como AUTO", () => {
      expect(code(makeSession(), { type: "AUTO_CLOSE", cause: "MAX_OPEN_12H", confirmedOutside: false })).toBe("ILLEGAL_TRANSITION");
      const w = okNext(makeSession({ domainStatus: "ESPERANDO" }), { type: "AUTO_CLOSE", cause: "MAX_OPEN_12H", confirmedOutside: false }, makeCtx({ actor: "WATCHDOG" })).next;
      expect(w.bookkeeping.cancelled).toBe(true);
      expect(w.integrityClass).toBe("AUTO");
    });
    test("EXIT_DECISION_EXPIRED: AUTO solo con salida fiable confirmada fuera", () => {
      const open = makeSession({ domainStatus: "SALIDA", bookkeeping: { firstExitAtMs: MONDAY_8AM + 8 * HOUR, firstExitReliable: true } });
      const ctx = makeCtx({ actor: "SYSTEM", nowMs: MONDAY_8AM + 9 * HOUR });
      expect(okNext(open, { type: "AUTO_CLOSE", cause: "EXIT_DECISION_EXPIRED", confirmedOutside: true }, ctx).next.integrityClass).toBe("AUTO");
      expect(okNext(open, { type: "AUTO_CLOSE", cause: "EXIT_DECISION_EXPIRED", confirmedOutside: false }, ctx).next.integrityClass).toBe("CONFLICT");
    });
  });

  describe("MANUAL_PATCH", () => {
    const closed = makeClosedSession(MONDAY_8AM, 8);
    test("exige nota, sesión cerrada y sin solape; conserva el original", () => {
      const intent = { type: "MANUAL_PATCH" as const, sessionId: 1, declaredStartAtMs: MONDAY_8AM - 30 * MIN, endAtMs: closed.endAtMs, note: "" };
      expect(code(null, intent, makeCtx(), closed)).toBe("NOTE_REQUIRED");
      expect(code(null, { ...intent, note: "olvidé fichar" }, makeCtx({ overlap: true }), closed)).toBe("OVERLAP");
      const r = okNext(null, { ...intent, note: "olvidé fichar" }, makeCtx(), closed);
      expect(r.next.integrityClass).toBe("MANUAL");
      expect(r.next.bookkeeping.original?.declaredStartAtMs).toBe(MONDAY_8AM);
      expect(r.next.actualStartAtMs).toBe(MONDAY_8AM - 30 * MIN);
    });
    test("rechaza tiempos inválidos, sin cambio o cerrar vía patch", () => {
      expect(code(null, { type: "MANUAL_PATCH", sessionId: 1, declaredStartAtMs: MONDAY_8AM, endAtMs: MONDAY_8AM - 1, note: "x" }, makeCtx(), closed)).toBe("INVALID_TIMES");
      expect(code(null, { type: "MANUAL_PATCH", sessionId: 1, declaredStartAtMs: MONDAY_8AM, endAtMs: closed.endAtMs, note: "x" }, makeCtx(), closed)).toBe("INVALID_TIMES");
      expect(code(null, { type: "MANUAL_PATCH", sessionId: 1, declaredStartAtMs: MONDAY_8AM, endAtMs: MONDAY_8AM + HOUR, note: "x" }, makeCtx(), makeSession())).toBe("INVALID_TIMES");
      expect(code(null, { type: "MANUAL_PATCH", sessionId: 1, declaredStartAtMs: MONDAY_8AM, endAtMs: null, note: "x" }, makeCtx(), null)).toBe("SESSION_NOT_FOUND");
    });
  });

  test("DELETE solo sobre cerradas; ADD_NOTE exige texto", () => {
    expect(code(null, { type: "DELETE_SESSION", sessionId: 1 }, makeCtx(), makeSession())).toBe("ILLEGAL_TRANSITION");
    expect(okNext(null, { type: "DELETE_SESSION", sessionId: 1 }, makeCtx(), makeClosedSession(MONDAY_8AM, 8)).next.bookkeeping.isDeleted).toBe(true);
    expect(code(null, { type: "ADD_NOTE", sessionId: 1, note: "  " }, makeCtx(), makeSession())).toBe("NOTE_REQUIRED");
  });

  describe("RESOLVE_* (CONFLICT no se cierra sin autor)", () => {
    const conflict = makeClosedSession(MONDAY_8AM, 8, { integrityClass: "CONFLICT", bookkeeping: { integrityReason: "AUTO_CLOSE_12H" } });
    test("RESOLVE_MANUAL exige nota", () => {
      expect(code(null, { type: "RESOLVE_MANUAL", sessionId: 1, note: "" }, makeCtx(), conflict)).toBe("NOTE_REQUIRED");
      expect(okNext(null, { type: "RESOLVE_MANUAL", sessionId: 1, note: "revisado" }, makeCtx(), conflict).next.integrityClass).toBe("MANUAL");
    });
    test("RESOLVE_KEEP_GPS: VALID solo con par GPS limpio y sin degradación", () => {
      expect(okNext(null, { type: "RESOLVE_KEEP_GPS", sessionId: 1 }, makeCtx({ cleanGpsPair: true }), conflict).next.integrityClass).toBe("VALID");
      expect(okNext(null, { type: "RESOLVE_KEEP_GPS", sessionId: 1 }, makeCtx({ cleanGpsPair: false }), conflict).next.integrityClass).toBe("AUTO");
      expect(code(null, { type: "RESOLVE_KEEP_GPS", sessionId: 1 }, makeCtx(), makeClosedSession(MONDAY_8AM, 8))).toBe("NOT_IN_CONFLICT");
    });
    test("RESOLVE_SPLIT implementado (P4): fuera de rango → INVALID_TIMES", () => {
      expect(code(null, { type: "RESOLVE_SPLIT", sessionId: 1, splitAtMs: MONDAY_8AM, note: "x" }, makeCtx(), conflict)).toBe("INVALID_TIMES");
    });
  });

  test("INTEGRITY_DEGRADE escala a CONFLICT una sola vez", () => {
    const r = okNext(makeSession(), { type: "INTEGRITY_DEGRADE", cause: "CLOCK_DRIFT" });
    expect(r.next.integrityClass).toBe("CONFLICT");
    expect(r.feedback).toBe("CLOCK_DRIFT");
    expect(code(r.next, { type: "INTEGRITY_DEGRADE", cause: "CLOCK_DRIFT" })).toBe("ILLEGAL_TRANSITION");
  });

  test("helpers: escalate nunca mejora; reglas de nota de W Tracker", () => {
    expect(escalate({ cls: "CONFLICT", reason: "CLOCK_DRIFT" }, { cls: "VALID", reason: "CLEAN" }).cls).toBe("CONFLICT");
    expect(escalate({ cls: "AUTO", reason: "AUTO_CLOSE_12H" }, { cls: "MANUAL", reason: "MANUAL_PATCH" }).cls).toBe("MANUAL");
    const s = makeClosedSession(MONDAY_8AM, 8);
    expect(hasTimeChanged(s, MONDAY_8AM, s.endAtMs)).toBe(false);
    expect(requiresAuditNote(s, MONDAY_8AM + MIN, s.endAtMs, " ")).toBe(true);
  });
});
