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
 *  - Copia de seguridad (solo Ajustes) → useCases/appBackup.
 * Todo rechazo produce un FeedbackPayload (FeedbackService), nunca texto en la vista.
 */
import type { EvidencePack, IntentResult, OnboardingStep, SessionIntent, SettingsSnapshot, Site, ViewIntent } from "../../core/contracts";
import { selectActiveSession } from "../../core/selectors";
import type { Language } from "../../i18n";
import { Store, StoreActions } from "../../core/store";
import { setLanguage } from "../../i18n";
import { legalFlags } from "../../utils/companyPolicy";
import { serializeError } from "../../utils/serializeError";
import { DualDisclosureService } from "../domain/DualDisclosureService";
import { IntegrityLedgerService } from "../domain/IntegrityLedgerService";
import { SessionEngineService } from "../domain/SessionEngineService";
import { SiteRegistryService } from "../domain/SiteRegistryService";
import { monitoredSiteId } from "../domain/siteVisits";
import { EvidencePackService, latestPackFor, type SealResult } from "../evidence/EvidencePackService";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { LoggingService } from "../persistence/LoggingService";
import { PersistenceService } from "../persistence/PersistenceService";
import { KV_KEYS } from "../persistence/schema";
import { SettingsService } from "../persistence/SettingsService";
import { getDistanceFromLatLonInMeters } from "../../utils/geoUtils";
import { ForegroundWorkService } from "../runtime/ForegroundWorkService";
import { buildForegroundNotice } from "../runtime/monitoringSnapshot";
import { GeofenceRuntimeService } from "../runtime/GeofenceRuntimeService";
import { recordCriticalNotice } from "../runtime/criticalNotices";
import { NotificationService } from "../runtime/NotificationService";
import { PermissionsHealthService } from "../runtime/PermissionsHealthService";
import { SecurityService } from "../runtime/SecurityService";
import { MICROCOPY_REJECTIONS } from "../../i18n/microcopy";
import { FeedbackService } from "./FeedbackService";
import {
  acknowledgeLedgerBreak,
  cancelBackupImport,
  cancelCalendarChange,
  confirmExit,
  confirmBackupSaved,
  discardBackupExport,
  exportAppBackup,
  exportLedgerIncident,
  exportSupportDiagnostic,
  importAppBackup,
  previewBackupImport,
  exportRangePdf,
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
    const notice = await buildForegroundNotice(session).catch(() => null);
    await ForegroundWorkService.sync(session.domainStatus, settings.company.traceMode, { relabel: true, ...(notice ? { notice } : {}) }).catch(() => {});
  }
}

function toSessionIntent(i: ViewIntent): SessionIntent | null {
  switch (i.type) {
    case "CANCEL_DAY":
      return { type: "CANCEL_DAY" };
    case "CONFIRM_ARRIVAL":
      return { type: "ARRIVAL_CONFIRMED" };
    case "START_LUNCH":
      return { type: "LUNCH_START", kind: "LUNCH" };
    case "START_REST":
      return { type: "LUNCH_START", kind: "REST" };
    case "RESUME":
      return { type: "RESUME" };
    case "START_TRANSFER":
      return i.purpose === "ERRAND"
        ? { type: "TRANSFER_START", toSiteId: i.toSiteId, purpose: "ERRAND" }
        : { type: "TRANSFER_START", toSiteId: i.toSiteId };
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
        ...(i.waiveFirstMeal !== undefined ? { waiveFirstMeal: i.waiveFirstMeal } : {}),
        ...(i.waiveSecondMeal !== undefined ? { waiveSecondMeal: i.waiveSecondMeal } : {}),
        ...(i.mealInterrupted !== undefined ? { mealInterrupted: i.mealInterrupted } : {}),
        ...(i.restBreaksTaken !== undefined ? { restBreaksTaken: i.restBreaksTaken } : {}),
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
    case "EXTEND_SHIFT":
      return { type: "EXTEND_SHIFT" };
    case "ACK_DAY_SUMMARY":
      return { type: "ACK_DAY_SUMMARY", sessionId: i.sessionId };
    default:
      return null;
  }
}

