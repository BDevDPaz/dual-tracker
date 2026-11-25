/**
 * selectSessionAudit (PR3): un escenario por bloque de la auditoría.
 * Asientos construidos a mano con la misma forma que escribe el motor
 * (payloadJson = { ...draft, data }). Lo que no existe sale «no registrado».
 */
import type { LedgerActor, LedgerEntry, LedgerIncident, LedgerIntent, SessionAuditInputs } from "../../contracts";
import { selectPeriodAuditRows, selectSessionAudit } from "../sessionAudit";
import { HOUR, MIN, MONDAY_8AM, makeClosedSession, makeSession } from "../../../../test/fixtures/session.fixture";

let nextId = 1;
function entry(
  intent: LedgerIntent,
  o: { actor?: LedgerActor; at?: number; reason?: string; data?: Record<string, unknown>; cls?: LedgerEntry["integrityClass"]; sessionId?: number | null } = {},
): LedgerEntry {
  const id = nextId++;
  const draft = {
    sessionId: o.sessionId === undefined ? 1 : o.sessionId,
    actor: o.actor ?? "USER",
    intent,
    fromState: null,
    toState: null,
    reason: o.reason ?? intent,
    timestampMs: o.at ?? MONDAY_8AM,
    integrityClass: o.cls ?? null,
  };
  return { ...draft, id, prevHash: `p${id}`, hash: `h${id}`, payloadJson: JSON.stringify({ ...draft, data: { ...(o.data ?? {}), ledgerPayloadVersion: 2 } }) };
}

function inputs(ledger: LedgerEntry[], o: Partial<SessionAuditInputs> = {}): SessionAuditInputs {
  return { ledger, trailGaps: [], recomputedSealHash: null, latestNoteDigest: null, restores: [], ...o };
}

beforeEach(() => {
  nextId = 1;
});

describe("selectSessionAudit · entrada, salida y origen", () => {
  test("llegada por geocerca, primera salida no fiable y cierre manual", () => {
    const s = makeClosedSession(MONDAY_8AM, 8, { bookkeeping: { firstExitAtMs: MONDAY_8AM + 8 * HOUR, firstExitReliable: false } });
    const ledger = [
      entry("START_DAY", { cls: "VALID" }),
      entry("SPATIAL_FACT", { actor: "GEOFENCE", at: MONDAY_8AM + 10 * MIN, reason: "ENTER", data: { type: "ENTER", reliable: true, accuracyM: 12, siteId: 1 } }),
      entry("ARRIVAL_CONFIRMED", { actor: "GEOFENCE", at: MONDAY_8AM + 10 * MIN, reason: "AUTO_CHECKIN_GEOFENCE_ENTRY", cls: "VALID" }),
      entry("SPATIAL_FACT", { actor: "GEOFENCE", at: MONDAY_8AM + 8 * HOUR, reason: "EXIT_UNRELIABLE:ACCURACY_OVER_RADIUS", data: { type: "EXIT", reliable: false, accuracyM: 180 } }),
      entry("CLOSE_DAY", { at: MONDAY_8AM + 8 * HOUR + 5 * MIN, cls: "VALID", data: { type: "CLOSE_DAY", mode: "EXIT_CONFIRMED" } }),
    ];
    const a = selectSessionAudit(s, inputs(ledger));
    expect(a.arrival).toEqual({ atMs: MONDAY_8AM + 10 * MIN, origin: "GEOFENCE", manualArrival: false });
    expect(a.firstExit).toEqual({ atMs: MONDAY_8AM + 8 * HOUR, reliable: false });
    const exit = a.rows.find((r) => r.detail.factType === "EXIT")!;
    expect(exit).toMatchObject({ origin: "GEOFENCE", kind: "SPATIAL" });
    expect(exit.detail).toMatchObject({ reliable: false, accuracyM: 180, unreliableReason: "ACCURACY_OVER_RADIUS" });
    expect(a.rows.find((r) => r.intent === "CLOSE_DAY")!.detail.closeMode).toBe("EXIT_CONFIRMED");
    expect(a.counts.unreliableFacts).toBe(1);
    // Acciones del usuario: autor y vía no se registran; la geocerca no las tiene.
    expect(a.rows.find((r) => r.intent === "START_DAY")!.notRecorded).toEqual(["AUTHOR", "NOTIFICATION_CHANNEL"]);
    expect(exit.notRecorded).toEqual([]);
    expect(a.notRecorded).toEqual(["AUTHOR", "NOTIFICATION_CHANNEL"]);
  });

  test("«Ya llegué» manual lejos del sitio y asientos de otra jornada ignorados", () => {
    const s = makeSession({ bookkeeping: { compliance: { manualArrival: true } } });
    const ledger = [
      entry("START_DAY"),
      entry("ARRIVAL_CONFIRMED", { reason: "MANUAL_ARRIVAL_CONFIRMED", data: { manualArrival: true } }),
      entry("CLOSE_DAY", { sessionId: 2 }),
    ];
    const a = selectSessionAudit(s, inputs(ledger));
    expect(a.arrival).toMatchObject({ origin: "MANUAL", manualArrival: true });
    expect(a.rows).toHaveLength(2);
  });
});

