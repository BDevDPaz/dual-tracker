/**
 * boot — arranque de Dual Tracker (Producto §3 root _layout; Técnica §5.7 y §10)
 * ============================================================================
 * Portado de bootApplication (GEOTrack, src/core/boot.ts) con el nuevo orden:
 *  1. ensureRuntimeReady(): SQLite (WAL, esquema, migraciones), FieldCrypto y
 *     cableado de puertos Dominio → Runtime. También lo usan las tareas
 *     headless cuando el SO despierta la app sin UI.
 *  2. Settings + idioma.
 *  3. Snapshot de SQLite → store (rehidratación). Si había jornada abierta y
 *     el heartbeat está roto, se anota OS_KILL en el ledger SIN duplicar la
 *     sesión (criterio de aceptación §10).
 *  4. Notificaciones (acciones reentran como intenciones), salud real,
 *     worker de fondo, chequeos de arranque, re-sincronización de runtime.
 */
import type { SessionRecord } from "./contracts";
import { OPEN_SESSION_STATES } from "./contracts";
import { Store, StoreActions } from "./store";
import { setLanguage, t } from "../i18n";
import { bootstrapLocaleTag, resolveInitialLanguage } from "../i18n/locale";
import { serializeError } from "../utils/serializeError";
import { FeedbackService } from "../services/application/FeedbackService";
import { refreshMirror } from "../services/application/refreshMirror";
import { refreshFieldCryptoHealth } from "../services/application/useCases/fieldCryptoHealth";
import { checkLedgerIntegrity } from "../services/application/useCases/ledgerIntegrity";
import { migratePayrollPolicyToV2 } from "../services/application/useCases/policyMigration";
import { SessionEngineService } from "../services/domain/SessionEngineService";
import { SiteRegistryService } from "../services/domain/SiteRegistryService";
import { monitoredSiteId } from "../services/domain/siteVisits";
import { degradeOpenSessionIfBlocked, observeClock } from "../services/evidence/clockSample";
import { TimeAuthorityService } from "../services/evidence/TimeAuthorityService";
import { TraceRecorderService } from "../services/evidence/TraceRecorderService";
import { FieldCryptoService } from "../services/persistence/FieldCryptoService";
import { IntegrityLedgerService } from "../services/domain/IntegrityLedgerService";
import { bootFieldCrypto } from "../services/persistence/cryptoMigrations";
import { LoggingService } from "../services/persistence/LoggingService";
import { PersistenceService } from "../services/persistence/PersistenceService";
import { SettingsService } from "../services/persistence/SettingsService";
import { KV_KEYS } from "../services/persistence/schema";
import { ForegroundWorkService } from "../services/runtime/ForegroundWorkService";
import { GeofenceRuntimeService } from "../services/runtime/GeofenceRuntimeService";
import { NotificationService } from "../services/runtime/NotificationService";
import { PermissionsHealthService } from "../services/runtime/PermissionsHealthService";
import { SecurityService } from "../services/runtime/SecurityService";
import { reviewAbandonedSession } from "../services/runtime/orphanSession";
import { HEARTBEAT_GAP_MS, TaskOrchestratorService } from "../services/runtime/TaskOrchestratorService";

let runtimeReady: Promise<void> | null = null;
let bootPromise: Promise<void> | null = null;

/** Efectos de la máquina → Runtime (geocerca, FGS, rastro, temporizador de salida). */
async function syncRuntimeFor(session: SessionRecord, geofenceSiteId: number | null): Promise<void> {
  const settings = await SettingsService.load();
  if (session.domainStatus === "CERRADA") {
    await GeofenceRuntimeService.stopMonitoring();
    await ForegroundWorkService.stop();
  } else {
    if (geofenceSiteId !== null) await GeofenceRuntimeService.startMonitoring(session.id, geofenceSiteId);
    await ForegroundWorkService.sync(session.domainStatus, settings.company.traceMode);
  }
  StoreActions.healthUpdated({
    isMonitoring: await GeofenceRuntimeService.isMonitoring(),
    foregroundService: (await ForegroundWorkService.isRunning()) ? "running" : "stopped",
  });
}

