/**
 * intentRouter — Aplicación
 * ============================================================================
 * Traduce ViewIntent (vocabulario de la app, Propuesta de Producto §4 y §6)
 * al servicio que corresponde. Es lo único que useWorkTracker().emit llama.
 * Las vistas no conocen servicios: solo emiten intenciones.
 *
 *  - Intenciones de jornada → SessionEngineService (origen UI).
 *  - Destinos → SiteRegistryService.
 *  - Reportes → EvidencePackService / ReportService.
 *  - Ajustes → SettingsService + SecurityService + DualDisclosureService.
 *  - Salud → PermissionsHealthService.
 * Todo rechazo produce un FeedbackPayload (FeedbackService), nunca texto en la vista.
 */
import type { IntentResult, SessionIntent, ViewIntent } from "../../core/contracts";
import { Store, StoreActions } from "../../core/store";
import { setLanguage } from "../../i18n";
import { serializeError } from "../../utils/serializeError";
import { DualDisclosureService } from "../domain/DualDisclosureService";
import { SessionEngineService } from "../domain/SessionEngineService";
import { SiteRegistryService } from "../domain/SiteRegistryService";
import { EvidencePackService } from "../evidence/EvidencePackService";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { LoggingService } from "../persistence/LoggingService";
import { SettingsService } from "../persistence/SettingsService";
import { NotificationService } from "../runtime/NotificationService";
import { PermissionsHealthService } from "../runtime/PermissionsHealthService";
import { SecurityService } from "../runtime/SecurityService";
import { FeedbackService } from "./FeedbackService";
import { confirmExit, generateWeeklyPayroll, startDay } from "./useCases";

function toSessionIntent(i: ViewIntent): SessionIntent | null {
  switch (i.type) {
    case "CANCEL_DAY":
      return { type: "CANCEL_DAY" };
    case "CONFIRM_ARRIVAL":
      return { type: "ARRIVAL_CONFIRMED" };
    case "START_LUNCH":
      return { type: "LUNCH_START" };
    case "RESUME":
      return { type: "RESUME" };
    case "START_TRANSFER":
      return { type: "TRANSFER_START", toSiteId: i.toSiteId };
    case "CANCEL_TRANSFER":
      return { type: "TRANSFER_CANCEL" };
    case "STAY_WORKING":
      return { type: "STAY_WORKING" };
    case "CLOSE_DAY":
      return { type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: i.lunchDeductedMinutes ?? null };
    case "PATCH_SESSION":
      return { type: "MANUAL_PATCH", sessionId: i.sessionId, declaredStartAtMs: i.declaredStartAtMs, endAtMs: i.endAtMs, note: i.note };
    case "ADD_NOTE":
      return { type: "ADD_NOTE", sessionId: i.sessionId, note: i.note };
    case "DELETE_SESSION":
      return { type: "DELETE_SESSION", sessionId: i.sessionId };
    case "RESOLVE_KEEP_GPS":
      return { type: "RESOLVE_KEEP_GPS", sessionId: i.sessionId, note: i.note ?? null };
    case "RESOLVE_MANUAL":
      return { type: "RESOLVE_MANUAL", sessionId: i.sessionId, note: i.note };
    case "RESOLVE_SPLIT":
      return { type: "RESOLVE_SPLIT", sessionId: i.sessionId, splitAtMs: i.splitAtMs, note: i.note };
    default:
      return null;
  }
}

function report<T>(r: IntentResult<T>): IntentResult<T> {
  if (!r.ok) FeedbackService.rejected(String(r.code));
  return r;
}

