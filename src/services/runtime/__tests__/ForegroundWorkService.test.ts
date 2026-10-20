/** T5 — ForegroundWork: política start/stop por estado (no el servicio Android real). */
import { Platform } from "react-native";
import { BREADCRUMB_TASK_NAME } from "../../../constants/geolocation";
import { setLanguage, t } from "../../../i18n";
import { ForegroundWorkService } from "../ForegroundWorkService";
import { LocationMock } from "../../../../test/runtimeHarness";

function fgsBody(): string {
  const opts = LocationMock.__state.locationUpdates.get(BREADCRUMB_TASK_NAME) as {
    foregroundService?: { notificationBody?: string };
  };
  return opts?.foregroundService?.notificationBody ?? "";
}

describe("ForegroundWorkService", () => {
  const originalOs = Platform.OS;
  beforeEach(() => {
    Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
  });
  afterEach(async () => {
    await ForegroundWorkService.stop();
    Object.defineProperty(Platform, "OS", { value: originalOs, configurable: true });
  });

  test("shouldRun: jornada abierta, también en almuerzo", () => {
    expect(["ESPERANDO", "ACTIVA", "PAUSADA", "TRASLADO", "SALIDA"].every((s) => ForegroundWorkService.shouldRun(s as "ACTIVA"))).toBe(true);
    expect(["NO_INICIADA", "CERRADA"].some((s) => ForegroundWorkService.shouldRun(s as "ACTIVA"))).toBe(false);
  });

  test("PAUSADA mantiene el servicio en marcha", async () => {
    expect(await ForegroundWorkService.sync("ACTIVA", "BREADCRUMB")).toBe("running");
    expect(await ForegroundWorkService.sync("PAUSADA", "BREADCRUMB")).toBe("running");
    expect(await ForegroundWorkService.isRunning()).toBe(true);
    await ForegroundWorkService.stop();
  });

  test("sync arranca en ACTIVA y para en CERRADA", async () => {
    expect(await ForegroundWorkService.sync("ACTIVA", "BREADCRUMB")).toBe("running");
    expect(LocationMock.__state.locationUpdates.has(BREADCRUMB_TASK_NAME)).toBe(true);
    expect(await ForegroundWorkService.sync("ACTIVA", "BREADCRUMB")).toBe("running"); // idempotente
    expect(await ForegroundWorkService.sync("CERRADA", "BREADCRUMB")).toBe("stopped");
    expect(await ForegroundWorkService.isRunning()).toBe(false);
  });

  test("relabel reescribe la notificación del FGS; sin relabel el texto queda", async () => {
    setLanguage("es");
    expect(await ForegroundWorkService.sync("ACTIVA", "PERIMETER")).toBe("running");
    expect(fgsBody()).toBe(t("notifications.fgsBody", {}, "es"));
    setLanguage("en");
    expect(await ForegroundWorkService.sync("ACTIVA", "PERIMETER")).toBe("running");
    expect(fgsBody()).toBe(t("notifications.fgsBody", {}, "es"));
    expect(await ForegroundWorkService.sync("ACTIVA", "PERIMETER", { relabel: true })).toBe("running");
    expect(fgsBody()).toBe("Shift in progress · zone monitoring active");
    await ForegroundWorkService.stop();
    setLanguage("es");
  });

  test("en iOS arranca con deferred updates y sin foregroundService", async () => {
    Object.defineProperty(Platform, "OS", { value: "ios", configurable: true });
    expect(await ForegroundWorkService.sync("ACTIVA", "PERIMETER")).toBe("running");
    const opts = LocationMock.__state.locationUpdates.get(BREADCRUMB_TASK_NAME) as {
      deferredUpdatesInterval?: number;
      deferredUpdatesDistance?: number;
      foregroundService?: unknown;
    };
    expect(opts.deferredUpdatesInterval).toBeGreaterThan(0);
    expect(opts.deferredUpdatesDistance).toBeGreaterThan(0);
    expect(opts.foregroundService).toBeUndefined();
  });

  test("sin permiso de background no arranca (y no crashea)", async () => {
    LocationMock.__setPermissions({ background: "denied" });
    expect(await ForegroundWorkService.sync("TRASLADO", "PERIMETER")).toBe("stopped");
    expect(LocationMock.__state.locationUpdates.size).toBe(0);
  });
});