const EXIT_ACK: ReadonlySet<string> = new Set(["STAY_WORKING", "CLOSE_DAY", "LUNCH_START", "TRANSFER_START"]);

/** El operario respondió a la salida desde la app. No cambia los minutos. */
async function acknowledgeExitChoice(before: string | undefined, sessionId: number | null): Promise<void> {
  if (before !== "SALIDA") return;
  await recordCriticalNotice({
    sessionId,
    kind: "EXIT",
    phase: "ACKNOWLEDGED",
    channel: "IN_APP",
    acceptedByOs: null,
    feedbackShown: true,
    userAcknowledged: true,
  }).catch((error) => {
    LoggingService.log("NARANJA", "NOTIFICACION", "WARN", "No se pudo anotar la respuesta a la salida", serializeError(error));
  });
}

const ONBOARDING_STEP_ORDER: readonly OnboardingStep[] = ["permissions", "profile", "ready"];

/** H-1: el marcador solo avanza; el gate reanuda en el paso más avanzado guardado. */
function furthestOnboardingStep(current: OnboardingStep | null | undefined, next: OnboardingStep): OnboardingStep {
  if (!current) return next;
  return ONBOARDING_STEP_ORDER.indexOf(next) > ONBOARDING_STEP_ORDER.indexOf(current) ? next : current;
}

function report<T>(r: IntentResult<T>): IntentResult<T> {
  if (!r.ok) {
    const detail = r.detail && r.detail in MICROCOPY_REJECTIONS.es ? r.detail : r.code;
    FeedbackService.rejected(String(detail));
  }
  return r;
}

/** ¿El pack tiene en este teléfono los dos PDF? Tras restaurar una copia en otro teléfono quedan en null. */
function packHasPdfs(pack: EvidencePack): boolean {
  return !!pack.employeePdfUri && !!pack.employerPdfUri;
}

/**
 * Pack vigente del periodo, listo para compartir («Exportar expediente» y
 * «Enviar por correo»). Nunca devuelve en silencio un pack desactualizado:
 *  - sin pack → sella (certificado);
 *  - pack que ya no coincide con el cálculo de ahora (describeFreshness) →
 *    vuelve a sellar (certificado). Si el periodo ya no se puede certificar,
 *    el sello falla con su motivo y no se comparte el pack viejo;
 *  - pack al día pero sin PDF en este teléfono → reemisión (`reissue`) con el
 *    mismo criterio de certificación que el pack original, que regenera los PDF.
 */
async function currentPackFor(periodStart: number, periodEnd: number): Promise<SealResult> {
  const latest = await latestPackFor(periodStart, periodEnd);
  let sealed: SealResult;
  if (!latest) {
    sealed = await generateWeeklyPayroll(periodStart, periodEnd, false, false);
  } else if (!(await EvidencePackService.describeFreshness(periodStart, periodEnd)).matches) {
    sealed = await generateWeeklyPayroll(periodStart, periodEnd, false, false);
  } else if (!packHasPdfs(latest)) {
    sealed = await generateWeeklyPayroll(periodStart, periodEnd, !latest.manifest.certified, true);
  } else {
    return { ok: true, data: latest, reused: true };
  }
  if (sealed.ok) FeedbackService.emit(sealed.reused ? "PACK_REUSED" : "PACK_SEALED", { hash: sealed.data.manifest.packHash.slice(0, 12) });
  return sealed;
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

/**
 * Cambio de tarifa por hora (zona admin, PIN ya verificado arriba): asiento
 * HOURLY_RATE_CHANGED en el ledger. Solo afecta a jornadas que se inicien
 * después; las ya iniciadas conservan su hourlyRateSnapshot (schema v8).
 */
async function recordHourlyRateChange(from: number, to: number): Promise<void> {
  try {
    await IntegrityLedgerService.append({
      sessionId: null,
      actor: "USER",
      intent: "HOURLY_RATE_CHANGED",
      fromState: null,
      toState: null,
      reason: "ADMIN_RATE_CHANGE",
      timestampMs: TimeAuthorityService.now(),
      integrityClass: null,
      data: { from, to },
    });
  } catch (error) {
    LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "No se pudo asentar el cambio de tarifa", serializeError(error));
  }
}

