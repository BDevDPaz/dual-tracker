/** SET_LANGUAGE persiste el idioma al momento, sin el toast de «ajustes guardados». */
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { NOTIFICATION_CHANNELS } from "../../../constants/notifications";
import { Store, StoreActions } from "../../../core/store";
import { getLanguage, setLanguage } from "../../../i18n";
import { PersistenceService } from "../../persistence/PersistenceService";
import { SettingsService } from "../../persistence/SettingsService";
import { FeedbackService } from "../FeedbackService";
import { routeIntent } from "../intentRouter";

describe("SET_LANGUAGE", () => {
  beforeEach(() => PersistenceService.init());

  test("pasa a EN, lo guarda y no avisa como si se hubiera guardado todo Ajustes", async () => {
    const settings = await SettingsService.load();
    StoreActions.settingsReplaced(settings);
    const r = await routeIntent({ type: "SET_LANGUAGE", language: "en" });
    expect(r).toMatchObject({ ok: true });
    expect(getLanguage()).toBe("en");
    expect(Store.getState().settings.profile.language).toBe("en");
    expect((await SettingsService.load()).profile.language).toBe("en");
    expect(Store.getState().settings.profile.employeeName).toBe(settings.profile.employeeName);
    expect(FeedbackService.pending().map((f) => f.code)).not.toContain("SETTINGS_SAVED");
    setLanguage("es");
  });

  test("en Android el canal de la jornada toma el nombre del idioma nuevo", async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
    try {
      await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.FOREGROUND_WORK, {
        name: "Jornada en curso",
        importance: Notifications.AndroidImportance.LOW,
      });
      const settings = await SettingsService.load();
      StoreActions.settingsReplaced(settings);
      await routeIntent({ type: "SET_LANGUAGE", language: "en" });
      const channel = await Notifications.getNotificationChannelAsync(NOTIFICATION_CHANNELS.FOREGROUND_WORK);
      expect(channel?.name).toBe("Shift in progress");
    } finally {
      Object.defineProperty(Platform, "OS", { value: original, configurable: true });
      setLanguage("es");
    }
  });

  test("el mismo idioma no reescribe el perfil", async () => {
    const settings = await SettingsService.load();
    StoreActions.settingsReplaced(settings);
    const r = await routeIntent({ type: "SET_LANGUAGE", language: "es" });
    expect(r).toMatchObject({ ok: true });
    expect(await PersistenceService.getKv("settings.profile")).toBeNull();
  });
});