describe("selectSessionAudit · ediciones con motivo y hora", () => {
  test("dos ediciones: solo la última nota es legible; la anterior queda «no registrado»", () => {
    const s = makeClosedSession(MONDAY_8AM, 8, {
      integrityClass: "MANUAL",
      bookkeeping: { integrityReason: "MANUAL_PATCH", manualNote: "Olvidé fichar la salida", original: { declaredStartAtMs: MONDAY_8AM, actualStartAtMs: MONDAY_8AM, endAtMs: MONDAY_8AM + 9 * HOUR, capturedAtMs: MONDAY_8AM + 10 * HOUR } },
    });
    const ledger = [
      entry("START_DAY", { cls: "VALID" }),
      entry("MANUAL_PATCH", {
        at: MONDAY_8AM + 10 * HOUR,
        cls: "MANUAL",
        data: {
          noteDigest: "hmac:primera",
          before: { declaredStartAtMs: MONDAY_8AM, actualStartAtMs: MONDAY_8AM, endAtMs: MONDAY_8AM + 9 * HOUR },
          after: { declaredStartAtMs: MONDAY_8AM, actualStartAtMs: MONDAY_8AM, endAtMs: MONDAY_8AM + 8.5 * HOUR },
          clippedBreaks: [{}],
        },
      }),
      entry("MANUAL_PATCH", {
        at: MONDAY_8AM + 11 * HOUR,
        cls: "MANUAL",
        data: {
          noteDigest: "hmac:segunda",
          before: { declaredStartAtMs: MONDAY_8AM, actualStartAtMs: MONDAY_8AM, endAtMs: MONDAY_8AM + 8.5 * HOUR },
          after: { declaredStartAtMs: MONDAY_8AM, actualStartAtMs: MONDAY_8AM, endAtMs: MONDAY_8AM + 8 * HOUR },
        },
      }),
    ];
    const a = selectSessionAudit(s, inputs(ledger, { latestNoteDigest: "hmac:segunda" }));
    const [first, second] = a.rows.filter((r) => r.kind === "EDIT");
    expect(first.origin).toBe("CORRECTION");
    expect(first.note).toEqual({ status: "DIGEST_ONLY" });
    expect(first.notRecorded).toEqual(["AUTHOR", "PRIOR_REASONS"]);
    expect(first.detail.before?.endAtMs).toBe(MONDAY_8AM + 9 * HOUR);
    expect(first.detail.after?.endAtMs).toBe(MONDAY_8AM + 8.5 * HOUR);
    expect(first.detail.clippedBreaks).toBe(1);
    expect(second.note).toEqual({ status: "READABLE", text: "Olvidé fichar la salida" });
    expect(a.counts.edits).toBe(2);
    expect(a.original?.endAtMs).toBe(MONDAY_8AM + 9 * HOUR);
    expect(a.notRecorded).toEqual(["PRIOR_REASONS", "AUTHOR", "NOTIFICATION_CHANNEL"]);
  });

  test("sin huella que coincida no se atribuye la nota a ningún asiento (no se inventa)", () => {
    const s = makeClosedSession(MONDAY_8AM, 8, { bookkeeping: { manualNote: "Nota actual" } });
    const ledger = [entry("ADD_NOTE", { data: { noteDigest: "hmac:otra" } })];
    const a = selectSessionAudit(s, inputs(ledger, { latestNoteDigest: null }));
    expect(a.rows[0].note).toEqual({ status: "DIGEST_ONLY" });
    expect(a.latestNote).toBe("Nota actual");
  });

  test("asiento v1 con la nota en claro: es dato registrado y se muestra", () => {
    const s = makeClosedSession(MONDAY_8AM, 8);
    const ledger = [entry("ADD_NOTE", { data: { note: "Nota antigua v1" } })];
    expect(selectSessionAudit(s, inputs(ledger)).rows[0].note).toEqual({ status: "READABLE", text: "Nota antigua v1" });
  });
});

