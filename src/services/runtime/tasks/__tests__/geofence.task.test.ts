/**
 * T5 — geofence.task con TaskManager mockeado: se invoca el handler a mano.
 * "updateStatus" de la propuesta = cualquier PersistenceService.updateSession
 * fuera de SessionEngineService.dispatch (no existe updateStatus en el código).
 */
import * as Notifications from "expo-notifications";
import { __state as notificationState } from "../../../../../test/mocks/expo-notifications";
import { Platform } from "react-native";
import { GEOFENCE_TASK_NAME } from "../../../../constants/geolocation";
import { NOTIFICATION_ACTIONS, NOTIFICATION_CATEGORIES } from "../../../../constants/notifications";
import { IntegrityLedgerService } from "../../../domain/IntegrityLedgerService";
import { SessionEngineService } from "../../../domain/SessionEngineService";
import { TimeAuthorityService } from "../../../evidence/TimeAuthorityService";
import { PersistenceService } from "../../../persistence/PersistenceService";
import { SettingsService } from "../../../persistence/SettingsService";
import { KV_KEYS } from "../../../persistence/schema";
import { GeofenceRuntimeService, geofenceIdentifier } from "../../GeofenceRuntimeService";
import { NotificationService } from "../../NotificationService";
import { TaskOrchestratorService } from "../../TaskOrchestratorService";
import { runGeofenceTask } from "../geofence.task";
import { HOUR, MIN } from "../../../../../test/fixtures/session.fixture";
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

  test("ENTER en el destino no se traga una salida pendiente del sitio anterior", async () => {
    const { siteA, siteB } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(HOUR);
    await PersistenceService.setKv(KV_KEYS.PENDING_EXIT, {
      sessionId: s.id,
      siteId: siteA,
      firstExitAtMs: time.now(),
      reliable: true,
      reason: null,
      strikes: 0,
    });
    await mustDispatch({ type: "TRANSFER_START", toSiteId: siteB });
    time.travel(20 * 60_000);
    LocationMock.__setPosition(SITE_LAT + 0.05, SITE_LON, 10);
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: ENTER, region: region(s.id, siteB) });
    const after = (await PersistenceService.getSession(s.id))!;
    expect(after.domainStatus).toBe("ACTIVA");
    expect(after.siteId).toBe(siteB);
    expect(await GeofenceRuntimeService.getPendingExit()).toBeNull();
  });

  test("rearmar la geocerca del mismo sitio conserva la salida pendiente; otro sitio la descarta", async () => {
    const { siteA, siteB } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(HOUR);
    LocationMock.__setPosition(SITE_LAT + 0.01, SITE_LON, 10);
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: EXIT, region: region(s.id, siteA) });
    const pending = await GeofenceRuntimeService.getPendingExit();
    expect(await GeofenceRuntimeService.startMonitoring(s.id, siteA)).toBe(true);
    expect(await GeofenceRuntimeService.getPendingExit()).toEqual(pending);
    expect(await GeofenceRuntimeService.startMonitoring(s.id, siteB)).toBe(true);
    expect(await GeofenceRuntimeService.getPendingExit()).toBeNull();
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

  test("tres ENTER de la misma región en un minuto dejan un solo hecho y una sola llegada", async () => {
    const { siteA } = await seedWorld();
    const s = await mustDispatch({ type: "START_DAY", siteId: siteA });
    LocationMock.__setPosition(SITE_LAT, SITE_LON, 12);
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: ENTER, region: region(s.id, siteA) });
    time.travel(20_000);
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: ENTER, region: region(s.id, siteA) });
    time.travel(25_000);
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: ENTER, region: region(s.id, siteA) });
    expect(await PersistenceService.listSpatialFacts(s.id, ["ENTER"])).toHaveLength(1);
    const spatial = (await IntegrityLedgerService.listForSession(s.id)).filter((e) => e.intent === "SPATIAL_FACT" && e.reason === "ENTER");
    expect(spatial).toHaveLength(1);
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ACTIVA");
  });

  test("EXIT en la banda de histéresis se anota no fiable y no arma salida", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(2 * HOUR);
    LocationMock.__setPosition(SITE_LAT + 120 / 111_320, SITE_LON, 10);
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: EXIT, region: region(s.id, siteA) });
    expect(await GeofenceRuntimeService.getPendingExit()).toBeNull();
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ACTIVA");
    const [exit] = await PersistenceService.listSpatialFacts(s.id, ["EXIT"]);
    expect(exit).toMatchObject({ reliable: false, reason: "HYSTERESIS" });
    const row = (await IntegrityLedgerService.listForSession(s.id)).find((e) => e.intent === "SPATIAL_FACT" && String(e.reason).startsWith("EXIT"));
    expect(row?.reason).toBe("EXIT_UNRELIABLE:HYSTERESIS");
  });

  test("un ENTER no fiable a los milisegundos de un EXIT no se anota", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(HOUR);
    LocationMock.__setPosition(SITE_LAT + 0.01, SITE_LON, 10);
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: EXIT, region: region(s.id, siteA) });
    LocationMock.__setPosition(SITE_LAT + 0.01, SITE_LON, 400);
    time.travel(2);
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: ENTER, region: region(s.id, siteA) });
    const facts = await PersistenceService.listSpatialFacts(s.id);
    expect(facts.filter((f) => f.type === "ENTER")).toHaveLength(0);
    expect(facts.filter((f) => f.type === "EXIT")).toHaveLength(1);
  });

  test("anti-rebote: dos ENTER en < 5 s producen un solo hecho", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    LocationMock.__setPosition(SITE_LAT, SITE_LON, 10);
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: ENTER, region: region(s.id, siteA) });
    time.travel(2000);
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: ENTER, region: region(s.id, siteA) });
    expect(await PersistenceService.listSpatialFacts(s.id, ["ENTER"])).toHaveLength(1);
    // spec v1.3 §6: runtime.last_fix cifrado en app_kv; se lee descifrado.
    expect(await PersistenceService.getKv(KV_KEYS.LAST_FIX)).toMatch(/^enc:v1:k1:kv\.lastFix:/);
    expect(await PersistenceService.getLastFix()).toMatchObject({ lat: SITE_LAT });
  });

  test("llegar en coche (40 km/h) dentro del radio sí hace check-in", async () => {
    const { siteA } = await seedWorld();
    const s = await mustDispatch({ type: "START_DAY", siteId: siteA });
    LocationMock.__setPosition(SITE_LAT, SITE_LON, 12, 40 / 3.6);
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: ENTER, region: region(s.id, siteA) });
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ACTIVA");
  });

  test("precisión 80 m dentro de un radio de 100 m no ficha: GPS débil, se pregunta", async () => {
    const { siteA } = await seedWorld();
    const s = await mustDispatch({ type: "START_DAY", siteId: siteA });
    LocationMock.__setPosition(SITE_LAT, SITE_LON, 80);
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: ENTER, region: region(s.id, siteA) });
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ESPERANDO");
    const [f] = await PersistenceService.listSpatialFacts(s.id, ["ENTER"]);
    expect(f).toMatchObject({ reliable: false, reason: "GPS_WEAK" });
    const notes = notificationState.scheduled as { content: { data?: { kind?: string } } }[];
    expect(notes.some((n) => n.content.data?.kind === "GPS_WEAK")).toBe(true);
  });

  test("un salto de 10 km en 20 min no rechaza la llegada", async () => {
    const { siteA } = await seedWorld();
    const s = await mustDispatch({ type: "START_DAY", siteId: siteA });
    await PersistenceService.setLastFix({ lat: SITE_LAT + 0.09, lon: SITE_LON, timestampMs: time.now() - 20 * 60_000 });
    LocationMock.__setPosition(SITE_LAT, SITE_LON, 10);
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: ENTER, region: region(s.id, siteA) });
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ACTIVA");
  });

  test("un salto de 10 km en 5 s sí rechaza la llegada", async () => {
    const { siteA } = await seedWorld();
    const s = await mustDispatch({ type: "START_DAY", siteId: siteA });
    await PersistenceService.setLastFix({ lat: SITE_LAT + 0.09, lon: SITE_LON, timestampMs: time.now() - 5_000 });
    LocationMock.__setPosition(SITE_LAT, SITE_LON, 10);
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: ENTER, region: region(s.id, siteA) });
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ESPERANDO");
    const [f] = await PersistenceService.listSpatialFacts(s.id, ["ENTER"]);
    expect(f).toMatchObject({ reliable: false, reason: "LOCATION_JUMP_DETECTED" });
  });

  test("EXIT a 120 m justo después de llegar no arma salida ni cierra (rebote)", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(5_000);
    LocationMock.__setPosition(SITE_LAT + 120 / 111_320, SITE_LON, 10);
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: EXIT, region: region(s.id, siteA) });
    expect(await GeofenceRuntimeService.getPendingExit()).toBeNull();
    time.travel(3 * 60_000);
    expect(await GeofenceRuntimeService.checkPendingExit()).toBe(false);
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ACTIVA");
  });

  test("la muestra del servicio en primer plano ficha si el ENTER nativo no llegó", async () => {
    const { siteA } = await seedWorld();
    const s = await mustDispatch({ type: "START_DAY", siteId: siteA });
    await GeofenceRuntimeService.observeSample({ lat: SITE_LAT, lon: SITE_LON, accuracyM: 15, timestampMs: time.now() });
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ACTIVA");
    expect(await PersistenceService.listSpatialFacts(s.id, ["BREADCRUMB"])).toHaveLength(0);
  });

  test("una muestra con precisión peor que el radio no ficha", async () => {
    const { siteA } = await seedWorld();
    const s = await mustDispatch({ type: "START_DAY", siteId: siteA });
    await GeofenceRuntimeService.observeSample({ lat: SITE_LAT, lon: SITE_LON, accuracyM: 500, timestampMs: time.now() });
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ESPERANDO");
  });

  test("ya dentro al registrar la geocerca: confirmPresence ficha sin evento del SO", async () => {
    const { siteA } = await seedWorld();
    const s = await mustDispatch({ type: "START_DAY", siteId: siteA });
    LocationMock.__setPosition(SITE_LAT, SITE_LON, 20);
    expect(await GeofenceRuntimeService.startMonitoring(s.id, siteA)).toBe(true);
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ACTIVA");
  });

  test("llegar a otro destino continúa la misma jornada (no abre otra sesión)", async () => {
    const { siteA, siteB } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(2 * HOUR);
    await GeofenceRuntimeService.observeSample({
      lat: SITE_LAT + 0.05,
      lon: SITE_LON,
      accuracyM: 10,
      timestampMs: time.now(),
    });
    const after = (await PersistenceService.getSession(s.id))!;
    expect(after.domainStatus).toBe("ACTIVA");
    expect(after.siteId).toBe(siteB);
    expect(after.transitSegments.filter((t) => !t.cancelled)).toHaveLength(1);
    const all = await PersistenceService.listSessions();
    expect(all.filter((x) => !x.bookkeeping.isDeleted)).toHaveLength(1);
  });

  test("una muestra con el reloj del GPS adelantado cierra el tránsito en el ENTER fiable, no 5 min después", async () => {
    const { siteA, siteB } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(HOUR);
    LocationMock.__setPosition(SITE_LAT + 0.01, SITE_LON, 10);
    await runGeofenceTask({ data: { eventType: EXIT, region: region(s.id, siteA) }, error: null } as Parameters<typeof runGeofenceTask>[0]);
    time.travel(3 * 60_000);
    expect(await GeofenceRuntimeService.checkPendingExit()).toBe(true);
    const exitAt = (await PersistenceService.getSession(s.id))!.bookkeeping.firstExitAtMs!;
    await mustDispatch({ type: "TRANSFER_START", toSiteId: siteB });
    const enteredAt = exitAt + 5 * 60_000;
    time.travel(4 * 60_000);
    expect(time.now()).toBe(exitAt + 7 * 60_000);
    await SessionEngineService.recordSpatialFact({
      sessionId: s.id,
      type: "ENTER",
      lat: SITE_LAT + 0.05,
      lon: SITE_LON,
      accuracyM: 10,
      timestampMs: enteredAt,
      source: "gps",
      reliable: true,
      siteId: siteB,
    });
    await GeofenceRuntimeService.observeSample({
      lat: SITE_LAT + 0.05,
      lon: SITE_LON,
      accuracyM: 10,
      timestampMs: exitAt + 10 * 60_000,
    });
    const arrived = (await PersistenceService.getSession(s.id))!;
    expect(arrived.domainStatus).toBe("ACTIVA");
    expect(arrived.siteId).toBe(siteB);
    expect(arrived.transitSegments[0].startAtMs).toBe(exitAt);
    expect(arrived.transitSegments[0].endAtMs).toBe(enteredAt);
    expect(Math.round((arrived.transitSegments[0].endAtMs! - arrived.transitSegments[0].startAtMs) / 60_000)).toBe(5);

    const start = arrived.actualStartAtMs!;
    time.jumpWall(4 * 60_000);
    expect((await mustDispatch({ type: "INTEGRITY_DEGRADE", cause: "CLOCK_DRIFT" })).integrityClass).toBe("CONFLICT");
    await mustDispatch({
      type: "MANUAL_PATCH",
      sessionId: s.id,
      declaredStartAtMs: start + 60_000,
      endAtMs: null,
      note: "reloj",
    });
    time.jumpWall(-4 * 60_000);
    TimeAuthorityService.reanchor();
    const kept = await mustDispatch({ type: "RESOLVE_KEEP_GPS", sessionId: s.id });
    expect(kept.actualStartAtMs).toBe(start);
    expect(kept.transitSegments[0].startAtMs).toBe(exitAt);
    expect(kept.transitSegments[0].endAtMs).toBe(enteredAt);
  });

  test("la bitácora no guarda coordenadas", async () => {
    const { siteA } = await seedWorld();
    const s = await mustDispatch({ type: "START_DAY", siteId: siteA });
    LocationMock.__setPosition(SITE_LAT, SITE_LON, 500);
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: ENTER, region: region(s.id, siteA) });
    const raw = JSON.stringify(await PersistenceService.getKv(KV_KEYS.GEOFENCE_DIAG));
    expect(raw).toContain("ACCURACY_GT_RADIUS");
    expect(raw).not.toContain(String(SITE_LAT));
    expect(raw).not.toContain("latitude");
    expect(raw).not.toContain("\"lat\"");
  });

  test("F01: el EXIT en frío publica N07 en la misma ejecución, sin esperar al temporizador", async () => {
    const originalOs = Platform.OS;
    Object.defineProperty(Platform, "OS", { configurable: true, value: "android" });
    const timers: number[] = [];
    const real = global.setTimeout;
    global.setTimeout = ((fn: TimerHandler, ms?: number, ...rest: unknown[]) => {
      timers.push(ms ?? 0);
      return real(fn as Parameters<typeof setTimeout>[0], ms, ...(rest as []));
    }) as typeof setTimeout;
    try {
      const { siteA } = await seedWorld();
      const s = await startAndArrive(siteA);
      time.travel(8 * HOUR);
      LocationMock.__setPosition(SITE_LAT + 0.01, SITE_LON, 10);
      await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: EXIT, region: region(s.id, siteA) });
      expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ACTIVA");
      const notes = notificationState.scheduled as { identifier?: string; content: { data?: { kind?: string }; channelId?: string; categoryIdentifier?: string } }[];
      const n07 = notes.find((n) => n.content.data?.kind === "EXIT_DECISION");
      expect(n07?.identifier).toBe(`dualtracker-exit-${s.id}`);
      expect(n07?.content.channelId).toBe("default");
      expect(n07?.content.categoryIdentifier).toBe(NOTIFICATION_CATEGORIES.EXIT_DETECTION);
      const channel = notificationState.channels.get("default") as { importance?: number } | undefined;
      expect(channel?.importance).toBe(Notifications.AndroidImportance.MAX);
      expect(timers.length).toBeGreaterThan(0);
      expect(notes.some((n) => n.identifier === `dualtracker-exit-remind-${s.id}`)).toBe(true);
      expect(notes.some((n) => n.identifier === `dualtracker-exit-close-${s.id}`)).toBe(true);
    } finally {
      global.setTimeout = real;
      Object.defineProperty(Platform, "OS", { configurable: true, value: originalOs });
    }
  });

  test("A03: un EXIT entregado 6 min tarde usa la última lectura dentro", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(8 * HOUR);
    const insideAt = time.now();
    await GeofenceRuntimeService.observeSample({ lat: SITE_LAT, lon: SITE_LON, accuracyM: 10, timestampMs: insideAt });
    time.travel(6 * MIN);
    LocationMock.__setPosition(SITE_LAT + 0.01, SITE_LON, 10);
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: EXIT, region: region(s.id, siteA) });
    expect(await GeofenceRuntimeService.getPendingExit()).toMatchObject({ firstExitAtMs: insideAt });
    time.travel(3 * MIN);
    expect(await GeofenceRuntimeService.checkPendingExit()).toBe(true);
    expect((await PersistenceService.getSession(s.id))?.bookkeeping.firstExitAtMs).toBe(insideAt);
  });

  test("T03/C21: dos lecturas y 2 min fichan con la hora de la primera; una lectura no", async () => {
    const { siteA } = await seedWorld();
    const settings = await SettingsService.load();
    await SettingsService.saveCompany({ ...settings.company, arrivalDwellMs: 2 * MIN, arrivalReadings: 2 });
    const s = await mustDispatch({ type: "START_DAY", siteId: siteA });
    const firstAt = time.now();
    await GeofenceRuntimeService.observeSample({ lat: SITE_LAT, lon: SITE_LON, accuracyM: 12, timestampMs: firstAt });
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ESPERANDO");
    const hold = await PersistenceService.getKv<{ goodReadings?: number }>(KV_KEYS.ARRIVAL_DWELL);
    expect(hold?.goodReadings).toBe(1);
    const notes = notificationState.scheduled as { identifier?: string; content: { data?: { kind?: string } } }[];
    expect(notes.some((n) => n.identifier === `dualtracker-arrival-${s.id}` && n.content.data?.kind === "ARRIVAL_HOLD")).toBe(true);
    time.travel(2 * MIN);
    expect(await GeofenceRuntimeService.flushArrivalDwell()).toBe(false);
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ESPERANDO");
    await GeofenceRuntimeService.observeSample({ lat: SITE_LAT, lon: SITE_LON, accuracyM: 12, timestampMs: time.now() });
    const arrived = await PersistenceService.getSession(s.id);
    expect(arrived?.domainStatus).toBe("ACTIVA");
    expect(arrived?.actualStartAtMs).toBe(firstAt);
    expect(await PersistenceService.listSpatialFacts(s.id, ["ENTER"])).toHaveLength(1);
    const arrival = notes.filter((n) => n.identifier === `dualtracker-arrival-${s.id}`);
    expect(arrival[0]?.content.data?.kind).toBe("ARRIVAL_HOLD");
    expect(arrival.at(-1)?.content.data?.kind).toBe("ARRIVAL_REGISTERED");
  });

  test("E01: salir durante la espera borra N03 y no ficha", async () => {
    const { siteA } = await seedWorld();
    const settings = await SettingsService.load();
    await SettingsService.saveCompany({ ...settings.company, arrivalDwellMs: 2 * MIN });
    const s = await mustDispatch({ type: "START_DAY", siteId: siteA });
    await GeofenceRuntimeService.observeSample({ lat: SITE_LAT, lon: SITE_LON, accuracyM: 10, timestampMs: time.now() });
    LocationMock.__setPosition(SITE_LAT + 0.01, SITE_LON, 10);
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: EXIT, region: region(s.id, siteA) });
    expect(await PersistenceService.getKv(KV_KEYS.ARRIVAL_DWELL)).toBeNull();
    expect((notificationState.dismissed as string[]).includes(`dualtracker-arrival-${s.id}`)).toBe(true);
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ESPERANDO");
  });

  test("N06: 10 min quieto fuera del radio avisa una vez y no cambia el estado", async () => {
    const { siteA } = await seedWorld();
    const s = await mustDispatch({ type: "START_DAY", siteId: siteA });
    const far = { lat: SITE_LAT + 300 / 111_320, lon: SITE_LON, accuracyM: 10, timestampMs: time.now() };
    await GeofenceRuntimeService.observeSample(far);
    time.travel(10 * MIN);
    await GeofenceRuntimeService.observeSample({ ...far, timestampMs: time.now() });
    const notes = notificationState.scheduled as { content: { data?: { kind?: string } } }[];
    expect(notes.filter((n) => n.content.data?.kind === "OFFSITE")).toHaveLength(1);
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ESPERANDO");
    time.travel(MIN);
    await GeofenceRuntimeService.observeSample({ ...far, timestampMs: time.now() });
    expect(notes.filter((n) => n.content.data?.kind === "OFFSITE")).toHaveLength(1);
  });

  test("F04: cancelar el traslado fuera del origen no abre SALIDA con el EXIT de re-registro", async () => {
    const { siteA, siteB } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(HOUR);
    await mustDispatch({ type: "TRANSFER_START", toSiteId: siteB });
    time.travel(20 * MIN);
    LocationMock.__setPosition(SITE_LAT + 0.05, SITE_LON, 10);
    await mustDispatch({ type: "TRANSFER_CANCEL" });
    expect(await GeofenceRuntimeService.startMonitoring(s.id, siteA)).toBe(true);
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: EXIT, region: region(s.id, siteA) });
    time.travel(6_000);
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: EXIT, region: region(s.id, siteA) });
    const after = (await PersistenceService.getSession(s.id))!;
    expect(after.domainStatus).toBe("ACTIVA");
    expect(after.bookkeeping.firstExitAtMs).toBeNull();
    expect(await GeofenceRuntimeService.getPendingExit()).toBeNull();
    const ledger = await IntegrityLedgerService.listForSession(s.id);
    expect(ledger.some((e) => e.intent === "EXIT_DETECTED")).toBe(false);
    const notes = notificationState.scheduled as { content: { data?: { kind?: string } } }[];
    expect(notes.some((n) => n.content.data?.kind === "RETURN_OR_FINISH")).toBe(true);
    const guard = await PersistenceService.getKv<{ atMs: number }>(KV_KEYS.REREGISTER_EXIT_GUARD);
    expect(guard?.atMs).toBeTruthy();
    await NotificationService.init({
      intent: async (intent, sessionId) => {
        await SessionEngineService.dispatch(intent, "NOTIFICATION");
      },
      ui: () => {},
    });
    (Notifications as unknown as { __emit: (r: unknown) => void }).__emit({
      actionIdentifier: NOTIFICATION_ACTIONS.FINISH_SHIFT,
      notification: { request: { identifier: `dualtracker-return-${s.id}`, content: { data: { sessionId: s.id, kind: "RETURN_OR_FINISH" } } } },
    });
    const until = Date.now() + 2000;
    let finished = (await PersistenceService.getSession(s.id))!;
    while (finished.domainStatus !== "SALIDA" && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 20));
      finished = (await PersistenceService.getSession(s.id))!;
    }
    expect(finished.domainStatus).toBe("SALIDA");
    expect(finished.bookkeeping.firstExitAtMs).toBe(guard!.atMs);
  });
});