export async function routeIntent(intent: ViewIntent): Promise<IntentResult<unknown>> {
  try {
    // ---- Jornada ----
    if (intent.type === "START_DAY") {
      const { result } = await startDay({ siteId: intent.siteId, clientId: intent.clientId, note: intent.note });
      return report(result);
    }
    if (intent.type === "CONFIRM_EXIT") return report(await confirmExit(intent.lunchDeductedMinutes));
    const sessionIntent = toSessionIntent(intent);
    if (sessionIntent) return report(await SessionEngineService.dispatch(sessionIntent, "UI"));

    const state = Store.getState();
    switch (intent.type) {
      case "OPEN_TRACE":
        return { ok: true }; // navegación pura; no muta nada

      // ---- Destinos ----
      case "UPSERT_SITE": {
        const r = await SiteRegistryService.upsert(intent.site, state.settings.company);
        if (!r.ok) return report({ ok: false, code: r.code });
        StoreActions.siteUpserted(r.site);
        FeedbackService.emit("SITE_SAVED");
        return { ok: true, data: r.site };
      }
      case "ARCHIVE_SITE": {
        const r = await SiteRegistryService.archive(intent.siteId);
        if (!r.ok) return report({ ok: false, code: r.code });
        StoreActions.siteUpserted(r.site);
        FeedbackService.emit("SITE_ARCHIVED");
        return { ok: true };
      }

      // ---- Reportes ----
      case "SEAL_PACK": {
        const r = await generateWeeklyPayroll(intent.periodStart, intent.periodEnd, intent.allowUncertified ?? false, intent.reissue ?? false);
        if (r.ok) FeedbackService.emit(r.reused ? "PACK_REUSED" : "PACK_SEALED", { hash: r.data.manifest.packHash.slice(0, 12) });
        return r.ok ? r : report(r);
      }
      case "SHARE_EMPLOYEE":
        return report(await EvidencePackService.shareEmployee(intent.packId));
      case "SHARE_EMPLOYER":
        return report(await EvidencePackService.shareEmployer(intent.packId));

      // ---- Ajustes ----
      case "SAVE_SETTINGS": {
        const unlocked = SecurityService.isUnlocked();
        // Interpretación: la tarifa se fija en el alta, pero después es campo de zona admin (§5.14).
        if (intent.patch.profile?.hourlyRate !== undefined && intent.patch.profile.hourlyRate !== state.settings.profile.hourlyRate && !unlocked) {
          return report({ ok: false, code: "ADMIN_LOCKED" });
        }
        const r = await SettingsService.applyPatch(state.settings, intent.patch, { adminUnlocked: unlocked });
        if (!r.ok) return report({ ok: false, code: r.code });
        StoreActions.settingsReplaced(r.next);
        setLanguage(r.next.profile.language);
        if (r.next.profile.dailyReminderTime !== state.settings.profile.dailyReminderTime) {
          await NotificationService.scheduleDailyReminder(r.next.profile.dailyReminderTime);
        }
        FeedbackService.emit("SETTINGS_SAVED");
        return { ok: true };
      }
      case "UNLOCK_ADMIN": {
        const r = await SecurityService.unlock(intent.pin);
        if (r.ok) FeedbackService.emit("ADMIN_UNLOCKED");
        else if (r.code === "ADMIN_LOCKOUT") {
          const minutes = r.lockedUntilMs ? Math.max(1, Math.ceil((r.lockedUntilMs - TimeAuthorityService.now()) / 60000)) : 1;
          FeedbackService.emit("ADMIN_LOCKOUT", { minutes });
        } else if (r.code === "ADMIN_DENIED") FeedbackService.emit("ADMIN_DENIED");
        else FeedbackService.rejected(r.code);
        return r.ok ? { ok: true } : { ok: false, code: r.code };
      }
      case "LOCK_ADMIN":
        SecurityService.lock();
        FeedbackService.emit("ADMIN_LOCKED");
        return { ok: true };
      case "SETUP_ADMIN_PIN": {
        const r = await SecurityService.setPin(intent.pin);
        if (r.ok) FeedbackService.emit("ADMIN_PIN_SET");
        return report(r.ok ? { ok: true } : { ok: false, code: r.code });
      }
      case "COMPLETE_ONBOARDING": {
        const profile = { ...state.settings.profile, ...intent.profile };
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(profile.dailyReminderTime) || !(profile.hourlyRate >= 0)) {
          return report({ ok: false, code: "INVALID_VALUE" });
        }
        const device = { ...state.settings.device, onboardingCompleted: true };
        await SettingsService.saveProfile(profile);
        await SettingsService.saveDevice(device);
        StoreActions.settingsReplaced({ ...state.settings, profile, device });
        setLanguage(profile.language);
        await NotificationService.scheduleDailyReminder(profile.dailyReminderTime);
        return { ok: true };
      }
      case "ACCEPT_DISCLOSURE": {
        const device = await DualDisclosureService.accept(state.settings.device, intent.version);
        if (!device) return report({ ok: false, code: "INVALID_VALUE" });
        StoreActions.settingsReplaced({ ...state.settings, device });
        FeedbackService.emit("DISCLOSURE_ACCEPTED");
        return { ok: true };
      }

      // ---- Salud ----
      case "REQUEST_PERMISSION":
        return { ok: true, data: await PermissionsHealthService.request(intent.permission) };
      case "OPEN_OS_SETTINGS":
        await PermissionsHealthService.openOsSettings(intent.target);
        return { ok: true };

      // ---- Feedback / UI ----
      case "DISMISS_FEEDBACK":
        FeedbackService.dismiss(intent.feedbackId);
        return { ok: true };
      case "CONSUME_UI_REQUEST":
        StoreActions.uiRequestsConsumed();
        return { ok: true };
    }
    return { ok: false, code: "ILLEGAL_TRANSITION" };
  } catch (error) {
    LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", `Fallo enrutando ${intent.type}`, serializeError(error));
    FeedbackService.emit("GENERIC_ERROR");
    return { ok: false, code: "ERROR", detail: serializeError(error) };
  }
}