describe("selectSessionAudit · conflictos y resolución", () => {
  test("conflicto por salida no confirmada resuelto con RESOLVE_KEEP_GPS", () => {
    const s = makeClosedSession(MONDAY_8AM, 8, { integrityClass: "MANUAL", bookkeeping: { integrityReason: "CONFLICT_RESOLVED" } });
    const ledger = [
      entry("START_DAY", { cls: "VALID" }),
      entry("AUTO_CLOSE", { actor: "WATCHDOG", at: MONDAY_8AM + 9 * HOUR, reason: "AUTO_CLOSE_EXIT_DECISION_EXPIRED", cls: "CONFLICT", data: { cause: "EXIT_DECISION_EXPIRED", confirmedOutside: false } }),
      entry("RESOLVE_KEEP_GPS", { at: MONDAY_8AM + 20 * HOUR, cls: "MANUAL", data: { noteDigest: null } }),
    ];
    const a = selectSessionAudit(s, inputs(ledger));
    expect(a.conflicts).toEqual([
      { openedAtMs: MONDAY_8AM + 9 * HOUR, openedLedgerId: 2, reason: "AUTO_CLOSE_EXIT_DECISION_EXPIRED", resolvedAtMs: MONDAY_8AM + 20 * HOUR, resolvedLedgerId: 3, resolvedBy: "RESOLVE_KEEP_GPS" },
    ]);
    expect(a.counts).toMatchObject({ conflicts: 1, resolved: 1, autoCloses: 1 });
    const auto = a.rows[1];
    expect(auto).toMatchObject({ origin: "SYSTEM", kind: "AUTO_CLOSE" });
    expect(auto.detail).toMatchObject({ cause: "EXIT_DECISION_EXPIRED", confirmedOutside: false, conflictOpened: true });
    expect(a.rows[2]).toMatchObject({ origin: "CORRECTION", kind: "RESOLUTION" });
    expect(a.rows[2].detail.conflictClosed).toBe(true);
  });

  test("RESOLVE_SPLIT conserva la jornada nueva y la hora del corte", () => {
    const s = makeClosedSession(MONDAY_8AM, 8, { integrityClass: "MANUAL" });
    const ledger = [
      entry("START_DAY", { cls: "CONFLICT", reason: "START_DAY" }),
      entry("RESOLVE_SPLIT", { cls: "MANUAL", reason: "SESSION_SPLIT", data: { newSessionId: 7, splitAtMs: MONDAY_8AM + 4 * HOUR, noteDigest: "x" } }),
    ];
    const a = selectSessionAudit(s, inputs(ledger));
    expect(a.rows[1].detail).toMatchObject({ newSessionId: 7, splitAtMs: MONDAY_8AM + 4 * HOUR });
    expect(a.conflicts[0].resolvedBy).toBe("RESOLVE_SPLIT");
  });

  test("cierre automático a las 12 h sin confirmar fuera: conflicto abierto", () => {
    const s = makeClosedSession(MONDAY_8AM, 12, { integrityClass: "CONFLICT", bookkeeping: { integrityReason: "AUTO_CLOSE_12H" } });
    const ledger = [
      entry("START_DAY", { cls: "VALID" }),
      entry("AUTO_CLOSE", { actor: "WATCHDOG", at: MONDAY_8AM + 12 * HOUR, reason: "AUTO_CLOSE_MAX_OPEN_12H", cls: "CONFLICT", data: { cause: "MAX_OPEN_12H", confirmedOutside: false } }),
    ];
    const a = selectSessionAudit(s, inputs(ledger));
    expect(a.conflicts[0]).toMatchObject({ resolvedLedgerId: null, resolvedBy: null });
    expect(selectPeriodAuditRows([a])[0]).toMatchObject({ conflictsOpen: 1, conflictsResolved: 0, autoClosed: true });
  });
});

