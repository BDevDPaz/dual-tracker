import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { log } from "../../utils/logger";

export const GEOFENCE_TASK = "GEOFENCE_TRACKING_TASK";
export const EXIT_TIMESTAMP_KEY = "LAST_GEOFENCE_EXIT_TIMESTAMP";

/**
 * CONTRATO ESTRICTO:
 * Maneja puramente el hardware del GPS y el almacenamiento efímero asociado.
 * NO debe contener lógica de negocio, ni llamar a la base de datos o notificaciones.
 * NOTA: Se permite el uso del logger del sistema para diagnóstico de errores de hardware.
 */
export interface LocationAdapter {
  requestPermissions(): Promise<{
    foreground: "granted" | "denied" | "unknown";
    background: "granted" | "denied" | "unknown";
  }>;
  startMonitoringArrival(
    identifier: string,
    latitude: number,
    longitude: number,
    radiusMeters: number,
  ): Promise<boolean>;
  stopMonitoring(): Promise<void>;

  // Manejo del estado efímero de salida (reemplaza las llamadas directas en toda la app)
  setLastExitTimestamp(timestampMs: number): Promise<void>;
  getLastExitTimestamp(): Promise<number | null>;
  clearLastExitTimestamp(): Promise<void>;
}

export const locationAdapter: LocationAdapter = {
  async requestPermissions() {
    try {
      const { status: fgStatus } = await Location.getForegroundPermissionsAsync();
      let finalFg = fgStatus;

      if (finalFg !== "granted") {
        const { status } = await Location.requestForegroundPermissionsAsync();
        finalFg = status;
      }

      let finalBg: Location.PermissionStatus | "unknown" = "unknown";
      if (finalFg === "granted") {
        const { status: bgStatus } = await Location.getBackgroundPermissionsAsync();
        finalBg = bgStatus;

        if (finalBg !== "granted") {
          const { status } = await Location.requestBackgroundPermissionsAsync();
          finalBg = status;
        }
      }

      return {
        foreground: finalFg as "granted" | "denied" | "unknown",
        background: finalBg as "granted" | "denied" | "unknown",
      };
    } catch (error) {
      log("ROJO", "PERMISOS", "ERROR", "Fallo al solicitar permisos de ubicación", error);
      return {
        foreground: "unknown",
        background: "unknown",
      };
    }
  },

  async startMonitoringArrival(
    identifier: string,
    latitude: number,
    longitude: number,
    radiusMeters: number,
  ): Promise<boolean> {
    // 1. Validaciones básicas de datos
    if (!identifier) {
      log("AMARILLO", "UBICACION", "WARN", "geofence monitoring start skipped: identifier missing");
      return false;
    }

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      log("AMARILLO", "UBICACION", "WARN", "geofence monitoring start skipped: invalid latitude", {
        latitude,
      });
      return false;
    }

    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      log("AMARILLO", "UBICACION", "WARN", "geofence monitoring start skipped: invalid longitude", {
        longitude,
      });
      return false;
    }

    if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) {
      log("AMARILLO", "UBICACION", "WARN", "geofence monitoring start skipped: invalid radius", {
        radiusMeters,
      });
      return false;
    }

    try {
      // 2. Validaciones de permisos
      const fgPerm = await Location.getForegroundPermissionsAsync();
      if (fgPerm.status !== "granted") {
        log("ROJO", "UBICACION", "ERROR", "permission foreground denied: cannot start monitoring");
        return false;
      }

      // 3. Validar si los servicios de ubicación están habilitados
      const enabled = await Location.hasServicesEnabledAsync();
      if (!enabled) {
        log("ROJO", "UBICACION", "ERROR", "location services unavailable: cannot start monitoring");
        return false;
      }

      log("AZUL", "UBICACION", "INFO", "geofence monitoring start requested", {
        identifier,
        radiusMeters,
      });

      await Location.startGeofencingAsync(GEOFENCE_TASK, [
        {
          identifier,
          latitude,
          longitude,
          radius: radiusMeters,
          notifyOnEnter: true,
          notifyOnExit: true,
        },
      ]);

      log("VERDE", "UBICACION", "INFO", "geofence monitoring started", {
        identifier,
      });

      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      }).catch((err) => {
        log("AMARILLO", "UBICACION", "WARN", "GPS Warm-up falló en adapter", err);
      });

      return true;
    } catch (error) {
      log("ROJO", "UBICACION", "ERROR", "Error iniciando Geofencing en adapter", error);
      return false;
    }
  },

  async stopMonitoring(): Promise<void> {
    try {
      await Location.stopGeofencingAsync(GEOFENCE_TASK).catch(() => {});
      await Location.stopLocationUpdatesAsync(GEOFENCE_TASK).catch(() => {});
      log("NARANJA", "UBICACION", "INFO", "geofence monitoring stopped");
      await this.clearLastExitTimestamp();
    } catch (error) {
      log("ROJO", "UBICACION", "ERROR", "Fallo crítico en stopMonitoring del adapter", error);
    }
  },

  async setLastExitTimestamp(timestampMs: number): Promise<void> {
    if (!Number.isFinite(timestampMs) || timestampMs <= 0) return;
    try {
      await AsyncStorage.setItem(EXIT_TIMESTAMP_KEY, timestampMs.toString());
    } catch (error) {
      log("ROJO", "SISTEMA", "ERROR", "Error guardando EXIT_TIMESTAMP en AsyncStorage", error);
    }
  },

  async getLastExitTimestamp(): Promise<number | null> {
    try {
      const value = await AsyncStorage.getItem(EXIT_TIMESTAMP_KEY);
      if (!value) return null;

      const parsed = parseInt(value, 10);
      return Number.isNaN(parsed) ? null : parsed;
    } catch (error) {
      log("ROJO", "SISTEMA", "ERROR", "Error leyendo EXIT_TIMESTAMP de AsyncStorage", error);
      return null;
    }
  },

  async clearLastExitTimestamp(): Promise<void> {
    try {
      await AsyncStorage.removeItem(EXIT_TIMESTAMP_KEY);
    } catch (error) {
      log("ROJO", "SISTEMA", "ERROR", "Error eliminando EXIT_TIMESTAMP de AsyncStorage", error);
    }
  },
};
