/** Ajustes: la zona admin rechaza una política imposible y guarda la zona. */
import { StoreActions } from "../../../src/core/store";
import { routeIntent } from "../../../src/services/application/intentRouter";
import { SettingsService } from "../../../src/services/persistence/SettingsService";
import { SecurityService } from "../../../src/services/runtime/SecurityService";
import { activeCorporateTimezone } from "../../../src/utils/dateUtils";
import { t } from "../../../src/i18n";

describe("app/(tabs) ajustes", () => {
  test("una retención negativa no se guarda; la zona de Nueva York sí", async () => {
    const settings = await SettingsService.load();
    StoreActions.settingsReplaced(settings);
    expect((await SecurityService.setPin("123456")).ok).toBe(true);
    expect((await SecurityService.unlock("123456")).ok).toBe(true);
    const bad = await routeIntent({ type: "SAVE_SETTINGS", patch: { company: { traceRetentionDays: -5, exitDebounceMs: 0 } } });
    expect(bad).toMatchObject({ ok: false, code: "INVALID_VALUE" });
    const good = await routeIntent({ type: "SAVE_SETTINGS", patch: { company: { timezone: "America/New_York" } } });
    expect(good.ok).toBe(true);
    expect((await SettingsService.load()).company.timezone).toBe("America/New_York");
    expect(activeCorporateTimezone()).toBe("America/New_York");
    expect(t("settings.timezoneHint", {}, "es")).toMatch(/California/);
    expect(t("settings.timezoneHint", {}, "en")).toMatch(/California/);
  });
});