/**
 * Cambio de política de nómina (zona admin): asiento PAYROLL_POLICY_CHANGED
 * con el antes y el después de cada campo que cambió (política, multiplicador,
 * banderas legales efectivas). No congela nada: las semanas sin sellar se
 * recalculan con la política vigente y los expedientes ya sellados conservan
 * la suya (spec v1.3 §5.2 N3; PayrollEngineService.policyForPeriod).
 */
async function recordPayrollPolicyChange(prev: SettingsSnapshot["company"], next: SettingsSnapshot["company"]): Promise<void> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (prev.overtimePolicyId !== next.overtimePolicyId) changes.overtimePolicyId = { from: prev.overtimePolicyId, to: next.overtimePolicyId };
  if (prev.overtimeMultiplier !== next.overtimeMultiplier) changes.overtimeMultiplier = { from: prev.overtimeMultiplier, to: next.overtimeMultiplier };
  const fromFlags = legalFlags(prev);
  const toFlags = legalFlags(next);
  if ((Object.keys(toFlags) as (keyof typeof toFlags)[]).some((k) => fromFlags[k] !== toFlags[k])) {
    changes.payrollLegalFlags = { from: fromFlags, to: toFlags };
  }
  if (!Object.keys(changes).length) return;
  try {
    await IntegrityLedgerService.append({
      sessionId: null,
      actor: "USER",
      intent: "PAYROLL_POLICY_CHANGED",
      fromState: null,
      toState: null,
      reason: "ADMIN_POLICY_CHANGE",
      timestampMs: TimeAuthorityService.now(),
      integrityClass: null,
      data: { changes },
    });
  } catch (error) {
    LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "No se pudo asentar el cambio de política de nómina", serializeError(error));
  }
}

/**
 * Radio por defecto o modo de rastro cambiados con una jornada abierta: la
 * geocerca y el servicio en primer plano se rehacen con la política nueva.
 */
async function resyncMonitoringAfterPolicyChange(prev: SettingsSnapshot["company"], next: SettingsSnapshot["company"]): Promise<void> {
  const radiusChanged = prev.defaultRadiusM !== next.defaultRadiusM;
  const modeChanged = prev.traceMode !== next.traceMode;
  if (!radiusChanged && !modeChanged) return;
  const open = selectActiveSession(Store.getState());
  if (!open) return;
  try {
    if (radiusChanged) {
      const siteId = monitoredSiteId(open);
      const site = siteId !== null ? await PersistenceService.getSite(siteId) : null;
      if (site) await resyncGeofenceIfTarget(site);
    }
    if (modeChanged && ForegroundWorkService.shouldRun(open.domainStatus)) {
      const notice = await buildForegroundNotice(open).catch(() => null);
      await ForegroundWorkService.sync(open.domainStatus, next.traceMode, { relabel: true, ...(notice ? { notice } : {}) });
    }
  } catch (error) {
    LoggingService.log("NARANJA", "UBICACION", "WARN", "No se pudo rehacer la vigilancia tras cambiar la política", serializeError(error));
  }
}

