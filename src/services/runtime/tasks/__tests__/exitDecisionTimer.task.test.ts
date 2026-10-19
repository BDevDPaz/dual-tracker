/** T5 — exitDecisionTimer.task: usa firstExit, no lastExit. */
import * as Notifications from "expo-notifications";
import { PersistenceService } from "../../../persistence/PersistenceService";
import { KV_KEYS } from "../../../persistence/schema";
import { TaskOrchestratorService } from "../../TaskOrchestratorService";
import { runExitDecisionTimer } from "../exitDecisionTimer.task";
import { HOUR, MIN } from "../../../../../test/fixtures/session.fixture";
import { SITE_LAT, SITE_LON, makeExit } from "../../../../../test/fixtures/spatial.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../../test/helpers";
import { LocationMock } from "../../../../../test/runtimeHarness";
import { time } from "../../../../../test/time";

async function inSalida() {
  const { siteA } = await seedWorld();
  const s = await startAndArrive(siteA);
  time.travel(8 * HOUR);
  const firstExit = time.now();
  await mustDispatch({ type: "EXIT_DETECTED", fact: makeExit({ sessionId: s.id, timestampMs: firstExit }) }, "GEOFENCE");
  await TaskOrchestratorService.scheduleExitDecision(s.id, firstExit, 30 * MIN);
  return { s, firstExit };
}

describe("exitDecisionTimer.task", () => {
  // scheduleExitDecision arma un setTimeout real de primer plano: se libera tras cada caso.
  afterEach(() => TaskOrchestratorService.cancelExitDecision(0));
  test("antes del plazo no hace nada", async () => {
    await inSalida();
    time.travel(10 * MIN);
    expect(await runExitDecisionTimer()).toBe(false);
  });

  test("vencido: cierra en la PRIMERA salida (no la última ni la hora del timer)", async () => {
    const { s, firstExit } = await inSalida();
    time.travel(45 * MIN);
    LocationMock.__setPosition(SITE_LAT + 0.05, SITE_LON, 10);
    expect(await runExitDecisionTimer()).toBe(true);
    const closed = (await PersistenceService.getSession(s.id))!;
    expect(closed.endAtMs).toBe(firstExit);
    expect(closed.integrityClass).toBe("AUTO"); // salida fiable + confirmado fuera
    expect(await PersistenceService.getKv(KV_KEYS.EXIT_DECISION)).toBeNull();
    const n = Notifications as unknown as { __state: { scheduled: unknown[] } };
    expect(n.__state.scheduled.length).toBeGreaterThan(0);
  });

  test("vencido sin confirmar que está fuera → CONFLICT, nunca VALID", async () => {
    const { s } = await inSalida();
    time.travel(45 * MIN);
    await runExitDecisionTimer();
    expect((await PersistenceService.getSession(s.id))?.integrityClass).toBe("CONFLICT");
  });

  test("salida a los 10 s sin estar claramente fuera no cierra: vuelve a ACTIVA", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(10_000);
    const firstExit = time.now();
    await mustDispatch({ type: "EXIT_DETECTED", fact: makeExit({ sessionId: s.id, timestampMs: firstExit }) }, "GEOFENCE");
    await TaskOrchestratorService.scheduleExitDecision(s.id, firstExit, MIN);
    time.travel(2 * MIN);
    LocationMock.__setPosition(SITE_LAT + 120 / 111_320, SITE_LON, 10);
    expect(await runExitDecisionTimer()).toBe(false);
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ACTIVA");
  });

  test("si el usuario ya eligió STAY_WORKING, el plazo caduca sin cerrar", async () => {
    const { s } = await inSalida();
    await mustDispatch({ type: "STAY_WORKING" });
    time.travel(45 * MIN);
    expect(await runExitDecisionTimer()).toBe(false);
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ACTIVA");
  });
});
