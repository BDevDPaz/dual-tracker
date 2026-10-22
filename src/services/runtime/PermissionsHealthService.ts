/**
 * PermissionsHealthService — Runtime (Propuesta Técnica §5.9, nuevo)
 * ============================================================================
 * Observa el estado REAL de permisos, no el que la UI recuerda: ubicación
 * precisa, segundo plano, notificaciones, batería sin restricciones y (Android)
 * el servicio en primer plano. También refleja la deriva de reloj de
 * TimeAuthority.
 *  - Si el SO revoca background location, la sesión abierta pasa a CONFLICT
 *    y se notifica al instante (el hook onBackgroundRevoked lo cablea boot).
 *  - Peticiones secuenciales (tres tarjetas del onboarding), no un único
 *    diálogo opaco.
 *  - Sustituye al simulador "GPS revocado" de las maquetas de W Tracker.
 * Base: locationAdapter.requestPermissions + selectSystemHealth (GEOTrack).
 */
import * as Battery from "expo-battery";
import * as IntentLauncher from "expo-intent-launcher";
import * as Linking from "expo-linking";
import * as Location from "expo-location";
import { Platform } from "react-native";
import type { OsSettingsTarget, PermissionKey, PermissionState, SessionRecord, SessionRecordStatus, SystemHealthSnapshot } from "../../core/contracts";
import { deriveMonitoringState } from "../../core/monitoringState";
import { blockingIntegrityReason } from "../../core/healthPolicy";
import { StoreActions, Store } from "../../core/store";
import { serializeError } from "../../utils/serializeError";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { LoggingService } from "../persistence/LoggingService";
import { PersistenceService } from "../persistence/PersistenceService";
import { SettingsService } from "../persistence/SettingsService";
import { observeDeviceIntegrity } from "./deviceIntegrity";
import { ForegroundWorkService } from "./ForegroundWorkService";
import { GeofenceRuntimeService } from "./GeofenceRuntimeService";
import { buildForegroundNotice, loadMonitoringObservation, locationTrustForSession, rootedFromSession } from "./monitoringSnapshot";
import { NotificationService } from "./NotificationService";
import { recordOperationalChangesSafely } from "./operationalHealthLedger";
import { readServiceHealth } from "./serviceHealth";

function toState(p: Location.LocationPermissionResponse): PermissionState {
  if (p.status === "granted") return "granted";
  if (p.status === "denied") return p.canAskAgain ? "denied" : "blocked";
  return "unknown";
}

/**
 * Android 12+: "granted" con accuracy coarse es solo aproximada. No se
 * cuenta como precisa. Fuera de Android no aplica. Un permiso no concedido
 * no se marca como aproximado: eso ya es denegado.
 */
export function locationAccuracyOf(
  platform: string,
  response: { status?: string; android?: { accuracy?: string } },
): SystemHealthSnapshot["locationAccuracy"] {
  if (platform !== "android") return "n/a";
  if (response.status !== "granted") return "unknown";
  const accuracy = response.android?.accuracy;
  if (accuracy === "fine") return "fine";
  if (accuracy === "coarse" || accuracy === "none") return "coarse";
  return "unknown";
}

type RevokedHandler = () => Promise<void>;
let onBackgroundRevoked: RevokedHandler | null = null;

/** Estado derivado, latidos y confianza. No escribe la jornada. La integridad del dispositivo solo se asienta si cambia. */
async function fillMonitoring(snapshot: SystemHealthSnapshot, open: SessionRecord | null): Promise<void> {
  const nowMs = snapshot.checkedAtMs ?? TimeAuthorityService.now();
  const observation = await loadMonitoringObservation(open, nowMs);
  snapshot.monitoringState = deriveMonitoringState(observation);
  snapshot.lastHeartbeatAt = observation.lastHeartbeatMs;
  snapshot.serviceHealth = await readServiceHealth();
  const integrity = await observeDeviceIntegrity(open ? { id: open.id, domainStatus: open.domainStatus } : null);
  if (integrity) {
    snapshot.deviceIntegrity = {
      developerOptionsEnabled: integrity.developerOptionsEnabled,
      emulator: integrity.emulator,
      emulatorHits: integrity.emulatorHits,
      rooted: integrity.rooted,
      rootHits: integrity.rootHits,
      isDevice: integrity.isDevice,
      checkedAtMs: nowMs,
    };
  }
  const target = open ?? (await PersistenceService.latestSession().catch(() => null));
  if (target) {
    const trust = await locationTrustForSession(target.id, await rootedFromSession(target.id, integrity));
    snapshot.locationTrust = { sessionId: trust.sessionId, score: trust.score, label: trust.label };
  } else {
    snapshot.locationTrust = null;
  }
  if (open && (await ForegroundWorkService.isRunning())) {
    const settings = await SettingsService.load();
    const notice = await buildForegroundNotice(open).catch(() => null);
    if (notice) await ForegroundWorkService.sync(open.domainStatus, settings.company.traceMode, { notice }).catch(() => {});
  }
}

