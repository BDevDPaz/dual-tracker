/**
 * Tarea GEOFENCE (Propuesta Técnica §7.2) — Enter/Exit nativo del sitio activo.
 * Solo emite hechos espaciales vía GeofenceRuntimeService (portado del
 * GEOFENCE_TASK de LocationManager.ts, GEOTrack).
 */
import type * as Location from "expo-location";
import type { TaskManagerTaskBody } from "expo-task-manager";
import { serializeError } from "../../../utils/serializeError";
import { LoggingService } from "../../persistence/LoggingService";
import { GeofenceRuntimeService } from "../GeofenceRuntimeService";

interface GeofenceTaskData {
  eventType: Location.GeofencingEventType;
  region: Location.LocationRegion;
}

export async function runGeofenceTask(body: TaskManagerTaskBody<GeofenceTaskData>): Promise<void> {
  if (body.error) {
    LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "evento de geocerca ignorado: error de tarea", body.error.message);
    return;
  }
  const data = body.data;
  if (!data?.region?.identifier) return;
  try {
    await GeofenceRuntimeService.handleGeofenceEvent(data.eventType, data.region);
  } catch (error) {
    LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "fallo en tarea de geocerca", serializeError(error));
  }
}
