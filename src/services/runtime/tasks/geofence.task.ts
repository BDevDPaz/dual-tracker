/**
 * Tarea GEOFENCE (Propuesta Técnica §7.2) — Enter/Exit nativo del sitio activo.
 * Solo emite hechos espaciales vía GeofenceRuntimeService (portado del
 * GEOFENCE_TASK de LocationManager.ts, GEOTrack).
 */
import type * as Location from "expo-location";
import type { TaskManagerTaskBody } from "expo-task-manager";
import { serializeError } from "../../../utils/serializeError";
import { observeClock } from "../../evidence/clockSample";
import { LoggingService } from "../../persistence/LoggingService";
import { appendGeofenceDiag } from "../geofenceDiag";
import { GeofenceRuntimeService } from "../GeofenceRuntimeService";
import { touchHeartbeat } from "../heartbeat";
import { reviewAbandonedSession } from "../orphanSession";

interface GeofenceTaskData {
  eventType: Location.GeofencingEventType;
  region: Location.LocationRegion;
}

export async function runGeofenceTask(body: TaskManagerTaskBody<GeofenceTaskData>): Promise<void> {
  if (body.error) {
    LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "evento de geocerca ignorado: error de tarea", body.error.message);
    await appendGeofenceDiag({ kind: "ERROR", region: null, siteId: null, accuracyM: null, accepted: false, reason: "TASK_ERROR" });
    return;
  }
  const data = body.data;
  if (!data?.region?.identifier) {
    await appendGeofenceDiag({ kind: "ERROR", region: null, siteId: null, accuracyM: null, accepted: false, reason: "NO_REGION" });
    return;
  }
  try {
    await observeClock("GEOFENCE").catch(() => {});
    await reviewAbandonedSession().catch(() => {});
    await touchHeartbeat();
    await GeofenceRuntimeService.handleGeofenceEvent(data.eventType, data.region);
  } catch (error) {
    LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "fallo en tarea de geocerca", serializeError(error));
  }
}