export const PermissionsHealthService = {
  setOnBackgroundRevoked(h: RevokedHandler | null): void {
    onBackgroundRevoked = h;
  },

  /** Lee todos los sensores y publica el snapshot en el store. */
  async refresh(): Promise<SystemHealthSnapshot> {
    const prev = Store.getState().health;
    const snapshot: SystemHealthSnapshot = { ...prev };
    try {
      const foreground = await Location.getForegroundPermissionsAsync();
      snapshot.locationForeground = toState(foreground);
      snapshot.locationAccuracy = locationAccuracyOf(Platform.OS, foreground);
      snapshot.locationBackground = toState(await Location.getBackgroundPermissionsAsync());
      snapshot.locationServicesEnabled = await Location.hasServicesEnabledAsync().catch(() => null);
    } catch (error) {
      LoggingService.log("ROJO", "PERMISOS", "ERROR", "Fallo leyendo permisos de ubicación", serializeError(error));
    }
    snapshot.notifications = await NotificationService.getPermission();
    snapshot.isMonitoring = await GeofenceRuntimeService.isMonitoring();
    snapshot.foregroundService = Platform.OS === "android" ? ((await ForegroundWorkService.isRunning()) ? "running" : "stopped") : "n/a";
    if (Platform.OS === "android") {
      try {
        snapshot.batteryOptimization = (await Battery.isBatteryOptimizationEnabledAsync()) ? "restricted" : "unrestricted";
      } catch {
        snapshot.batteryOptimization = "unknown";
      }
    } else snapshot.batteryOptimization = "n/a";
    snapshot.geofenceDiag = await GeofenceRuntimeService.recentDiagnostics();
    let openSession: { id: number; domainStatus: SessionRecordStatus } | null = null;
    let openRecord: SessionRecord | null = null;
    try {
      const open = await PersistenceService.getOpenSession();
      openRecord = open;
      openSession = open ? { id: open.id, domainStatus: open.domainStatus } : null;
      snapshot.mockLocation = open ? (await PersistenceService.countMockedFacts(open.id)) > 0 : false;
    } catch {
      snapshot.mockLocation = prev.mockLocation;
    }
    snapshot.clockDriftMs = TimeAuthorityService.currentDriftMs();
    snapshot.clockDriftExceeded = TimeAuthorityService.isDriftExceeded();
    snapshot.lastSpatialFactAt = await PersistenceService.lastSpatialFactAt().catch(() => prev.lastSpatialFactAt);
    snapshot.checkedAtMs = TimeAuthorityService.now();
    await fillMonitoring(snapshot, openRecord).catch(() => {});

    StoreActions.healthUpdated(snapshot);
    await recordOperationalChangesSafely(snapshot, openSession);

    // Revocación real de background con jornada abierta → CONFLICT.
    const revoked = prev.locationBackground === "granted" && snapshot.locationBackground !== "granted";
    if (revoked && onBackgroundRevoked) await onBackgroundRevoked().catch(() => {});
    return snapshot;
  },

  /** Petición individual (tarjetas secuenciales del onboarding / health). */
  async request(permission: PermissionKey): Promise<PermissionState> {
    try {
      if (permission === "locationForeground") {
        const r = await Location.requestForegroundPermissionsAsync();
        return toState(r);
      }
      if (permission === "locationBackground") {
        const fg = await Location.getForegroundPermissionsAsync();
        if (fg.status !== "granted") return "denied"; // el SO exige primero "en uso"
        return toState(await Location.requestBackgroundPermissionsAsync());
      }
      return await NotificationService.requestPermission();
    } catch (error) {
      LoggingService.log("ROJO", "PERMISOS", "ERROR", `Fallo solicitando ${permission}`, serializeError(error));
      return "unknown";
    } finally {
      await PermissionsHealthService.refresh();
    }
  },

  /** Abre el ajuste nativo correspondiente ("Reparar"). */
  async openOsSettings(target: OsSettingsTarget): Promise<void> {
    try {
      if (Platform.OS === "android") {
        if (target === "LOCATION") return void (await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.LOCATION_SOURCE_SETTINGS));
        if (target === "BATTERY") return void (await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
      }
      await Linking.openSettings();
    } catch (error) {
      LoggingService.log("AMARILLO", "PERMISOS", "WARN", "No se pudo abrir el ajuste del sistema", serializeError(error));
    }
  },

  /**
   * Impide VALIDADA solo ubicación, servicio en primer plano (con jornada
   * abierta) y reloj. Batería, avisos y red no entran.
   */
  blocksValid(h: SystemHealthSnapshot, sessionOpen = false): boolean {
    return blockingIntegrityReason(h, sessionOpen) !== null;
  },
};