export async function routeIntent(intent: ViewIntent): Promise<IntentResult<unknown>> {
  try {
    // ---- Jornada ----
    if (intent.type === "START_DAY") {
      const { result, geofenceReady } = await startDay({ siteId: intent.siteId, clientId: intent.clientId, note: intent.note });
      return report(result.ok ? { ...result, geofenceReady } : result);
    }
    if (intent.type === "CONFIRM_ARRIVAL") {
      const open = selectActiveSession(Store.getState());
      const siteId = open ? monitoredSiteId(open) : null;
      const site = siteId != null ? await SiteRegistryService.get(siteId) : null;
      const fix = await PersistenceService.getLastFix().catch(() => null);
      const radius = site?.radiusM ?? 0;
      let manualArrival = false;
      if (fix && site && site.targetLat != null && site.targetLon != null && radius > 0) {
        manualArrival = getDistanceFromLatLonInMeters(fix.lat, fix.lon, site.targetLat, site.targetLon) > radius;
      }
      return report(await SessionEngineService.dispatch({ type: "ARRIVAL_CONFIRMED", manualArrival }, "UI"));
    }
    if (intent.type === "CONFIRM_EXIT") {
      const before = selectActiveSession(Store.getState())?.domainStatus;
      const closed = await confirmExit(intent.lunchDeductedMinutes, "UI", intent.lunchStartAtMs);
      if (closed.ok) await acknowledgeExitChoice(before, Store.getState().sessions.activeSessionId);
      return report(closed);
    }
    const sessionIntent = toSessionIntent(intent);
    if (sessionIntent) {
      const before = selectActiveSession(Store.getState())?.domainStatus;
      const result = await SessionEngineService.dispatch(sessionIntent, "UI");
      if (result.ok && EXIT_ACK.has(sessionIntent.type)) await acknowledgeExitChoice(before, result.data?.session.id ?? null);
      return report(result);
    }

    const state = Store.getState();
    switch (intent.type) {
      case "OPEN_TRACE":
        return { ok: true }; // navegación pura; no muta nada

      // ---- Destinos ----
      case "UPSERT_SITE": {
        if (intent.site.id) {
          const existing = await PersistenceService.getSite(intent.site.id);
          const radiusChanged = !!existing && intent.site.radiusM !== undefined && intent.site.radiusM !== (existing.radiusM ?? null);
          const dwellChanged = !!existing && intent.site.arrivalDwellMs !== undefined && (intent.site.arrivalDwellMs ?? null) !== (existing.arrivalDwellMs ?? null);
          if ((radiusChanged || dwellChanged) && !SecurityService.isUnlocked()) return report({ ok: false, code: "ADMIN_LOCKED" });
        } else {
          // Alta con radio o espera propios = misma regla que al editarlos. El
          // radio de la empresa (o ninguno, como el alta rápida de Hoy) no pide PIN.
          const ownRadius = intent.site.radiusM != null && intent.site.radiusM !== state.settings.company.defaultRadiusM;
          const ownDwell = intent.site.arrivalDwellMs != null;
          if ((ownRadius || ownDwell) && !SecurityService.isUnlocked()) return report({ ok: false, code: "ADMIN_LOCKED" });
        }
        const r = await SiteRegistryService.upsert(intent.site, state.settings.company);
        if (!r.ok) return report({ ok: false, code: r.code });
        StoreActions.siteUpserted(r.site);
        await resyncGeofenceIfTarget(r.site);
        FeedbackService.emit("SITE_SAVED");
        return { ok: true, data: r.site, geocoded: r.geocoded };
      }
      case "LOCATE_SITE": {
        // Fijar el primer punto («Estoy aquí» de un destino sin ubicar) no pide
        // PIN; mover un punto que ya existe, sí (como cambiar el radio).
        const target = await PersistenceService.getSite(intent.siteId);
        const hasPoint = !!target && target.targetLat !== null && target.targetLon !== null;
        if (hasPoint && !SecurityService.isUnlocked()) return report({ ok: false, code: "ADMIN_LOCKED" });
        const r = await SiteRegistryService.locate(intent.siteId, intent.readings);
        if (!r.ok) return report({ ok: false, code: r.code });
        StoreActions.siteUpserted(r.site);
        await resyncGeofenceIfTarget(r.site);
        FeedbackService.emit("SITE_SAVED");
        return { ok: true, data: { site: r.site, placeName: r.placeName } };
      }
      case "ARCHIVE_SITE": {
        // Hito 5 (G-1): el sitio de la jornada abierta, o el destino de su
        // traslado en curso, no se archiva. buildRegions siempre registra el
        // sitio vigilado y loadContext no mira `active`: archivarlo dejaría
        // la geocerca viva sobre un destino que ya no se ofrece.
        const open = await PersistenceService.getOpenSession();
        if (open && (open.siteId === intent.siteId || monitoredSiteId(open) === intent.siteId)) {
          return report({ ok: false, code: "SITE_IN_OPEN_SESSION" });
        }
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
      case "SHARE_EMPLOYER": {
        const annex = { ledger: intent.annexLedger, enterExit: intent.annexEnterExit };
        if (!intent.ensureFresh) return report(await EvidencePackService.shareEmployer(intent.packId, annex));
        // «Enviar por correo» de Reportes: el pack vigente del periodo, no uno desactualizado.
        const chosen = await EvidencePackService.get(intent.packId);
        if (!chosen) return report({ ok: false, code: "PACK_NOT_FOUND" });
        const current = await currentPackFor(chosen.manifest.periodStart, chosen.manifest.periodEnd);
        if (!current.ok) return report(current);
        const sent = await EvidencePackService.shareEmployer(current.data.id, annex);
        return sent.ok ? { ok: true, data: current.data } : report(sent);
      }
      case "EXPORT_RANGE_PDF": {
        const r = await exportRangePdf(intent.periodStart, intent.periodEnd);
        if (r.ok) FeedbackService.emit("RANGE_PDF_SHARED");
        return r.ok ? { ok: true, data: { uri: r.uri, name: r.name } } : report(r);
      }
      case "EXPORT_PACK": {
        // §16: el pack vigente del periodo; si falta, está desactualizado o no
        // tiene PDF, se sella o se reemite antes (currentPackFor). Un periodo no
        // certificable se remite al flujo de Reportes («Exportar no certificado»).
        const current = await currentPackFor(intent.periodStart, intent.periodEnd);
        if (!current.ok) return report(current);
        const shared = await EvidencePackService.shareEmployee(current.data.id);
        return shared.ok ? { ok: true, data: current.data } : report(shared);
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
        if (r.next.profile.hourlyRate !== state.settings.profile.hourlyRate) {
          await recordHourlyRateChange(state.settings.profile.hourlyRate, r.next.profile.hourlyRate);
        }
        if (rest.company) {
          await recordPayrollPolicyChange(state.settings.company, r.next.company);
          await resyncMonitoringAfterPolicyChange(state.settings.company, r.next.company);
        }
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
        // H-14: sin nombre (mínimo de Perfil, nameNeedsError) o sin el aviso vigente aceptado no se completa el alta.
        if (profile.employeeName.trim().length < 2) return report({ ok: false, code: "NAME_REQUIRED" });
        if (!DualDisclosureService.isAccepted(state.settings.device)) return report({ ok: false, code: "DISCLOSURE_NOT_ACCEPTED" });
        const device = { ...state.settings.device, onboardingCompleted: true, onboardingStep: null };
        await SettingsService.saveProfile(profile);
        await SettingsService.saveDevice(device);
        StoreActions.settingsReplaced({ ...state.settings, profile, device });
        await publishLanguage(profile.language, { ...state.settings, profile, device });
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
      case "SAVE_ONBOARDING_PROGRESS": {
        // H-1: el alta ya completa no tiene progreso que guardar.
        if (state.settings.device.onboardingCompleted) return { ok: true };
        // Los pasos que se guardan van después del aviso: sin el vigente aceptado, no hay progreso.
        if (!DualDisclosureService.isAccepted(state.settings.device)) return report({ ok: false, code: "DISCLOSURE_NOT_ACCEPTED" });
        let profile = state.settings.profile;
        if (intent.profile) {
          const employeeName = intent.profile.employeeName.trim();
          if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(intent.profile.dailyReminderTime)) return report({ ok: false, code: "INVALID_VALUE" });
          if (employeeName.length < 2) return report({ ok: false, code: "NAME_REQUIRED" });
          profile = { ...profile, employeeName, dailyReminderTime: intent.profile.dailyReminderTime };
          // Sin programar el recordatorio: solo Listo (COMPLETE_ONBOARDING) lo hace.
          await SettingsService.saveProfile(profile);
        }
        const device = { ...state.settings.device, onboardingStep: furthestOnboardingStep(state.settings.device.onboardingStep, intent.step) };
        await SettingsService.saveDevice(device);
        StoreActions.settingsReplaced({ ...state.settings, profile, device });
        return { ok: true };
      }
      case "WITHDRAW_CONSENT":
      case "REPEAT_ONBOARDING": {
        // H-5: con jornada abierta no se retira ni se repite: las rutas operativas
        // quedarían bloqueadas (Stack.Protected) con la jornada en marcha.
        if ((await PersistenceService.countOpenSessions()) > 0) {
          return report({ ok: false, code: "BACKUP_OPEN_SESSION", detail: "CONSENT_OPEN_SESSION" });
        }
        let device = state.settings.device;
        if (intent.type === "WITHDRAW_CONSENT") {
          // El libro va antes que el cambio: sin asiento, la retirada no se aplica.
          try {
            await IntegrityLedgerService.append({
              sessionId: null,
              actor: "USER",
              intent: "CONSENT_WITHDRAWN",
              fromState: null,
              toState: null,
              reason: "USER_WITHDRAWAL",
              timestampMs: TimeAuthorityService.now(),
              integrityClass: null,
              data: { version: device.disclosureAcceptedVersion, acceptedAtMs: device.disclosureAcceptedAtMs },
            });
          } catch (error) {
            LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "No se pudo asentar la retirada del consentimiento", serializeError(error));
            return report({ ok: false, code: "PERSISTENCE_ERROR" });
          }
          device = await DualDisclosureService.withdraw(device);
        } else {
          // Repetir conserva la aceptación del aviso (versión y fecha).
          device = { ...device, onboardingCompleted: false, onboardingStep: null };
          await SettingsService.saveDevice(device);
        }
        // El recordatorio vuelve a programarse solo en Listo (COMPLETE_ONBOARDING).
        await NotificationService.cancelDailyReminder();
        StoreActions.settingsReplaced({ ...state.settings, device });
        return { ok: true };
      }

      // ---- Copia de seguridad (solo Ajustes) ----
      case "EXPORT_BACKUP": {
        // Compartir no confirma que el archivo se guardara: el aviso de éxito
        // sale con CONFIRM_BACKUP_SAVED.
        const r = await exportAppBackup(intent.passphrase);
        return report(r);
      }
      case "CONFIRM_BACKUP_SAVED": {
        const r = await confirmBackupSaved(intent.token);
        if (r.ok) FeedbackService.emit("BACKUP_CREATED");
        return r.ok ? r : report(r);
      }
      case "DISCARD_BACKUP_EXPORT":
        discardBackupExport();
        return { ok: true };
      case "PREVIEW_BACKUP_IMPORT": {
        const r = await previewBackupImport(intent.passphrase);
        // Cerrar el selector sin elegir no es un error que haya que avisar.
        if (!r.ok && r.code === "BACKUP_PICK_CANCELLED") return r;
        return report(r);
      }
      case "IMPORT_BACKUP": {
        const r = await importAppBackup(intent.token);
        if (r.ok) FeedbackService.emit("BACKUP_RESTORED");
        return report(r);
      }
      case "CANCEL_BACKUP_IMPORT":
        cancelBackupImport();
        return { ok: true };

      // ---- Salud ----
      case "REQUEST_PERMISSION":
        return { ok: true, data: await PermissionsHealthService.request(intent.permission) };
      case "OPEN_OS_SETTINGS": {
        const opened = await PermissionsHealthService.openOsSettings(intent.target);
        if (!opened) {
          FeedbackService.emit("GENERIC_ERROR");
          return { ok: false, code: "OS_SETTINGS_OPEN_FAILED" };
        }
        return { ok: true };
      }

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
      case "AUTO_CLOSE_BANNER_SEEN":
        await PersistenceService.deleteKv(KV_KEYS.AUTO_CLOSE_BANNER).catch(() => {});
        if (intent.dismiss) StoreActions.uiRequest({ autoCloseBanner: null });
        return { ok: true };
    }
    return { ok: false, code: "ILLEGAL_TRANSITION" };
  } catch (error) {
    LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", `Fallo enrutando ${intent.type}`, serializeError(error));
    FeedbackService.emit("GENERIC_ERROR");
    return { ok: false, code: "ERROR", detail: serializeError(error) };
  }
}
