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
import type { IntentResult, SessionIntent, SettingsSnapshot, Site, ViewIntent } from "../../core/contracts";
import { selectActiveSession } from "../../core/selectors";
import type { Language } from "../../i18n";
import { Store, StoreActions } from "../../core/store";
import { setLanguage } from "../../i18n";
import { serializeError } from "../../utils/serializeError";
import { DualDisclosureService } from "../domain/DualDisclosureService";
import { SessionEngineService } from "../domain/SessionEngineService";
import { SiteRegistryService } from "../domain/SiteRegistryService";
import { monitoredSiteId } from "../domain/siteVisits";
import { EvidencePackService, latestPackFor } from "../evidence/EvidencePackService";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { LoggingService } from "../persistence/LoggingService";
import { SettingsService } from "../persistence/SettingsService";
import { ForegroundWorkService } from "../runtime/ForegroundWorkService";
import { GeofenceRuntimeService } from "../runtime/GeofenceRuntimeService";
import { NotificationService } from "../runtime/NotificationService";
import { PermissionsHealthService } from "../runtime/PermissionsHealthService";
import { SecurityService } from "../runtime/SecurityService";
import { MICROCOPY_REJECTIONS } from "../../i18n/microcopy";
import { FeedbackService } from "./FeedbackService";
import {
  acknowledgeLedgerBreak,
  cancelCalendarChange,
  confirmExit,
  exportLedgerIncident,
  exportSupportDiagnostic,
  generateWeeklyPayroll,
  provisionAdminPin,
  requestCalendarChange,
  startDay,
} from "./useCases";

/** Canales, botones, recordatorio y notificación del FGS en el idioma activo. */
async function publishLanguage(lang: Language, settings: SettingsSnapshot): Promise<void> {
  setLanguage(lang);
  await NotificationService.refreshLocalization(settings.profile.dailyReminderTime);
  const activeId = Store.getState().sessions.activeSessionId;
  const session = activeId !== null ? Store.getState().sessions.byId[String(activeId)] : undefined;
  if (session && ForegroundWorkService.shouldRun(session.domainStatus)) {
    await ForegroundWorkService.sync(session.domainStatus, settings.company.traceMode, { relabel: true }).catch(() => {});
  }
}

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
      return i.note?.trim() ? { type: "TRANSFER_CANCEL", note: i.note.trim() } : { type: "TRANSFER_CANCEL" };
    case "STAY_WORKING":
      return { type: "STAY_WORKING" };
    case "CLOSE_DAY":
      return {
        type: "CLOSE_DAY",
        mode: "MANUAL",
        lunchDeductedMinutes: i.lunchDeductedMinutes ?? null,
        ...(i.lunchStartAtMs != null ? { lunchStartAtMs: i.lunchStartAtMs } : {}),
      };
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
    case "CONTINUE_ORPHAN":
      return { type: "CONTINUE_ORPHAN" };
    case "CONFIRM_ORPHAN_END":
      return { type: "CONFIRM_ORPHAN_END", endAtMs: i.endAtMs, note: i.note };
    default:
      return null;
  }
}

function report<T>(r: IntentResult<T>): IntentResult<T> {
  if (!r.ok) {
    const detail = r.detail && r.detail in MICROCOPY_REJECTIONS.es ? r.detail : r.code;
    FeedbackService.rejected(String(detail));
  }
  return r;
}

/** Si el sitio editado es el que vigila la jornada abierta, la geocerca usa el radio y las coordenadas nuevos. */
async function resyncGeofenceIfTarget(site: Site): Promise<void> {
  const open = selectActiveSession(Store.getState());
  if (!open || monitoredSiteId(open) !== site.id) return;
  if (!SiteRegistryService.isGeofenceReady(site)) {
    await GeofenceRuntimeService.stopMonitoring();
    StoreActions.healthUpdated({ isMonitoring: false });
    return;
  }
  const watching = await GeofenceRuntimeService.startMonitoring(open.id, site.id);
  StoreActions.healthUpdated({ isMonitoring: watching });
}

