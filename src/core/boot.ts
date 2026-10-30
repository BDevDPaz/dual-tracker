import { now, nowIso } from "../utils/timeProvider";
import { workTrackerEngine } from "./workTrackerEngine";
import { WorkTrackerRuntimeAdapter } from "./contracts";

// Adaptadores reales de infraestructura
import {
  sessionStore,
  locationAdapter,
  notificationsAdapter,
  reportsAdapter,
  securityAdapter,
  loggingAdapter,
} from "./runtime";

// Infraestructura base obligatoria
import { initDatabase } from "../database/db";
import { setupNotificationActionHandler } from "../services/NotificationActionHandler";

// Capa canónica Dual Tracker (Propuesta de Servicios Dual Tracker).
// Aditiva: conecta runtime OS -> SessionEngineService sin tocar el motor
// legacy reducer/effects, que sigue siendo responsable de la UI actual
// mientras dura la migración por fases (ver Propuesta §11).
import { wireDualTrackerRuntime, runBootIntegritySweep } from "../services/bootWiring";
import { loggingService } from "../services/LoggingService";

// PORT WTracker V1: withTimeout para evitar splash blanco colgado
const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> =>
  Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`TIMEOUT ${label} ${ms}ms`)), ms),
    ),
  ]);

function serializeError(error: unknown): string | null {
  try {
    if (error instanceof Error) {
      return JSON.stringify(
        {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        null,
        0,
      );
    }

    return JSON.stringify({ error: String(error) }, null, 0);
  } catch {
    return null;
  }
}

/**
 * Runtime oficial del sistema.
 */
const productionRuntime: WorkTrackerRuntimeAdapter = {
  sessionStore,
  location: locationAdapter,
  notifications: notificationsAdapter,
  reports: reportsAdapter,
  security: securityAdapter,
  logging: loggingAdapter,
};

let bootPromise: Promise<void> | null = null;
let hasBootCompleted = false;

export const bootApplication = async (): Promise<void> => {
  if (hasBootCompleted) {
    return;
  }

  if (bootPromise) {
    return bootPromise;
  }

  bootPromise = (async () => {
    try {
      console.log("[BOOT] start");
      workTrackerEngine.initialize(productionRuntime);
      setupNotificationActionHandler();

      console.log("[BOOT] DB init...");
      await withTimeout(initDatabase(), 10000, "DB");
      console.log("[BOOT] DB ok");

      await withTimeout(workTrackerEngine.dispatch({ type: "DB_READY" }), 5000, "DB_READY");

      // Capa canónica Dual Tracker: la persistencia legacy ya está lista,
      // así que el dominio nuevo puede empezar a escribir (ledger, sitios,
      // hechos espaciales) y a drenar su cola de arranque de logs.
      loggingService.markReady();

      console.log("[BOOT] wiring...");
      await withTimeout(Promise.resolve(wireDualTrackerRuntime()), 5000, "WIRING");
      console.log("[BOOT] wiring ok");

      console.log("[BOOT] integrity sweep...");
      await withTimeout(runBootIntegritySweep(), 5000, "SWEEP");
      console.log("[BOOT] sweep ok");

      await withTimeout(
        workTrackerEngine.dispatch({ type: "APP_BOOT_STARTED" }),
        5000,
        "BOOT_STARTED",
      );
      console.log("[BOOT] READY");
      hasBootCompleted = true;
    } catch (error) {
      console.error("Fallo crítico y absoluto durante el arranque del motor:", error);
      try {
        await workTrackerEngine.dispatch({
          type: "SYSTEM_ERROR_RECORDED",
          entry: {
            timestampMs: now(),
            timestampIso: nowIso(),
            color: "ROJO",
            category: "ERROR_CRITICO",
            severity: "ERROR",
            message: "Fallo crítico y absoluto durante el arranque del motor.",
            metadataJson: serializeError(error),
          },
        });
      } catch (dispatchError) {
        console.error(
          "Fallo adicional despachando SYSTEM_ERROR_RECORDED durante boot:",
          dispatchError,
        );
      }
      throw error;
    } finally {
      if (!hasBootCompleted) {
        bootPromise = null;
      }
    }
  })();

  return bootPromise;
};
