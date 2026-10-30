import * as Notifications from "expo-notifications";
import { setupNotifications, scheduleDailyReminder, notifyImmediate } from "../Notifications";

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

jest.mock("../../utils/logger", () => ({
  log: jest.fn(),
}));

jest.mock("../../database/db", () => ({
  getSettings: jest.fn(),
}));

describe("Notifications Service - Hardened", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("setupNotifications", () => {
    it("debe retornar true si el permiso ya está concedido", async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: "granted",
      });
      const result = await setupNotifications();
      expect(result).toBe(true);
      expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    });

    it("debe solicitar permisos si no están concedidos y retornar true si se conceden", async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: "undetermined",
      });
      (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
        status: "granted",
      });
      const result = await setupNotifications();
      expect(result).toBe(true);
      expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
    });
  });

  describe("scheduleDailyReminder", () => {
    it("no debe programar si no hay permisos", async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: "denied",
      });
      await scheduleDailyReminder("08:00");
      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    });

    it("debe programar si todo es válido", async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: "granted",
      });
      await scheduleDailyReminder("09:00");
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          trigger: expect.objectContaining({ hour: 9, minute: 0 }),
        }),
      );
    });
  });

  describe("notifyImmediate", () => {
    it("debe deduplicar notificaciones idénticas (anti-spam)", async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: "granted",
      });
      await notifyImmediate("Spam", "Check");
      await notifyImmediate("Spam", "Check");
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    });
  });
});
