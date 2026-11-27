/**
 * Hito 5 (Solicitud 6) — G-3 / G-11, opción B (D-17).
 * El plazo de la hoja de salida no sobrevive a la muerte del proceso: al
 * arrancar con la jornada en SALIDA, boot() borra EXIT_DECISION, anota
 * EXIT_REOPEN y reabre la hoja (exitReopened). El proceso nuevo no hereda el
 * cierre automático aunque el plazo ya haya vencido y el fix diga «fuera».
 */
import { boot } from "../boot";
import { Store } from "../store";
import { PersistenceService } from "../../services/persistence/PersistenceService";
import { KV_KEYS } from "../../services/persistence/schema";
import { TaskOrchestratorService } from "../../services/runtime/TaskOrchestratorService";
import { runExitDecisionTimer, type ExitDecisionDeadline } from "../../services/runtime/tasks/exitDecisionTimer.task";
import { HOUR, MIN } from "../../../test/fixtures/session.fixture";
import { makeExit, SITE_LAT, SITE_LON } from "../../../test/fixtures/spatial.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../test/helpers";
import { LocationMock } from "../../../test/runtimeHarness";
import { time } from "../../../test/time";

describe("boot con la jornada en SALIDA (D-17)", () => {
  // boot() arranca el bucle de primer plano (setInterval del heartbeat).
  afterAll(() => TaskOrchestratorService.stopForegroundLoop());

  test("reabre la hoja (EXIT_REOPEN + exitReopened) y no cierra aunque el plazo haya vencido", async () => {
    const { siteA } = await seedWorld();
    const started = await startAndArrive(siteA);
    time.travel(2 * HOUR);
    const firstExit = time.now();
    await mustDispatch({ type: "EXIT_DETECTED", fact: makeExit({ sessionId: started.id, timestampMs: firstExit }) }, "GEOFENCE");
    // Lo que dejó el proceso que mostró la hoja antes de morir: el plazo en KV.
    // El flag en memoria (failsafeArmedInProcess) no existe en este proceso.
    const deadline: ExitDecisionDeadline = { sessionId: started.id, firstExitAtMs: firstExit, deadlineMs: firstExit + 15 * MIN };
    await PersistenceService.setKv(KV_KEYS.EXIT_DECISION, deadline);
    time.travel(20 * MIN);
    LocationMock.__setPosition(SITE_LAT + 0.05, SITE_LON, 10);

    await boot();

    expect(await PersistenceService.getKv(KV_KEYS.EXIT_DECISION)).toBeNull();
    expect(await PersistenceService.getKv(KV_KEYS.EXIT_REOPEN)).toBe(started.id);
    expect(Store.getState().uiRequests).toMatchObject({ openExitModal: true, exitReopened: true });

    // Ni el temporizador ni el arranque cierran: la jornada sigue en SALIDA.
    expect(await runExitDecisionTimer()).toBe(false);
    const open = (await PersistenceService.getSession(started.id))!;
    expect(open.domainStatus).toBe("SALIDA");
    expect(open.bookkeeping.firstExitAtMs).toBe(firstExit);
  });
});