function wirePorts(): void {
  SessionEngineService.setRuntimePorts({
    syncRuntime: (effect, session) => syncRuntimeFor(session, effect.geofenceSiteId),
    scheduleExitDecision: (id, firstExit, windowMs) => TaskOrchestratorService.scheduleExitDecision(id, firstExit, windowMs),
    cancelExitDecision: (id) => TaskOrchestratorService.cancelExitDecision(id),
  });
  TraceRecorderService.setSink((fact) => SessionEngineService.recordSpatialFact(fact));
  // spec v1.3 §13: el ledger recibe el digester de notas (HMAC con clave HKDF de la MK).
  IntegrityLedgerService.setNoteDigester((note) => FieldCryptoService.noteDigest(note));
  // §12: el motor rechaza notas sobre sesiones cerradas si el cifrado no está disponible.
  SessionEngineService.setCryptoAvailability(async () => {
    await FieldCryptoService.ensureMasterKey();
    return FieldCryptoService.status() !== "UNAVAILABLE";
  });
  SiteRegistryService.setGeocoder((address) => GeofenceRuntimeService.geocodeAddress(address));
  PermissionsHealthService.setOnBackgroundRevoked(async () => {
    const r = await SessionEngineService.dispatch({ type: "INTEGRITY_DEGRADE", cause: "BACKGROUND_PERMISSION_MISSING" }, "SYSTEM");
    if (r.ok) {
      await NotificationService.notifyImmediate(t("notifications.permissionLostTitle"), t("notifications.permissionLostBody"));
    }
  });
}

/**
 * Fija el idioma antes de que una tarea headless traduzca notificaciones.
 * El perfil guardado gana; si no hay perfil, el idioma del dispositivo.
 */
/**
 * Lee el idioma guardado y lo publica antes de pintar. Se puede llamar otra
 * vez (el arranque en frío lo hace dentro de ensureRuntimeReady). No usa la
 * caché de ensureRuntimeReady: siempre relee el perfil.
 */
export async function applyPersistedLanguage(): Promise<void> {
  let stored: unknown;
  try {
    const profile = await PersistenceService.getKv<{ language?: unknown }>(KV_KEYS.PROFILE);
    stored = profile?.language;
  } catch {
    stored = undefined;
  }
  setLanguage(resolveInitialLanguage(stored, bootstrapLocaleTag()));
}

/** Mínimo imprescindible para UI y tareas headless. Idempotente. */
export function ensureRuntimeReady(): Promise<void> {
  if (!runtimeReady) {
    runtimeReady = (async () => {
      // Orden de arranque (spec FieldCrypto v1.3 §11):
      // 1. Base + migraciones sin clave (v2 date_string, v3 DDL, pausas antiguas).
      await PersistenceService.init();
      // 2-5. Clave maestra (alias, estado), pérdida de clave, paso de datos con
      //      clave y barrido único de hasta 500 filas. Nunca lanza.
      await bootFieldCrypto();
      // Migración de política a v2 (spec v1.3 §5.2 N2 / §11 paso 6).
      await migratePayrollPolicyToV2().catch((e) =>
        LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "Migración de política falló", serializeError(e)),
      );
      // Verificación incremental del ledger (spec v1.3 §5.5 / §11 paso 6).
      await checkLedgerIntegrity("INCREMENTAL").catch((e) =>
        LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "Verificación del ledger falló", serializeError(e)),
      );
      wirePorts();
      // §11 paso 7: reflejo del estado del cifrado antes de hidratar.
      //   Si la jornada abierta tiene datos de un kid perdido → INTEGRITY_DEGRADE (§14).
      await refreshFieldCryptoHealth().catch((e) => {
        LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "Salud del cifrado no disponible", serializeError(e));
        StoreActions.cryptoHealth({ ...Store.getState().health.fieldCrypto, status: FieldCryptoService.status() });
      });
      // Antes de cualquier notificación de una tarea headless (el JS arranca
      // en "es" de módulo solo un instante; aquí ya hay perfil o locale).
      await applyPersistedLanguage();
    })().catch((e) => {
      runtimeReady = null;
      throw e;
    });
  }
  return runtimeReady;
}

async function onForeground(): Promise<void> {
  // Primero el reflejo: una tarea headless pudo cerrar la jornada o anotar
  // un EXIT mientras la UI estaba suspendida. Si no, la deriva de reloj
  // actuaría sobre una sesión que ya no está abierta.
  await refreshMirror().catch(() => {});
  await observeClock("FOREGROUND").catch(() => {});
  const drift = TimeAuthorityService.isDriftExceeded();
  if (drift && Store.getState().sessions.activeSessionId !== null) {
    await SessionEngineService.dispatch({ type: "INTEGRITY_DEGRADE", cause: "CLOCK_DRIFT" }, "SYSTEM");
  }
  TimeAuthorityService.reanchor();
  await PermissionsHealthService.refresh().catch(() => {});
  await degradeOpenSessionIfBlocked(await PersistenceService.getOpenSession()).catch(() => {});
  // Samsung puede soltar el registro al volver a primer plano. Si la firma no
  // cambió no se para y se vuelve a crear (eso disparaba ENTER+EXIT seguidos).
  const open = await PersistenceService.getOpenSession();
  if (open) {
    const siteId = monitoredSiteId(open);
    if (siteId !== null) await GeofenceRuntimeService.startMonitoring(open.id, siteId).catch(() => {});
  }
  await GeofenceRuntimeService.checkPendingExit().catch(() => {});
}

