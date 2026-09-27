/** T1 — SessionEngineService con persistencia fake (SQLite en memoria) y puertos falsos. */
import { Store, StoreActions } from "../../../core/store";
import { PersistenceService } from "../../persistence/PersistenceService";
import { IntegrityLedgerService } from "../IntegrityLedgerService";
import type { SessionRuntimePorts } from "../SessionEngineService";
import { SessionEngineService } from "../SessionEngineService";
import { HOUR, MIN } from "../../../../test/fixtures/session.fixture";
import { makeExit } from "../../../../test/fixtures/spatial.fixture";
import { acceptDisclosure, mustDispatch, seedWorld, startAndArrive } from "../../../../test/helpers";
import { time } from "../../../../test/time";

function fakePorts() {
  const calls: string[] = [];
  const ports: SessionRuntimePorts = {
    async syncRuntime(e) {
      calls.push(`sync:${e.status}:${e.geofenceSiteId ?? "-"}`);
    },
    async scheduleExitDecision(id, first, win) {
      calls.push(`schedule:${id}:${first}:${win}`);
    },
    async cancelExitDecision(id) {
      calls.push(`cancel:${id}`);
    },
  };
  return { ports, calls };
}

describe("SessionEngineService", () => {
  let sites: { siteA: number; siteB: number };
  beforeEach(async () => {
    sites = await seedWorld();
  });
  afterEach(() => SessionEngineService.setRuntimePorts(null));

  test("START_DAY crea ESPERANDO, persiste y deja asiento en el ledger", async () => {
    const { ports, calls } = fakePorts();
    SessionEngineService.setRuntimePorts(ports);
    const s = await mustDispatch({ type: "START_DAY", siteId: sites.siteA });
    expect(s.id).toBeGreaterThan(0);
    expect(s.domainStatus).toBe("ESPERANDO");
    expect((await PersistenceService.getOpenSession())?.id).toBe(s.id);
    const ledger = await IntegrityLedgerService.listForSession(s.id);
    expect(ledger.map((e) => e.intent)).toEqual(["START_DAY"]);
    expect(calls).toEqual([`sync:ESPERANDO:${sites.siteA}`]);
    expect(Store.getState().sessions.byId[s.id]?.domainStatus).toBe("ESPERANDO");
  });

  test("ENTER fiable → ACTIVA con actualStartAtMs", async () => {
    const s = await startAndArrive(sites.siteA, 12 * MIN);
    expect(s.domainStatus).toBe("ACTIVA");
    expect(s.actualStartAtMs).toBe(time.now());
    expect(s.integrityClass).toBe("VALID");
  });

  test("[obligatorio #2] STAY_WORKING desde SALIDA vuelve a ACTIVA y borra firstExit", async () => {
    const { ports, calls } = fakePorts();
    SessionEngineService.setRuntimePorts(ports);
    const s = await startAndArrive(sites.siteA);
    time.travel(3 * HOUR);
    const exitAt = time.now();
    const salida = await mustDispatch({ type: "EXIT_DETECTED", fact: makeExit({ sessionId: s.id, timestampMs: exitAt }) }, "GEOFENCE");
    expect(salida.domainStatus).toBe("SALIDA");
    expect(salida.bookkeeping.firstExitAtMs).toBe(exitAt);
    expect(calls.some((c) => c.startsWith(`schedule:${s.id}:${exitAt}:`))).toBe(true);

    time.travel(5 * MIN);
    const back = await mustDispatch({ type: "STAY_WORKING" }, "NOTIFICATION");
    expect(back.domainStatus).toBe("ACTIVA");
    expect(back.bookkeeping.firstExitAtMs).toBeNull();
    expect(back.bookkeeping.firstExitReliable).toBeNull();
    const persisted = await PersistenceService.getSession(s.id);
    expect(persisted?.domainStatus).toBe("ACTIVA");
    expect(persisted?.bookkeeping.firstExitAtMs).toBeNull();
    expect(calls).toContain(`cancel:${s.id}`);
    // El ledger conserva el EXIT original.
    const intents = (await IntegrityLedgerService.listForSession(s.id)).map((e) => e.intent);
    expect(intents).toEqual(["START_DAY", "ARRIVAL_CONFIRMED", "EXIT_DETECTED", "STAY_WORKING"]);
  });

  test("CLOSE_DAY registra la deducción de almuerzo declarada y cierra VALID por el usuario", async () => {
    await startAndArrive(sites.siteA);
    time.travel(9 * HOUR);
    const r = await SessionEngineService.dispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 60 }, "UI");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data?.session.domainStatus).toBe("CERRADA");
    expect(r.data?.session.lunch.deductedMinutes).toBe(60);
    expect(r.data?.session.integrityClass).toBe("VALID");
    expect(r.data?.preview?.lunchMinutes).toBe(60);
    expect(await PersistenceService.getOpenSession()).toBeNull();
  });

  test("CLOSE_DAY con almuerzo tomado en jornada usa el intervalo real, no el declarado", async () => {
    await startAndArrive(sites.siteA);
    time.travel(4 * HOUR);
    await mustDispatch({ type: "LUNCH_START" });
    time.travel(45 * MIN);
    await mustDispatch({ type: "RESUME" });
    time.travel(4 * HOUR);
    const closed = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 60 });
    expect(closed.lunch.deductedMinutes).toBeNull();
    expect(closed.lunch.endAtMs! - closed.lunch.startAtMs!).toBe(45 * MIN);
  });

  test("rechazos no escriben nada (ni sesión ni ledger)", async () => {
    const r = await SessionEngineService.dispatch({ type: "CLOSE_DAY", mode: "MANUAL" }, "UI");
    expect(r).toMatchObject({ ok: false, code: "NO_OPEN_SESSION" });
    expect(await PersistenceService.listLedger()).toHaveLength(0);
  });

  test("sin aviso aceptado START_DAY se rechaza en el motor (defensa en profundidad)", async () => {
    await acceptDisclosure(false);
    const r = await SessionEngineService.dispatch({ type: "START_DAY", siteId: sites.siteA }, "UI");
    expect(r).toMatchObject({ ok: false, code: "DISCLOSURE_NOT_ACCEPTED" });
    expect(await PersistenceService.getOpenSession()).toBeNull();
  });

  test("sitio archivado no admite START_DAY", async () => {
    const site = (await PersistenceService.getSite(sites.siteB))!;
    await PersistenceService.updateSite({ ...site, active: false, archivedAtMs: time.now() });
    const r = await SessionEngineService.dispatch({ type: "START_DAY", siteId: sites.siteB }, "UI");
    expect(r).toMatchObject({ ok: false, code: "SITE_NOT_FOUND" });
  });

  test("permiso de background denegado degrada: la jornada nace CONFLICT", async () => {
    StoreActions.healthUpdated({ locationBackground: "denied" });
    const s = await mustDispatch({ type: "START_DAY", siteId: sites.siteA });
    expect(s.integrityClass).toBe("CONFLICT");
    expect(s.bookkeeping.integrityReason).toBe("BACKGROUND_PERMISSION_MISSING");
  });

  test("un puerto que falla no revierte la transición", async () => {
    SessionEngineService.setRuntimePorts({
      async syncRuntime() {
        throw new Error("boom");
      },
      async scheduleExitDecision() {},
      async cancelExitDecision() {},
    });
    const s = await mustDispatch({ type: "START_DAY", siteId: sites.siteA });
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ESPERANDO");
  });

  test("recordSpatialFact: ENTER deja asiento; BREADCRUMB no", async () => {
    const s = await mustDispatch({ type: "START_DAY", siteId: sites.siteA });
    await SessionEngineService.recordSpatialFact({ sessionId: s.id, type: "ENTER", lat: 1, lon: 1, accuracyM: 5, timestampMs: time.now(), source: "gps", reliable: true });
    await SessionEngineService.recordSpatialFact({ sessionId: s.id, type: "BREADCRUMB", lat: 1, lon: 1, accuracyM: 5, timestampMs: time.now(), source: "gps", reliable: true });
    const spatial = (await IntegrityLedgerService.listForSession(s.id)).filter((e) => e.intent === "SPATIAL_FACT");
    expect(spatial.map((e) => e.reason)).toEqual(["ENTER"]);
    expect(await PersistenceService.listSpatialFacts(s.id)).toHaveLength(2);
  });

  test("recordOsKill anota HEARTBEAT_GAP sin alterar la sesión", async () => {
    const s = await startAndArrive(sites.siteA);
    await SessionEngineService.recordOsKill(s, time.now() - 20 * MIN);
    const last = (await IntegrityLedgerService.listForSession(s.id)).pop()!;
    expect(last.intent).toBe("OS_KILL");
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ACTIVA");
  });
});
