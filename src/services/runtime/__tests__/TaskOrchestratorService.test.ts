/** T5 — TaskOrchestrator: defineTask guarda callbacks; handlers invocados con payload fabricado. */
import { BREADCRUMB_TASK_NAME, GEOFENCE_TASK_NAME } from "../../../constants/geolocation";
import { BACKGROUND_WORKER_TASK_NAME } from "../../../constants/tasks";
import { PersistenceService } from "../../persistence/PersistenceService";
import { DEFAULT_COMPANY_POLICY, SettingsService } from "../../persistence/SettingsService";
import { TaskOrchestratorService } from "../TaskOrchestratorService";
import { HOUR, MIN } from "../../../../test/fixtures/session.fixture";
import { SITE_LAT, SITE_LON } from "../../../../test/fixtures/spatial.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../test/helpers";
import { TaskManagerMock, watchStatusWrites } from "../../../../test/runtimeHarness";
import { time } from "../../../../test/time";

const loc = (o: { lat?: number; acc?: number; t?: number } = {}) => ({
  coords: { latitude: o.lat ?? SITE_LAT, longitude: SITE_LON, accuracy: o.acc ?? 10, speed: 0, altitude: 0, heading: 0, altitudeAccuracy: 0 },
  timestamp: o.t ?? time.now(),
});

describe("TaskOrchestratorService", () => {
  const bootstrap = jest.fn(async () => {});
  beforeAll(() => TaskOrchestratorService.defineTasks(() => bootstrap()));
  // scheduleExitDecision arma un setTimeout real de primer plano: se libera tras cada caso.
  afterEach(() => TaskOrchestratorService.cancelExitDecision(0));

  test("define las tres tareas headless y cada handler llama al bootstrap", async () => {
    expect([...TaskManagerMock.__tasks.keys()].sort()).toEqual([BACKGROUND_WORKER_TASK_NAME, BREADCRUMB_TASK_NAME, GEOFENCE_TASK_NAME].sort());
    await PersistenceService.init();
    await TaskManagerMock.__run(BACKGROUND_WORKER_TASK_NAME, {});
    expect(bootstrap).toHaveBeenCalled();
  });

  test("BREADCRUMB en ACTIVA con modo rastro graba migas y no toca el estado", async () => {
    const { siteA } = await seedWorld();
    await SettingsService.saveCompany({ ...DEFAULT_COMPANY_POLICY, traceMode: "BREADCRUMB" });
    const s = await startAndArrive(siteA);
    const w = watchStatusWrites();
    await TaskManagerMock.__run(BREADCRUMB_TASK_NAME, { locations: [loc(), loc({ t: time.now() + MIN })] });
    expect(w.dispatch).not.toHaveBeenCalled();
    expect(w.outside).toEqual([]);
    expect(await PersistenceService.listSpatialFacts(s.id, ["BREADCRUMB"])).toHaveLength(2);
    expect(await TaskOrchestratorService.lastHeartbeat()).toBe(time.now());
  });

  test("BREADCRUMB en ESPERANDO con Solo geocerca ficha la llegada y no graba rastro", async () => {
    const { siteA } = await seedWorld();
    await SettingsService.saveCompany({ ...DEFAULT_COMPANY_POLICY, traceMode: "PERIMETER" });
    const s = await mustDispatch({ type: "START_DAY", siteId: siteA });
    await TaskManagerMock.__run(BREADCRUMB_TASK_NAME, { locations: [loc()] });
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ACTIVA");
    expect(await PersistenceService.listSpatialFacts(s.id, ["BREADCRUMB"])).toHaveLength(0);
  });

  test("BREADCRUMB con jornada CERRADA o sin jornada no graba nada", async () => {
    const { siteA } = await seedWorld();
    await SettingsService.saveCompany({ ...DEFAULT_COMPANY_POLICY, traceMode: "BREADCRUMB" });
    const s = await startAndArrive(siteA);
    time.travel(8 * HOUR);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    await TaskManagerMock.__run(BREADCRUMB_TASK_NAME, { locations: [loc()] });
    expect(await PersistenceService.listSpatialFacts(s.id, ["BREADCRUMB"])).toHaveLength(0);
  });

  test("worker: ejecuta el watchdog (13 h → AUTO_CLOSE) bajo el candado 'worker'", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(13 * HOUR);
    await TaskOrchestratorService.runWorker();
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("CERRADA");
  });

  test("registerBackgroundWorker registra una sola vez", async () => {
    expect(await TaskOrchestratorService.registerBackgroundWorker()).toBe(true);
  });

  test("scheduleExitDecision persiste el plazo con la primera salida", async () => {
    await PersistenceService.init();
    await TaskOrchestratorService.scheduleExitDecision(7, 1000, 30 * MIN);
    expect(await PersistenceService.getKv("runtime.exit_decision")).toEqual({ sessionId: 7, firstExitAtMs: 1000, deadlineMs: time.now() + 30 * MIN });
  });
});