export async function routeIntent(intent: ViewIntent): Promise<IntentResult<unknown>> {
  try {
    // ---- Jornada ----
    if (intent.type === "START_DAY") {
      const { result } = await startDay({ siteId: intent.siteId, clientId: intent.clientId, note: intent.note });
      return report(result);
    }
    if (intent.type === "CONFIRM_EXIT") return report(await confirmExit(intent.lunchDeductedMinutes, "UI", intent.lunchStartAtMs));
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
        await resyncGeofenceIfTarget(r.site);
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
        return report(await EvidencePackService.shareEmployee(intent.packId, { ledger: intent.annexLedger, enterExit: intent.annexEnterExit }));
      case "SHARE_EMPLOYER":
        return report(await EvidencePackService.shareEmployer(intent.packId, { ledger: intent.annexLedger, enterExit: intent.annexEnterExit }));
      case "EXPORT_PACK": {
        // §16: reutiliza el pack más reciente del periodo; si no hay, sella
        // (certificado; un periodo no certificable se remite al flujo de Reportes).
        let pack = await latestPackFor(intent.periodStart, intent.periodEnd);
        if (!pack) {
          const sealed = await generateWeeklyPayroll(intent.periodStart, intent.periodEnd, false, false);
          if (!sealed.ok) return report(sealed);
          FeedbackService.emit(sealed.reused ? "PACK_REUSED" : "PACK_SEALED", { hash: sealed.data.manifest.packHash.slice(0, 12) });
          pack = sealed.data;
        }
        const shared = await EvidencePackService.shareEmployee(pack.id);
        return shared.ok ? { ok: true, data: pack } : report(shared);
      }

      // ---- Ajustes ----
      case "SAVE_SETTINGS": {
        const unlocked = SecurityService.isUnlocked();
        // Interpretación: la tarifa se fija en el alta, pero después es campo de zona admin (§5.14).
        if (intent.patch.profile?.hourlyRate !== undefined && intent.patch.profile.hourlyRate !== state.settings.profile.hourlyRate && !unlocked) {
          return report({ ok: false, code: "ADMIN_LOCKED" });
        }
        const { calendar, ...rest } = intent.patch;
        let base = state.settings;
        // Cambio de calendario (spec v1.3 §5.1): zona admin, prospectivo y con asiento en el ledger.
        if (calendar) {
          if (!unlocked) return report({ ok: false, code: "ADMIN_LOCKED" });
          const c = await requestCalendarChange(base, calendar);
          if (!c.ok) return report(c);
          base = c.data!.settings;
          if (!rest.company && !rest.profile) {
            FeedbackService.emit("SETTINGS_SAVED");
            return { ok: true, data: c.data!.change };
          }
        }
        const r = await SettingsService.applyPatch(base, rest, { adminUnlocked: unlocked });
        if (!r.ok) return report({ ok: false, code: r.code });
        StoreActions.settingsReplaced(r.next);
        const langChanged = r.next.profile.language !== state.settings.profile.language;
        const timeChanged = r.next.profile.dailyReminderTime !== state.settings.profile.dailyReminderTime;
        if (langChanged) await publishLanguage(r.next.profile.language, r.next);
        else {
          setLanguage(r.next.profile.language);
          if (timeChanged) await NotificationService.scheduleDailyReminder(r.next.profile.dailyReminderTime);
        }
        FeedbackService.emit("SETTINGS_SAVED");
        return { ok: true };
      }
      case "SET_LANGUAGE": {
        if (intent.language !== "es" && intent.language !== "en") return report({ ok: false, code: "INVALID_VALUE" });
        if (intent.language === state.settings.profile.language) {
          setLanguage(intent.language);
          return { ok: true };
        }
        const profile = { ...state.settings.profile, language: intent.language };
        await SettingsService.saveProfile(profile);
        const next = { ...state.settings, profile };
        StoreActions.settingsReplaced(next);
        await publishLanguage(intent.language, next);
        return { ok: true };
      }
      case "CANCEL_CALENDAR_CHANGE": {
        if (!SecurityService.isUnlocked()) return report({ ok: false, code: "ADMIN_LOCKED" });
        const r = await cancelCalendarChange(state.settings);
        if (!r.ok) return report(r);
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
      case "PROVISION_ADMIN_PIN": {
        const r = await provisionAdminPin(intent.code, intent.fingerprint);
        if (r.ok) FeedbackService.emit("ADMIN_PIN_PROVISIONED");
        return report(r.ok ? { ok: true, data: r.data } : { ok: false, code: r.code });
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
        await publishLanguage(profile.language, { ...state.settings, profile, device });
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

      // ---- Integridad del ledger (spec v1.3 §5.5) ----
      case "ACKNOWLEDGE_LEDGER_BREAK": {
        const r = await acknowledgeLedgerBreak(intent.pin, intent.incident);
        if (r.ok) FeedbackService.emit("LEDGER_BREAK_ACKNOWLEDGED");
        return report(r);
      }
      case "EXPORT_LEDGER_INCIDENT":
        return report(await exportLedgerIncident());
      case "EXPORT_SUPPORT_DIAGNOSTIC":
        return report(await exportSupportDiagnostic());

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
