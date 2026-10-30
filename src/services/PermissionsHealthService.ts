import * as Location from "expo-location";
import type * as NotificationsType from "expo-notifications";
import { Platform } from "react-native";
import { log } from "../utils/logger";
import { persistenceService } from "./PersistenceService";
import { foregroundWorkService } from "./ForegroundWorkService";

// P0 PATCH (2026-10-26): import lazy de expo-notifications para Expo Go SDK 53+
// En Expo Go el import top-level lanza ERROR y corta el bundle. Con require lazy
// la app llega a [BOOT] READY y las llamadas se degradan a no-op con warning.
// En development build el require sí resuelve el módulo real.
// Nota P1: los tipos usan NotificationsType (import type, borrado en compilación,
// seguro en Expo Go). El valor en runtime sigue siendo `Notifications`.
let Notifications: typeof import("expo-notifications");
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Notifications = require("expo-notifications");
} catch {
  console.warn(
    "[PermissionsHealthService] expo-notifications no disponible (Expo Go). Push remoto deshabilitado.",
  );
  Notifications = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === "__esModule") return false;
        return async (..._args: any[]) => {
          console.warn(
            `[PermissionsHealthService] Notifications.${String(prop)} omitido en Expo Go`,
          );
          return { status: "undetermined" } as any;
        };
      },
    },
  ) as any;
}

/**
 * ============================================================================
 * PermissionsHealthService — Propuesta 5.9 (nuevo)
 * ----------------------------------------------------------------------------
 * "Observa el estado real de permisos, no el que la UI recuerda." Consulta
 * en vivo `Location.getForegroundPermissionsAsync`,
 * `Location.getBackgroundPermissionsAsync` y
 * `Notifications.getPermissionsAsync` cada vez que se llama `checkHealth()`;
 * no cachea un booleano de sesión de UI que pueda quedar desactualizado si el
 * usuario revoca un permiso desde Ajustes del sistema.
 *
 * `degraded` es verdadero cuando hay una jornada abierta (cualquier sesión
 * con `domainStatus !== "CERRADA"`) y `locationBackground` no está
 * `"granted"`. El llamador (SessionEngineService/IntegrityLedgerService, en
 * otras olas) es quien decide degradar `integrityClass` a CONFLICT con el
 * `reasonCode` "PERMISSION_REVOKED"; este servicio solo reporta la verdad.
 * ============================================================================
 */

export type PermissionHealthStatus = "granted" | "denied" | "unknown";

export interface PermissionsHealthResult {
  locationForeground: PermissionHealthStatus;
  locationBackground: PermissionHealthStatus;
  notifications: PermissionHealthStatus;
  /** Solo Android: tipo de Foreground Service en uso, o "none" si no corre. */
  androidForegroundServiceType: "location" | "none" | "unknown";
  /** true si hay jornada abierta y locationBackground no está concedido. */
  degraded: boolean;
}

function toHealthStatus(
  status: Location.PermissionStatus | NotificationsType.PermissionStatus | string | undefined,
): PermissionHealthStatus {
  if (status === "granted") return "granted";
  if (status === "denied") return "denied";
  return "unknown";
}

class PermissionsHealthService {
  /**
   * Ejecuta la lectura real de salud de permisos + estado del Foreground
   * Service + si hay una jornada abierta actualmente (para calcular
   * `degraded`).
   */
  async checkHealth(): Promise<PermissionsHealthResult> {
    const [
      locationForeground,
      locationBackground,
      notifications,
      androidForegroundServiceType,
      hasOpenSession,
    ] = await Promise.all([
      this.readLocationForeground(),
      this.readLocationBackground(),
      this.readNotifications(),
      this.readAndroidForegroundServiceType(),
      this.hasOpenSession(),
    ]);

    const degraded = hasOpenSession && locationBackground !== "granted";

    if (degraded) {
      log(
        "NARANJA",
        "PERMISOS",
        "WARN",
        "PermissionsHealthService: sesión abierta con background location no concedido",
        { locationBackground },
      );
    }

    return {
      locationForeground,
      locationBackground,
      notifications,
      androidForegroundServiceType,
      degraded,
    };
  }

  private async readLocationForeground(): Promise<PermissionHealthStatus> {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      return toHealthStatus(status);
    } catch (error) {
      log(
        "ROJO",
        "PERMISOS",
        "ERROR",
        "Fallo consultando permiso de ubicación en primer plano",
        error,
      );
      return "unknown";
    }
  }

  private async readLocationBackground(): Promise<PermissionHealthStatus> {
    try {
      const { status } = await Location.getBackgroundPermissionsAsync();
      return toHealthStatus(status);
    } catch (error) {
      log(
        "ROJO",
        "PERMISOS",
        "ERROR",
        "Fallo consultando permiso de ubicación en segundo plano",
        error,
      );
      return "unknown";
    }
  }

  private async readNotifications(): Promise<PermissionHealthStatus> {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      return toHealthStatus(status);
    } catch (error) {
      log("ROJO", "PERMISOS", "ERROR", "Fallo consultando permiso de notificaciones", error);
      return "unknown";
    }
  }

  private async readAndroidForegroundServiceType(): Promise<"location" | "none" | "unknown"> {
    if (Platform.OS !== "android") {
      return "none";
    }
    try {
      const running = await foregroundWorkService.isRunning();
      return running ? "location" : "none";
    } catch {
      return "unknown";
    }
  }

  private async hasOpenSession(): Promise<boolean> {
    try {
      const openSessions = await persistenceService.listSessionRecords({
        includeClosed: false,
      });
      return openSessions.length > 0;
    } catch (error) {
      log(
        "ROJO",
        "PERMISOS",
        "ERROR",
        "Fallo consultando sesiones abiertas para calcular degraded",
        error,
      );
      // Ante duda, no se declara degradado por un fallo de lectura propio:
      // el llamador de integridad decide con su propia fuente si aplica.
      return false;
    }
  }
}

/** Instancia única — un solo sensor de salud de permisos por proceso. */
export const permissionsHealthService = new PermissionsHealthService();
