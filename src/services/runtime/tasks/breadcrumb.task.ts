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
import { observeClock } from "../../evidence/clockSample";
import { TraceRecorderService } from "../../evidence/TraceRecorderService";
import { reviewMonitoringAnomaliesSafely } from "../anomalyEngine";
import { ForegroundWorkService } from "../ForegroundWorkService";
import { buildForegroundNotice } from "../monitoringSnapshot";
import { touchServiceHealth } from "../serviceHealth";
import { LoggingService } from "../../persistence/LoggingService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { SettingsService } from "../../persistence/SettingsService";
import { GeofenceRuntimeService } from "../GeofenceRuntimeService";
import { reviewAbandonedSession } from "../orphanSession";

export async function runBreadcrumbTask(
  body: TaskManagerTaskBody<{ locations: Location.LocationObject[] }>,
  heartbeat: () => Promise<void>,
): Promise<void> {
  if (body.error || !body.data?.locations?.length) return;
  await touchServiceHealth("location");
  try {
    await observeClock("BREADCRUMB").catch(() => {});
    const session = await PersistenceService.getOpenSession();
    if (session) await reviewAbandonedSession(session).catch(() => {});
    await heartbeat();
    if (!session) return; // sin jornada no se graba nada (§5.4)
    const settings = await SettingsService.load();
    const site = session.siteId !== null ? await PersistenceService.getSite(session.siteId) : null;
    const radiusM = SiteRegistryService.effectiveRadius(site, settings.company);
    const battery = await Battery.getBatteryLevelAsync().catch(() => null);
    const level = battery !== null && battery >= 0 ? battery : null;
    const samples = body.data.locations.map((l) => ({
      lat: l.coords.latitude,
      lon: l.coords.longitude,
      accuracyM: l.coords.accuracy ?? null,
      speedMps: l.coords.speed ?? null,
      altitudeM: l.coords.altitude ?? null,
      timestampMs: l.timestamp,
      source: (l.coords.accuracy ?? 999) <= 50 ? ("gps" as const) : ("network" as const),
      mocked: l.mocked === true,
    }));
    await TraceRecorderService.ingest(session, samples, { mode: settings.company.traceMode, radiusM, battery: level });
    const notice = await buildForegroundNotice(session).catch(() => null);
    // Solo reinicia el servicio si la banda de batería o el texto de la notificación cambió.
    await ForegroundWorkService.sync(session.domainStatus, settings.company.traceMode, { battery: level, ...(notice ? { notice } : {}) }).catch(() => {});
    await reviewMonitoringAnomaliesSafely(session);
    const last = samples[samples.length - 1];
    await GeofenceRuntimeService.observeSample({
      lat: last.lat,
      lon: last.lon,
      accuracyM: last.accuracyM,
      speedMps: last.speedMps,
      timestampMs: last.timestampMs,
      mocked: last.mocked,
    });
  } catch (error) {
    LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "fallo en tarea de miga de pan", serializeError(error));
  }
}
