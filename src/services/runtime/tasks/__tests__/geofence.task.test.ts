/**
 * T5 — geofence.task con TaskManager mockeado: se invoca el handler a mano.
 * "updateStatus" de la propuesta = cualquier PersistenceService.updateSession
 * fuera de SessionEngineService.dispatch (no existe updateStatus en el código).
 */
import { GEOFENCE_TASK_NAME } from "../../../../constants/geolocation";
import { IntegrityLedgerService } from "../../../domain/IntegrityLedgerService";
import { PersistenceService } from "../../../persistence/PersistenceService";
import { KV_KEYS } from "../../../persistence/schema";
import { GeofenceRuntimeService, geofenceIdentifier } from "../../GeofenceRuntimeService";
import { TaskOrchestratorService } from "../../TaskOrchestratorService";
import { runGeofenceTask } from "../geofence.task";
import { HOUR } from "../../../../../test/fixtures/session.fixture";
import { SITE_LAT, SITE_LON } from "../../../../../test/fixtures/spatial.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../../test/helpers";
import { LocationMock, TaskManagerMock, watchStatusWrites } from "../../../../../test/runtimeHarness";
import { time } from "../../../../../test/time";

const ENTER = 1;
const EXIT = 2;
const region = (sessionId: number, siteId: number) => ({ identifier: geofenceIdentifier(sessionId, siteId), latitude: SITE_LAT, longitude: SITE_LON, radius: 100 });

describe("geofence.task", () => {
  beforeAll(() => TaskOrchestratorService.defineTasks(async () => {}));

  test("[obligatorio #11] ENTER no llama PersistenceService.updateStatus (updateSession) fuera del motor", async () => {
    const { siteA } = await seedWorld();
    const s = await mustDispatch({ type: "START_DAY", siteId: siteA });
    time.travel(10 * 60_000);
    LocationMock.__setPosition(SITE_LAT, SITE_LON, 10);
    const w = watchStatusWrites();

    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: ENTER, region: region(s.id, siteA) });

    expect(w.outside).toEqual([]); // ninguna escritura lateral de estado
    expect(w.intents()).toEqual(["ARRIVAL_CONFIRMED"]); // el cambio va por el motor
    expect(w.dispatch.mock.calls[0][1]).toBe("GEOFENCE");
    const facts = await PersistenceService.listSpatialFacts(s.id, ["ENTER"]);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ reliable: true, siteId: siteA });
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ACTIVA");
  });

  test("[obligatorio #11] ENTER en ACTIVA solo emite SpatialFact: ni dispatch ni UPDATE", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(HOUR);
    LocationMock.__setPosition(SITE_LAT, SITE_LON, 10);
    const w = watchStatusWrites();
    await runGeofenceTask({ data: { eventType: ENTER, region: region(s.id, siteA) }, error: null, executionInfo: { eventId: "e", taskName: GEOFENCE_TASK_NAME } } as Parameters<typeof runGeofenceTask>[0]);
    expect(w.dispatch).not.toHaveBeenCalled();
    expect(w.updates).not.toHaveBeenCalled();
    expect(await PersistenceService.listSpatialFacts(s.id, ["ENTER"])).toHaveLength(1);
  });

  test("EXIT en ACTIVA no cierra la jornada: queda salida pendiente con la primera hora", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(8 * HOUR);
    const exitAt = time.now();
    LocationMock.__setPosition(SITE_LAT + 0.01, SITE_LON, 10);
    const w = watchStatusWrites();
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: EXIT, region: region(s.id, siteA) });
    time.travel(30_000);
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: EXIT, region: region(s.id, siteA) }); // segundo EXIT
    expect(w.dispatch).not.toHaveBeenCalled();
    expect(w.outside).toEqual([]);
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ACTIVA");
    expect(await GeofenceRuntimeService.getPendingExit()).toMatchObject({ sessionId: s.id, firstExitAtMs: exitAt, reliable: true });
    const spatial = (await IntegrityLedgerService.listForSession(s.id)).filter((e) => e.intent === "SPATIAL_FACT");
    expect(spatial.map((e) => e.reason)).toEqual(["EXIT", "EXIT"]); // ambos EXIT quedan como evidencia
  });

  test("debounce vencido → EXIT_DETECTED con la PRIMERA salida → SALIDA (no CERRADA)", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(8 * HOUR);
    const exitAt = time.now();
    LocationMock.__setPosition(SITE_LAT + 0.01, SITE_LON, 10);
    await runGeofenceTask({ data: { eventType: EXIT, region: region(s.id, siteA) }, error: null } as Parameters<typeof runGeofenceTask>[0]);
    expect(await GeofenceRuntimeService.checkPendingExit()).toBe(false); // aún en debounce
    time.travel(3 * 60_000);
    expect(await GeofenceRuntimeService.checkPendingExit()).toBe(true);
    const after = (await PersistenceService.getSession(s.id))!;
    expect(after.domainStatus).toBe("SALIDA");
    expect(after.bookkeeping.firstExitAtMs).toBe(exitAt);
  });

  test("ENTER tras EXIT pendiente anula la salida (rebote de GPS)", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(HOUR);
    LocationMock.__setPosition(SITE_LAT + 0.01, SITE_LON, 10);
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: EXIT, region: region(s.id, siteA) });
    time.travel(60_000);
    LocationMock.__setPosition(SITE_LAT, SITE_LON, 10);
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: ENTER, region: region(s.id, siteA) });
    expect(await GeofenceRuntimeService.getPendingExit()).toBeNull();
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ACTIVA");
  });

  test("ENTER no fiable (precisión > radio) no hace check-in automático", async () => {
    const { siteA } = await seedWorld();
    const s = await mustDispatch({ type: "START_DAY", siteId: siteA });
    LocationMock.__setPosition(SITE_LAT, SITE_LON, 500);
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: ENTER, region: region(s.id, siteA) });
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ESPERANDO");
    const [f] = await PersistenceService.listSpatialFacts(s.id, ["ENTER"]);
    expect(f).toMatchObject({ reliable: false, reason: "ACCURACY_GT_RADIUS" });
  });

  test("evento de región obsoleta, sin jornada o con error de tarea se ignora", async () => {
    const { siteA } = await seedWorld();
    const w = watchStatusWrites();
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: ENTER, region: region(99, siteA) }); // sin jornada
    const s = await mustDispatch({ type: "START_DAY", siteId: siteA });
    w.dispatch.mockClear();
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: ENTER, region: region(s.id + 1, siteA) }); // obsoleta
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: ENTER, region: region(s.id, siteA) }, { code: 1, message: "boom" });
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: ENTER, region: { identifier: "" } });
    expect(w.dispatch).not.toHaveBeenCalled();
    expect(await PersistenceService.listSpatialFacts(s.id)).toHaveLength(0);
  });

  test("anti-rebote: dos ENTER en < 5 s producen un solo hecho", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    LocationMock.__setPosition(SITE_LAT, SITE_LON, 10);
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: ENTER, region: region(s.id, siteA) });
    time.travel(2000);
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: ENTER, region: region(s.id, siteA) });
    expect(await PersistenceService.listSpatialFacts(s.id, ["ENTER"])).toHaveLength(1);
    expect(await PersistenceService.getKv(KV_KEYS.LAST_FIX)).toMatchObject({ lat: SITE_LAT });
  });
});
