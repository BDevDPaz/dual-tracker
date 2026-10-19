/**
 * Tarea BREADCRUMB (Propuesta Técnica §7.2) — muestreo adaptativo durante
 * ACTIVA/TRASLADO bajo el servicio en primer plano. Alimenta TraceRecorder y
 * la confirmación de salida (strikes de LEDTracker). Registra heartbeat.
 */
import type * as Location from "expo-location";
import type { TaskManagerTaskBody } from "expo-task-manager";
import * as Battery from "expo-battery";
import { serializeError } from "../../../utils/serializeError";
import { SiteRegistryService } from "../../domain/SiteRegistryService";
import { TraceRecorderService } from "../../evidence/TraceRecorderService";
import { LoggingService } from "../../persistence/LoggingService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { SettingsService } from "../../persistence/SettingsService";
import { GeofenceRuntimeService } from "../GeofenceRuntimeService";

export async function runBreadcrumbTask(
  body: TaskManagerTaskBody<{ locations: Location.LocationObject[] }>,
  heartbeat: () => Promise<void>,
): Promise<void> {
  if (body.error || !body.data?.locations?.length) return;
  try {
    await heartbeat();
    const session = await PersistenceService.getOpenSession();
    if (!session) return; // sin jornada no se graba nada (§5.4)
    const settings = await SettingsService.load();
    const site = session.siteId !== null ? await PersistenceService.getSite(session.siteId) : null;
    const radiusM = SiteRegistryService.effectiveRadius(site, settings.company);
    const battery = await Battery.getBatteryLevelAsync().catch(() => null);
    const samples = body.data.locations.map((l) => ({
      lat: l.coords.latitude,
      lon: l.coords.longitude,
      accuracyM: l.coords.accuracy ?? null,
      speedMps: l.coords.speed ?? null,
      altitudeM: l.coords.altitude ?? null,
      timestampMs: l.timestamp,
      source: (l.coords.accuracy ?? 999) <= 50 ? ("gps" as const) : ("network" as const),
    }));
    await TraceRecorderService.ingest(session, samples, { mode: settings.company.traceMode, radiusM, battery: battery !== null && battery >= 0 ? battery : null });
    const last = samples[samples.length - 1];
    await GeofenceRuntimeService.observeSample({
      lat: last.lat,
      lon: last.lon,
      accuracyM: last.accuracyM,
      speedMps: last.speedMps,
      timestampMs: last.timestampMs,
    });
  } catch (error) {
    LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "fallo en tarea de miga de pan", serializeError(error));
  }
}