describe("selectSessionAudit · almuerzo y pausas", () => {
  test("almuerzo, pausas prorrateadas y respuestas de comida", () => {
    const s = makeClosedSession(MONDAY_8AM, 9, {
      lunch: { taken: true, startAtMs: MONDAY_8AM + 4 * HOUR, endAtMs: MONDAY_8AM + 4.5 * HOUR, deductedMinutes: 30, interrupted: true },
      bookkeeping: { pauses: [{ startAtMs: MONDAY_8AM + 2 * HOUR, endAtMs: MONDAY_8AM + 2.25 * HOUR, kind: "REST" }], pausesSource: "PRORATED", breaksClipped: true, compliance: { waiveSecondMeal: true, restBreaksTaken: false } },
    });
    const ledger = [entry("LUNCH_START", { reason: "LUNCH_STARTED" }), entry("RESUME", { reason: "USER_RESUMED_WORK" })];
    const a = selectSessionAudit(s, inputs(ledger));
    expect(a.lunch).toMatchObject({ deductedMinutes: 30, interrupted: true });
    expect(a.pauses).toHaveLength(1);
    expect(a.pausesSource).toBe("PRORATED");
    expect(a.breaksClipped).toBe(true);
    expect(a.compliance).toEqual({ waiveSecondMeal: true, restBreaksTaken: false });
    expect(a.rows.map((r) => r.kind)).toEqual(["BREAK", "BREAK"]);
  });
});

describe("selectSessionAudit · huecos y vigilancia", () => {
  test("OS_KILL, MONITORING_GAP, GPS_LOST (duración no registrada) y huecos de la miga", () => {
    const s = makeClosedSession(MONDAY_8AM, 8);
    const ledger = [
      entry("OS_KILL", { actor: "SYSTEM", reason: "HEARTBEAT_GAP", data: { gapMs: 25 * MIN, deviceOffMs: 20 * MIN, lastHeartbeatMs: 1 } }),
      entry("MONITORING_GAP", { actor: "WATCHDOG", reason: "HEARTBEAT_GAP", data: { gapSeconds: 600 } }),
      entry("GPS_LOST", { actor: "SYSTEM" }),
      entry("GPS_RESTORED", { actor: "SYSTEM" }),
      entry("CLOCK_SAMPLED", { actor: "SYSTEM", reason: "CLOCK_DRIFT", data: { driftMs: 95_000, suspect: true } }),
    ];
    const gaps = [{ kind: "recording" as const, fromMs: MONDAY_8AM + HOUR, toMs: MONDAY_8AM + 2 * HOUR }];
    const a = selectSessionAudit(s, inputs(ledger, { trailGaps: gaps }));
    expect(a.rows[0].detail).toMatchObject({ gapMs: 25 * MIN, deviceOffMs: 20 * MIN });
    expect(a.rows[1].detail.gapMs).toBe(600_000);
    expect(a.rows[2].notRecorded).toEqual(["GPS_LOSS_DURATION"]);
    expect(a.rows[4].detail).toMatchObject({ driftMs: 95_000, suspect: true });
    expect(a.counts).toMatchObject({ osKills: 1, monitoringGaps: 1, gpsLosses: 1, trailGaps: 1 });
    expect(a.trailGaps).toEqual(gaps);
    expect(a.notRecorded).toEqual(["GPS_LOSS_DURATION"]);
  });
});

