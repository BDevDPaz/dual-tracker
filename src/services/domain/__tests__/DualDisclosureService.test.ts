/** T1 — DualDisclosure: sin aceptación no hay onboarding operable (§5.11). */
import { INITIAL_HEALTH } from "../../../core/store/initialState";
import { DISCLOSURE_VERSION } from "../../../i18n/legal";
import { DEFAULT_DEVICE_PREFS, SettingsService } from "../../persistence/SettingsService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { DualDisclosureService } from "../DualDisclosureService";
import { SessionEngineService } from "../SessionEngineService";
import { seedSite } from "../../../../test/helpers";

describe("DualDisclosureService", () => {
  beforeEach(() => PersistenceService.init());

  test("onboardingCompleted sin aceptación vigente NO es operable", async () => {
    const device = { ...DEFAULT_DEVICE_PREFS, onboardingCompleted: true, disclosureAcceptedVersion: null };
    expect(DualDisclosureService.isAccepted(device)).toBe(false);
    expect(DualDisclosureService.isAccepted({ ...device, disclosureAcceptedVersion: "2020-01-v0" })).toBe(false);
    await SettingsService.saveDevice(device);
    const siteId = await seedSite();
    const r = await SessionEngineService.dispatch({ type: "START_DAY", siteId }, "UI");
    expect(r).toMatchObject({ ok: false, code: "DISCLOSURE_NOT_ACCEPTED" });
  });

  test("accept solo con la versión vigente y persiste", async () => {
    expect(await DualDisclosureService.accept(DEFAULT_DEVICE_PREFS, "vieja")).toBeNull();
    const d = await DualDisclosureService.accept(DEFAULT_DEVICE_PREFS, DISCLOSURE_VERSION);
    expect(d && DualDisclosureService.isAccepted(d)).toBe(true);
    expect(DualDisclosureService.isAccepted((await SettingsService.load()).device)).toBe(true);
    expect(DualDisclosureService.currentVersion()).toBe(DISCLOSURE_VERSION);
  });

  test("contenido legal disponible en es/en", () => {
    expect(DualDisclosureService.getContent("es")).toBeTruthy();
    expect(DualDisclosureService.getContent("en")).toBeTruthy();
    expect(DualDisclosureService.getRetention("es", 90)).toBeTruthy();
  });

  test("modo visible: nunca rastro fuera de jornada", () => {
    const h = { ...INITIAL_HEALTH, locationForeground: "granted" as const };
    expect(DualDisclosureService.visibleMode("CERRADA", "BREADCRUMB", h)).toBe("SIN_UBICACION");
    expect(DualDisclosureService.visibleMode("NO_INICIADA", "BREADCRUMB", h)).toBe("SIN_UBICACION");
    expect(DualDisclosureService.visibleMode("ACTIVA", "BREADCRUMB", h)).toBe("RASTRO_ACTIVO");
    expect(DualDisclosureService.visibleMode("ACTIVA", "PERIMETER", h)).toBe("SOLO_GEOCERCA");
    expect(DualDisclosureService.visibleMode("ACTIVA", "BREADCRUMB", INITIAL_HEALTH)).toBe("SIN_UBICACION");
  });
});
