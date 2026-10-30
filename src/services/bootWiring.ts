/**
 * ============================================================================
 * bootWiring — punto único de integración runtime → dominio
 * ----------------------------------------------------------------------------
 * La propuesta es explícita: "la geocerca no cierra la nómina; el PDF no
 * calcula overtime; la UI no escribe en SQLite. Solo emiten intenciones
 * hacia autoridades." Este módulo es esa frontera: traduce los hechos y
 * acciones que emiten los servicios de runtime OS (GeofenceRuntimeService,
 * NotificationService, TaskOrchestratorService) en llamadas directas al
 * único punto de mutación del dominio, SessionEngineService.
 *
 * Debe llamarse una sola vez en el arranque de la app (ver
 * src/core/boot.ts), después de que PersistenceService esté listo.
 *
 * Ningún handler de este archivo escribe en SQLite directamente: todos
 * delegan en sessionEngineService, que es quien persiste y quien escribe en
 * el ledger.
 * ============================================================================
 */

import { sessionEngineService } from "./SessionEngineService";
import { geofenceRuntimeService } from "./GeofenceRuntimeService";
import { notificationService } from "./NotificationService";
import { taskOrchestratorService } from "./TaskOrchestratorService";
import { permissionsHealthService } from "./PermissionsHealthService";
import { loggingService } from "./LoggingService";
import { feedbackService } from "./FeedbackService";
import { workTrackerEngine } from "../core/workTrackerEngine";

let wired = false;

/**
 * Conecta el runtime OS con el dominio. Idempotente: llamarlo más de una vez
 * no duplica los listeners.
 */
export function wireDualTrackerRuntime(): () => void {
  if (wired) {
    return () => {};
  }
  wired = true;

  const unsubscribers: (() => void)[] = [];

  // -- GeofenceRuntimeService -> SessionEngineService -----------------------
  // La geocerca SOLO informa hechos espaciales. La decisión de qué hacer con
  // un ENTER/EXIT es del dominio, nunca del runtime.
  unsubscribers.push(
    geofenceRuntimeService.onSpatialFact((fact) => {
      if (!fact.sessionId) return;

      if (fact.type === "ENTER" && fact.reliable) {
        void sessionEngineService
          .confirmArrival(fact.sessionId, fact.timestampMs, "GEOFENCE")
          .catch((error) => {
            loggingService.logSystem({
              severity: "ERROR",
              category: "GEOFENCE_WIRING",
              message: "confirmArrival falló tras ENTER de geocerca",
              metadataJson: JSON.stringify({ error: String(error), fact }),
            });
          });
        return;
      }

      if (
        fact.type === "EXIT" &&
        !("dedupedOf" in fact && (fact as { dedupedOf?: unknown }).dedupedOf)
      ) {
        void sessionEngineService
          .exitDetected(fact.sessionId, fact.timestampMs, "GEOFENCE")
          .catch((error) => {
            loggingService.logSystem({
              severity: "ERROR",
              category: "GEOFENCE_WIRING",
              message: "exitDetected falló tras EXIT de geocerca",
              metadataJson: JSON.stringify({ error: String(error), fact }),
            });
          });
      }
    }),
  );

  // -- NotificationService -> SessionEngineService --------------------------
  // Las acciones de notificación (tap del usuario) reentran como intenciones
  // tipadas; nunca actualizan SQLite desde aquí.
  unsubscribers.push(
    notificationService.onActionReceived((result) => {
      const run = async () => {
        switch (result.intent) {
          case "EXIT_DETECTED_CONTINUE":
            await sessionEngineService.resolveExitContinue(result.sessionId);
            break;
          case "CLOSE_DAY":
            await sessionEngineService.closeDay(result.sessionId, Date.now(), "USER", "VALID");
            break;
          case "START_TRANSIT":
            feedbackService.emitAndEnqueue(
              workTrackerEngine.dispatch.bind(workTrackerEngine),
              "TRANSIT_DESTINATION_REQUIRED",
              "info",
            );
            break;
          default:
            break;
        }
      };

      void run().catch((error) => {
        loggingService.logSystem({
          severity: "ERROR",
          category: "NOTIFICATION_WIRING",
          message: "Fallo al traducir acción de notificación a intención de dominio",
          metadataJson: JSON.stringify({ error: String(error), result }),
        });
      });
    }),
  );

  return () => {
    unsubscribers.forEach((unsub) => unsub());
    wired = false;
  };
}

/**
 * Debe llamarse en cada boot de la app, antes de mostrar cualquier pantalla
 * de decisión. Detecta OS_KILL (proceso muerto con jornada ACTIVA) y salud
 * de permisos degradada, y dispara los efectos de dominio correspondientes
 * a través de SessionEngineService (nunca escribe el ledger aquí mismo).
 */
export async function runBootIntegritySweep(): Promise<void> {
  const heartbeat = await taskOrchestratorService.heartbeat();
  if (heartbeat.needsOsKillLedgerEntry && heartbeat.sessionId) {
    await sessionEngineService.recoverFromOsKill(heartbeat.sessionId);
  }

  const health = await permissionsHealthService.checkHealth();
  if (health.degraded) {
    feedbackService.emitAndEnqueue(
      workTrackerEngine.dispatch.bind(workTrackerEngine),
      "BACKGROUND_LOCATION_REQUIRED",
      "warning",
    );
  }
}
