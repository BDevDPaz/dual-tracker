/**
 * DAILY_REMINDER (Propuesta Técnica §7.2) — trigger diario local.
 * Reprograma el recordatorio con la hora del perfil (portado de
 * scheduleDailyMorningNotification de GEOTrack).
 */
import { SettingsService } from "../../persistence/SettingsService";
import { NotificationService } from "../NotificationService";

export async function runDailyReminder(): Promise<boolean> {
  const settings = await SettingsService.load();
  return NotificationService.scheduleDailyReminder(settings.profile.dailyReminderTime);
}