/** Arranque completo (lo llama app/_layout.tsx). Idempotente. */
export function boot(): Promise<void> {
  if (bootPromise) return bootPromise;
  bootPromise = (async () => {
    try {
      await ensureRuntimeReady();
      TimeAuthorityService.reanchor();
      const settings = await SettingsService.load();
      setLanguage(settings.profile.language);

      const snapshot = await PersistenceService.loadSnapshot();
      const open = snapshot.sessions.find((s) => !s.bookkeeping.isDeleted && OPEN_SESSION_STATES.includes(s.domainStatus)) ?? null;
      const lastHb = await TaskOrchestratorService.lastHeartbeat();
      const now = TimeAuthorityService.now();
      // Heurística: con jornada abierta, un hueco de heartbeat > HEARTBEAT_GAP_MS
      // se trata como muerte del proceso. TODO: distinguir cierre voluntario.
      const osKill = !!open && lastHb !== null && now - lastHb > HEARTBEAT_GAP_MS;
      if (open && osKill && lastHb !== null) await SessionEngineService.recordOsKill(open, lastHb);

      StoreActions.hydrated({
        sessions: snapshot.sessions,
        sites: snapshot.sites,
        packs: snapshot.packs,
        sharedPackIds: await IntegrityLedgerService.sharedPackIds().catch(() => []),
        settings,
        osKillDetected: osKill,
        hasPin: await SecurityService.hasPin(),
        pinOrigin: await SecurityService.pinOrigin(),
        nowMs: now,
      });
      if (osKill) FeedbackService.emit("OS_KILL_RECOVERED");
      if (open?.domainStatus === "SALIDA") StoreActions.uiRequest({ openExitModal: true });

      // El hueco se mide antes de renovar el heartbeat. Si no hay fix dentro, Revisar.
      if (open) await reviewAbandonedSession(open).catch(() => {});
      await TaskOrchestratorService.heartbeat();
      await NotificationService.init({
        intent: async (intent, sessionId) => {
          const current = Store.getState().sessions.activeSessionId;
          // Payload validado: una acción de una sesión ya cerrada no actúa sobre otra.
          if (sessionId !== null && current !== sessionId) {
            LoggingService.log("AMARILLO", "NOTIFICACION", "WARN", "Acción de notificación obsoleta ignorada", { sessionId, current });
            return;
          }
          const r = await SessionEngineService.dispatch(intent, "NOTIFICATION");
          if (!r.ok) FeedbackService.rejected(String(r.code));
        },
        ui: (req) => StoreActions.uiRequest(req),
      });
      await PermissionsHealthService.refresh();
      await TaskOrchestratorService.registerBackgroundWorker();
      await TaskOrchestratorService.runBootChecks().catch((e) =>
        LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "Chequeos de arranque fallaron", serializeError(e)),
      );
      // Tras reinicio del SO la geocerca/FGS pueden haberse perdido: re-sincronizar.
      const stillOpen = await PersistenceService.getOpenSession();
      if (stillOpen) {
        await syncRuntimeFor(stillOpen, monitoredSiteId(stillOpen)).catch(() => {});
      }
      await PermissionsHealthService.refresh().catch(() => {});
      await observeClock("FOREGROUND").catch(() => {});
      await degradeOpenSessionIfBlocked(await PersistenceService.getOpenSession()).catch(() => {});
      TaskOrchestratorService.startForegroundLoop(() => {
        onForeground().catch(() => {});
      });
    } catch (error) {
      LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "Fallo crítico durante el arranque", serializeError(error));
      StoreActions.bootFailed(serializeError(error));
      bootPromise = null;
    }
  })();
  return bootPromise;
}

/**
 * Registro de tareas de fondo (TaskManager.defineTask) — debe llamarse en el
 * ámbito global del bundle desde app/_layout.tsx. Se expone aquí para que
 * app/ no importe src/services/* directamente (Producto §1).
 */
export function registerBackgroundTasks(): void {
  TaskOrchestratorService.defineTasks(ensureRuntimeReady);
}