describe("selectSessionAudit · sello, cadena y restauración", () => {
  const closed = () => makeClosedSession(MONDAY_8AM, 8);
  const sealed = () => [entry("START_DAY"), entry("CLOSE_DAY"), entry("SESSION_SEALED", { actor: "SYSTEM", data: { sessionHash: "abc", eventCount: 2 } })];

  test("sello correcto cuando el hash recalculado coincide", () => {
    const a = selectSessionAudit(closed(), inputs(sealed(), { recomputedSealHash: "abc" }));
    expect(a.seal).toEqual({ status: "OK", atMs: MONDAY_8AM, eventCount: 2, eventsAfter: 0 });
  });
  test("sello que no coincide", () => {
    expect(selectSessionAudit(closed(), inputs(sealed(), { recomputedSealHash: "otro" })).seal.status).toBe("MISMATCH");
  });
  test("cerrada sin sello y abierta sin sello", () => {
    expect(selectSessionAudit(closed(), inputs([entry("START_DAY")])).seal.status).toBe("MISSING");
    expect(selectSessionAudit(makeSession(), inputs([entry("START_DAY")])).seal.status).toBe("OPEN");
  });
  test("ruptura de cadena dentro o fuera de la jornada", () => {
    const ledger = sealed();
    const incident = (breakAtId: number) => ({ breakAtId }) as LedgerIncident;
    expect(selectSessionAudit(closed(), inputs(ledger), { chainIncident: incident(2) }).chain).toBe("BROKEN_IN_SESSION");
    expect(selectSessionAudit(closed(), inputs(ledger), { chainIncident: incident(99) }).chain).toBe("BROKEN_ELSEWHERE");
    expect(selectSessionAudit(closed(), inputs(ledger)).chain).toBe("OK");
  });
  test("restauración de copia posterior al inicio de la jornada", () => {
    const restore = entry("BACKUP_RESTORED", { actor: "USER", sessionId: null, at: MONDAY_8AM + 30 * HOUR });
    const old = entry("BACKUP_RESTORED", { actor: "USER", sessionId: null, at: MONDAY_8AM - 30 * HOUR });
    const a = selectSessionAudit(closed(), inputs([entry("START_DAY")], { restores: [old, restore] }));
    expect(a.restoredAtMs).toBe(MONDAY_8AM + 30 * HOUR);
    expect(a.rows).toHaveLength(1);
  });
});

describe("selectPeriodAuditRows", () => {
  test("una fila por jornada, en orden, sin incidencias = contadores a cero", () => {
    const a1 = selectSessionAudit(makeClosedSession(MONDAY_8AM + 24 * HOUR, 8, { id: 2 }), inputs([entry("START_DAY", { sessionId: 2 })]));
    const a2 = selectSessionAudit(makeClosedSession(MONDAY_8AM, 8), inputs([entry("START_DAY")]));
    const rows = selectPeriodAuditRows([a1, a2]);
    expect(rows.map((r) => r.sessionId)).toEqual([1, 2]);
    expect(rows[0]).toMatchObject({ edits: 0, conflictsOpen: 0, conflictsResolved: 0, autoClosed: false, seal: "MISSING", trailGaps: 0, monitoringGaps: 0 });
  });
});
