/** Histéresis y radio mínimo del SO: sin geocerca nativa. */
import { ANDROID_MIN_OS_RADIUS_M, confirmExitDecision, effectiveJumpMeters, isFarOutside, movementIssue, osGeofenceRadius, presenceZone, shouldArmExit } from "../geofencePolicy";

describe("geofencePolicy", () => {
  test("Android no registra por debajo de 100 m; iOS conserva el radio lógico", () => {
    expect(osGeofenceRadius(80, "android")).toBe(ANDROID_MIN_OS_RADIUS_M);
    expect(osGeofenceRadius(150, "android")).toBe(150);
    expect(osGeofenceRadius(80, "ios")).toBe(80);
  });

  test("dentro del radio con precisión útil es inside; rozar el borde no es outside", () => {
    expect(presenceZone(0, 100, 80)).toBe("inside");
    expect(presenceZone(0, 100, 500)).toBe("unknown");
    expect(presenceZone(120, 100, 10)).toBe("unknown");
    expect(presenceZone(200, 100, 10)).toBe("outside");
    expect(isFarOutside(200, 100, 10)).toBe(false);
    expect(isFarOutside(400, 100, 10)).toBe(true);
  });

  test("un rebote recién llegado se tira; una salida clara se confirma al vencer el debounce", () => {
    expect(confirmExitDecision({ zone: "unknown", far: false, dwellMs: 5_000, elapsedMs: 180_000, debounceMs: 120_000, strikes: 0, pendingReliable: true })).toBe("clear");
    expect(confirmExitDecision({ zone: "inside", far: false, dwellMs: 8 * 3_600_000, elapsedMs: 180_000, debounceMs: 120_000, strikes: 3, pendingReliable: true })).toBe("clear");
    expect(confirmExitDecision({ zone: "outside", far: true, dwellMs: 5_000, elapsedMs: 10_000, debounceMs: 120_000, strikes: 0, pendingReliable: true })).toBe("wait");
    expect(confirmExitDecision({ zone: "outside", far: true, dwellMs: 5_000, elapsedMs: 130_000, debounceMs: 120_000, strikes: 0, pendingReliable: true })).toBe("confirm");
  });

  test("la banda de histéresis no confirma ni arma, aunque lleve rato fuera del centro", () => {
    expect(shouldArmExit({ zone: "unknown", far: false, dwellMs: 2 * 3_600_000 })).toBe(false);
    expect(shouldArmExit({ zone: "outside", far: false, dwellMs: 2 * 3_600_000 })).toBe(true);
    expect(
      confirmExitDecision({ zone: "unknown", far: false, dwellMs: 2 * 3_600_000, elapsedMs: 180_000, debounceMs: 120_000, strikes: 3, pendingReliable: true }),
    ).toBe("wait");
    expect(
      confirmExitDecision({ zone: "unknown", far: false, dwellMs: 2 * 3_600_000, elapsedMs: 240_000, debounceMs: 120_000, strikes: 3, pendingReliable: true }),
    ).toBe("confirm");
    expect(
      confirmExitDecision({ zone: "unknown", far: false, dwellMs: 2 * 3_600_000, elapsedMs: 180_000, debounceMs: 120_000, strikes: 3, pendingReliable: false }),
    ).toBe("clear");
  });

  test("40 km/h no es imposible; un teleport de 10 km en 5 s sí", () => {
    expect(movementIssue({ speedMps: 40 / 3.6, jumpM: null, jumpDtMs: null })).toBeNull();
    expect(movementIssue({ speedMps: null, jumpM: 10_000, jumpDtMs: 20 * 60_000 })).toBeNull();
    expect(movementIssue({ speedMps: null, jumpM: 10_000, jumpDtMs: 5_000 })).toBe("LOCATION_JUMP_DETECTED");
    expect(movementIssue({ speedMps: 80, jumpM: null, jumpDtMs: null })).toBe("IMPOSSIBLE_SPEED");
  });

  test("el error de los dos fixes se resta y por debajo de 5 s no se juzga el salto", () => {
    expect(effectiveJumpMeters(60, 40, 40)).toBe(0);
    expect(effectiveJumpMeters(300, 150, 150)).toBe(0);
    expect(effectiveJumpMeters(120_000, 10, 10)).toBe(119_980);
    expect(effectiveJumpMeters(100, undefined, null)).toBe(100);
    expect(movementIssue({ speedMps: null, jumpM: 0, jumpDtMs: 1_000 })).toBeNull();
    expect(movementIssue({ speedMps: null, jumpM: 10_000, jumpDtMs: 0 })).toBeNull();
    expect(movementIssue({ speedMps: null, jumpM: 10_000, jumpDtMs: -1 })).toBeNull();
    expect(movementIssue({ speedMps: null, jumpM: 10_000, jumpDtMs: 4_999 })).toBeNull();
    expect(movementIssue({ speedMps: null, jumpM: 10_000, jumpDtMs: 5_000 })).toBe("LOCATION_JUMP_DETECTED");
    expect(movementIssue({ speedMps: null, jumpM: 119_980, jumpDtMs: 5 * 60_000 })).toBe("LOCATION_JUMP_DETECTED");
    expect(movementIssue({ speedMps: null, jumpM: 300, jumpDtMs: 5_000 })).toBe("LOCATION_JUMP_DETECTED");
  });
});
