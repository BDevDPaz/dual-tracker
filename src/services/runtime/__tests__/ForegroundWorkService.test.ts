/** T5 — ForegroundWork: política start/stop por estado (no el servicio Android real). */
import { BREADCRUMB_TASK_NAME } from "../../../constants/geolocation";
import { ForegroundWorkService } from "../ForegroundWorkService";
import { LocationMock } from "../../../../test/runtimeHarness";

describe("ForegroundWorkService", () => {
  test("shouldRun: solo con jornada abierta y no en pausa", () => {
    expect(["ESPERANDO", "ACTIVA", "TRASLADO", "SALIDA"].every((s) => ForegroundWorkService.shouldRun(s as "ACTIVA"))).toBe(true);
    expect(["NO_INICIADA", "PAUSADA", "CERRADA"].some((s) => ForegroundWorkService.shouldRun(s as "ACTIVA"))).toBe(false);
  });

  test("sync arranca en ACTIVA y para en CERRADA", async () => {
    expect(await ForegroundWorkService.sync("ACTIVA", "BREADCRUMB")).toBe("running");
    expect(LocationMock.__state.locationUpdates.has(BREADCRUMB_TASK_NAME)).toBe(true);
    expect(await ForegroundWorkService.sync("ACTIVA", "BREADCRUMB")).toBe("running"); // idempotente
    expect(await ForegroundWorkService.sync("CERRADA", "BREADCRUMB")).toBe("stopped");
    expect(await ForegroundWorkService.isRunning()).toBe(false);
  });

  test("sin permiso de background no arranca (y no crashea)", async () => {
    LocationMock.__setPermissions({ background: "denied" });
    expect(await ForegroundWorkService.sync("TRASLADO", "PERIMETER")).toBe("stopped");
    expect(LocationMock.__state.locationUpdates.size).toBe(0);
  });
});
