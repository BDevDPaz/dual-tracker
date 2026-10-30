import * as Notifications from "expo-notifications";
import { notificationsAdapter } from "../notificationsAdapter";
import { log } from "../../../utils/logger";

jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

jest.mock("expo-notifications", () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  dismissAllNotificationsAsync: jest.fn(),
  AndroidImportance: { MAX: 4 },
  SchedulableTriggerInputTypes: { DAILY: "daily" },
}));

jest.mock("../../../utils/logger", () => ({
  log: jest.fn(),
}));

describe("notificationsAdapter - Hardened", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("requestPermissions debe loguear errores", async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockRejectedValue(
      new Error("Permission error"),
    );
    const status = await notificationsAdapter.requestPermissions();
    expect(status).toBe("denied");
    expect(log).toHaveBeenCalled();
  });

  it("scheduleDailyReminder debe omitir si no hay permisos", async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: "denied",
    });
    await notificationsAdapter.scheduleDailyReminder("08:00");
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("notifyImmediate debe validar payload", async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: "granted",
    });
    await notificationsAdapter.notifyImmediate("", "");
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
