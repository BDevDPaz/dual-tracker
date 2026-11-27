/**
 * H-13, sin regresión: con el guard de rutas, un CONFLICT sin resolver sigue
 * llevando de «/» a la pantalla de conflicto (T30). Archivo aparte: varios
 * renderRouter en el mismo archivo dejaban este caso en «/» según el orden
 * (observado en el harness de expo-router, no en la app).
 */
import { renderRouter, screen, waitFor } from "expo-router/testing-library";
import { Store } from "../../core/store";
import { selectHasConflict } from "../../core/selectors";
import { TaskOrchestratorService } from "../../services/runtime/TaskOrchestratorService";
import { makeExit } from "../../../test/fixtures/spatial.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../test/helpers";
import { time } from "../../../test/time";
import { ROUTES, hydrateWith } from "./gateRoutes";

describe("Deep links y gate (H-13) · conflicto", () => {
  test("sin regresión: con un CONFLICT sin resolver «/» sigue yendo a la pantalla de conflicto", async () => {
    const { siteA } = await seedWorld();
    const open = await startAndArrive(siteA);
    time.travel(8 * 60 * 60_000);
    await mustDispatch({ type: "EXIT_DETECTED", fact: makeExit({ sessionId: open.id, timestampMs: time.now() }) }, "GEOFENCE");
    await mustDispatch({ type: "AUTO_CLOSE", cause: "EXIT_DECISION_EXPIRED", confirmedOutside: false }, "WATCHDOG");
    TaskOrchestratorService.cancelExitDecision(0);
    await hydrateWith({ onboarded: true, accepted: true });
    expect(selectHasConflict(Store.getState())).toBe(true);
    const r = renderRouter(ROUTES, { initialUrl: "/" });
    // system se presenta como modal: se comprueba la ruta y el marcador (incluido el oculto a accesibilidad).
    await waitFor(() => expect(r.getPathname()).toBe("/system/conflict"));
    expect(screen.getAllByText("CONFLICTO", { includeHiddenElements: true }).length).toBeGreaterThan(0);
    r.unmount();
  });
});
