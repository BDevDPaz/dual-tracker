/** T5 — PermissionsHealth: denied de background degrada integridad, no crashea. */
import { Store } from "../../../core/store";
import { INITIAL_HEALTH } from "../../../core/store/initialState";
import { SessionEngineService } from "../../domain/SessionEngineService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { PermissionsHealthService } from "../PermissionsHealthService";
import { seedWorld, startAndArrive } from "../../../../test/helpers";
import { LocationMock } from "../../../../test/runtimeHarness";
import { time } from "../../../../test/time";

describe("PermissionsHealthService", () => {
  afterEach(() => PermissionsHealthService.setOnBackgroundRevoked(null));

  test("refresh publica el snapshot en el store", async () => {
    await PersistenceService.init();
    const h = await PermissionsHealthService.refresh();
    expect(h).toMatchObject({ locationForeground: "granted", locationBackground: "granted", clockDriftExceeded: false, checkedAtMs: time.now() });
    expect(Store.getState().health.locationBackground).toBe("granted");
  });

  test("revocar background con jornada abierta → CONFLICT vía handler (ruta de boot)", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    PermissionsHealthService.setOnBackgroundRevoked(async () => {
      await SessionEngineService.dispatch({ type: "INTEGRITY_DEGRADE", cause: "BACKGROUND_PERMISSION_MISSING" }, "SYSTEM");
    });
    await PermissionsHealthService.refresh();
    LocationMock.__setPermissions({ background: "denied", canAskAgain: false });
    const h = await PermissionsHealthService.refresh();
    expect(h.locationBackground).toBe("blocked");
    const after = (await PersistenceService.getSession(s.id))!;
    expect(after.integrityClass).toBe("CONFLICT");
    expect(after.bookkeeping.integrityReason).toBe("BACKGROUND_PERMISSION_MISSING");
  });

  test("un fallo leyendo permisos no crashea", async () => {
    await PersistenceService.init();
    jest.spyOn(LocationMock, "getForegroundPermissionsAsync").mockRejectedValue(new Error("native"));
    await expect(PermissionsHealthService.refresh()).resolves.toBeTruthy();
  });

  test("blocksValid: background, deriva o servicios apagados impiden VALID", () => {
    const ok = { ...INITIAL_HEALTH, locationBackground: "granted" as const, locationServicesEnabled: true };
    expect(PermissionsHealthService.blocksValid(ok)).toBe(false);
    expect(PermissionsHealthService.blocksValid({ ...ok, locationBackground: "denied" })).toBe(true);
    expect(PermissionsHealthService.blocksValid({ ...ok, clockDriftExceeded: true })).toBe(true);
    expect(PermissionsHealthService.blocksValid({ ...ok, locationServicesEnabled: false })).toBe(true);
  });

  test("request de background exige primero foreground", async () => {
    await PersistenceService.init();
    LocationMock.__setPermissions({ foreground: "denied" });
    expect(await PermissionsHealthService.request("locationBackground")).toBe("denied");
  });
});
