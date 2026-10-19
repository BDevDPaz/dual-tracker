import { INITIAL_HEALTH } from "../store/initialState";
import { blockingIntegrityReason, sensorBlocksValid } from "../healthPolicy";

describe("healthPolicy", () => {
  const ok = { ...INITIAL_HEALTH, locationForeground: "granted" as const, locationBackground: "granted" as const, locationServicesEnabled: true, foregroundService: "running" as const };

  test("solo ubicación, servicio en primer plano y reloj bloquean VALIDADA", () => {
    expect(blockingIntegrityReason(ok, true)).toBeNull();
    expect(blockingIntegrityReason({ ...ok, locationForeground: "denied" }, false)).toBe("LOCATION_FOREGROUND_MISSING");
    expect(blockingIntegrityReason({ ...ok, locationBackground: "blocked" }, false)).toBe("BACKGROUND_PERMISSION_MISSING");
    expect(blockingIntegrityReason({ ...ok, locationServicesEnabled: false }, false)).toBe("LOCATION_SERVICES_DISABLED");
    expect(blockingIntegrityReason({ ...ok, foregroundService: "stopped" }, false)).toBeNull();
    expect(blockingIntegrityReason({ ...ok, foregroundService: "stopped" }, true)).toBe("FOREGROUND_SERVICE_STOPPED");
    expect(blockingIntegrityReason({ ...ok, foregroundService: "unknown" }, true)).toBeNull();
    expect(blockingIntegrityReason({ ...ok, clockDriftExceeded: true }, false)).toBe("CLOCK_DRIFT");
    expect(blockingIntegrityReason({ ...ok, notifications: "denied", batteryOptimization: "restricted", networkTime: "offline", isMonitoring: false }, true)).toBeNull();
  });

  test("la tabla marca aviso o bloqueo", () => {
    expect(sensorBlocksValid("locationForeground")).toBe(true);
    expect(sensorBlocksValid("clockDriftMs")).toBe(true);
    expect(sensorBlocksValid("foregroundService")).toBe(true);
    expect(sensorBlocksValid("notifications")).toBe(false);
    expect(sensorBlocksValid("batteryOptimization")).toBe(false);
    expect(sensorBlocksValid("networkTime")).toBe(false);
    expect(sensorBlocksValid("isMonitoring")).toBe(false);
  });
});
