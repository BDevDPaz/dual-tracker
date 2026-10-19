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
import type { OsSettingsTarget, PermissionKey, PermissionState, SystemHealthSnapshot } from "../../core/contracts";
import { blockingIntegrityReason } from "../../core/healthPolicy";
import { StoreActions, Store } from "../../core/store";
import { serializeError } from "../../utils/serializeError";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { LoggingService } from "../persistence/LoggingService";
import { PersistenceService } from "../persistence/PersistenceService";
import { ForegroundWorkService } from "./ForegroundWorkService";
import { GeofenceRuntimeService } from "./GeofenceRuntimeService";
import { NotificationService } from "./NotificationService";

function toState(p: Location.LocationPermissionResponse): PermissionState {
  if (p.status === "granted") return "granted";
  if (p.status === "denied") return p.canAskAgain ? "denied" : "blocked";
  return "unknown";
}

type RevokedHandler = () => Promise<void>;
let onBackgroundRevoked: RevokedHandler | null = null;

export const PermissionsHealthService = {
  setOnBackgroundRevoked(h: RevokedHandler | null): void {
    onBackgroundRevoked = h;
  },

  /** Lee todos los sensores y publica el snapshot en el store. */
  async refresh(): Promise<SystemHealthSnapshot> {
    const prev = Store.getState().health;
    const snapshot: SystemHealthSnapshot = { ...prev };
    try {
      snapshot.locationForeground = toState(await Location.getForegroundPermissionsAsync());
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
    snapshot.clockDriftMs = TimeAuthorityService.currentDriftMs();
    snapshot.clockDriftExceeded = TimeAuthorityService.isDriftExceeded();
    snapshot.lastSpatialFactAt = await PersistenceService.lastSpatialFactAt().catch(() => prev.lastSpatialFactAt);
    snapshot.checkedAtMs = TimeAuthorityService.now();

    StoreActions.healthUpdated(snapshot);

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
