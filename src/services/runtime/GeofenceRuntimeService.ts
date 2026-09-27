/**
 * GeofenceRuntimeService — Runtime (Propuesta Técnica §4.3)
 * Fusiona GeofenceService (LEDTracker), LocationManager (GEOTrack) y
 * locationAdapter (GEOTrack).
 * ============================================================================
 * Deja de "cerrar jornada" por sí mismo. Solo observa el perímetro y emite
 * hechos espaciales: ENTER, EXIT, DWELL, ACCURACY_DROP, PROVIDER_LOSS.
 *  - Debounce de salida configurable (company.exitDebounceMs, hoy ~2 min)
 *    registrando la PRIMERA salida, no la última.
 *  - Radio por sitio (SiteRegistry.effectiveRadius), no global.
 *  - Si la precisión supera el radio, el hecho se marca UNRELIABLE y no puede
 *    producir VALID por sí solo. Los validadores anti-spoof de GEOTrack ya no
 *    RECHAZAN: marcan reliable=false con el motivo.
 *  - Se elimina el `await delay(dwell)` dentro de la tarea (GEOTrack): en
 *    Android una tarea headless no debe bloquearse minutos. La confirmación
 *    de salida la dan el debounce + muestras posteriores (strikes de
 *    LEDTracker) o el worker de fondo.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import type { SessionRecord, SpatialFact, SpatialSource } from "../../core/contracts";
import {
  GEOFENCE_ANTI_REBOUNCE_MS,
  GEOFENCE_TASK_NAME,
  IMPOSSIBLE_SPEED_KMH,
  MAX_ACCEPTABLE_ACCURACY_METERS,
  MAX_ENTRY_SPEED_KMH,
  MAX_EXIT_SPEED_KMH,
  MAX_INSTANT_LOCATION_JUMP_METERS,
} from "../../constants/geolocation";
import { getDistanceFromLatLonInMeters, isValidCoordinate } from "../../utils/geoUtils";
import { serializeError } from "../../utils/serializeError";
import { SessionEngineService } from "../domain/SessionEngineService";
import { SiteRegistryService } from "../domain/SiteRegistryService";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { LoggingService } from "../persistence/LoggingService";
import { PersistenceService } from "../persistence/PersistenceService";
import { KV_KEYS } from "../persistence/schema";
import { SettingsService } from "../persistence/SettingsService";

/** Salidas fuera de radio consecutivas para confirmar (LEDTracker: MAX_DRIFT_STRIKES). */
const EXIT_CONFIRM_STRIKES = 3;

export interface PendingExit {
  sessionId: number;
  siteId: number | null;
  firstExitAtMs: number;
  reliable: boolean;
  reason: string | null;
  strikes: number;
}

interface LastFix {
  lat: number;
  lon: number;
  timestampMs: number;
}

let lastProcessed: { sessionId: number; type: "ENTER" | "EXIT"; atMs: number } | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function geofenceIdentifier(sessionId: number, siteId: number): string {
  return `SESSION_${sessionId}_SITE_${siteId}`;
}

function sourceOf(accuracy: number | null): SpatialSource {
  if (accuracy === null) return "unknown";
  return accuracy <= MAX_ACCEPTABLE_ACCURACY_METERS ? "gps" : "network";
}

/**
 * Validadores de GEOTrack (validateGeofenceEvent) convertidos a fiabilidad.
 * Devuelve null si todo pasa, o el primer motivo de no fiabilidad.
 */
async function reliabilityIssue(
  type: "ENTER" | "EXIT",
  loc: Location.LocationObject,
  target: { lat: number; lon: number; radiusM: number },
): Promise<string | null> {
  const { accuracy, speed, latitude, longitude } = loc.coords;
  const speedKmh = speed && speed > 0 ? speed * 3.6 : 0;

  if (accuracy === null || accuracy === undefined) return "ACCURACY_UNKNOWN";
  if (accuracy > MAX_ACCEPTABLE_ACCURACY_METERS || accuracy > target.radiusM) return "ACCURACY_GT_RADIUS";

  const last: LastFix | null = await PersistenceService.getLastFix();
  if (last) {
    const jump = getDistanceFromLatLonInMeters(latitude, longitude, last.lat, last.lon);
    if (Number.isFinite(jump) && jump > MAX_INSTANT_LOCATION_JUMP_METERS) return "LOCATION_JUMP_DETECTED";
  }
  if (speedKmh > IMPOSSIBLE_SPEED_KMH) return "IMPOSSIBLE_SPEED";
  if (type === "ENTER" && speedKmh > MAX_ENTRY_SPEED_KMH) return "ENTRY_SPEED";
  if (type === "EXIT" && speedKmh > MAX_EXIT_SPEED_KMH) return "EXIT_SPEED";

  const dist = getDistanceFromLatLonInMeters(latitude, longitude, target.lat, target.lon);
  if (!Number.isFinite(dist)) return "INVALID_COORDS";
  if (type === "ENTER" && dist > target.radiusM) return "OUTSIDE_RADIUS";
  if (type === "EXIT" && dist <= target.radiusM) return "INSIDE_RADIUS";
  return null;
}

async function loadContext(): Promise<{
  session: SessionRecord;
  target: { siteId: number; lat: number; lon: number; radiusM: number };
  exitDebounceMs: number;
} | null> {
  const session = await PersistenceService.getOpenSession();
  if (!session) return null;
  const transit = session.transitSegments.find((t) => t.endAtMs === null && !t.cancelled);
  const siteId = transit ? transit.toSiteId : session.siteId;
  if (siteId === null) return null;
  const site = await PersistenceService.getSite(siteId);
  if (!site || !isValidCoordinate(site.targetLat, site.targetLon)) return null;
  const settings = await SettingsService.load();
  return {
    session,
    target: { siteId, lat: site.targetLat!, lon: site.targetLon!, radiusM: SiteRegistryService.effectiveRadius(site, settings.company) },
    exitDebounceMs: settings.company.exitDebounceMs,
  };
}

export const GeofenceRuntimeService = {
  /** Arranca la geocerca del sitio objetivo (portado de locationAdapter.startMonitoringArrival). */
  async startMonitoring(sessionId: number, siteId: number): Promise<boolean> {
    const site = await PersistenceService.getSite(siteId);
    if (!site || !isValidCoordinate(site.targetLat, site.targetLon)) {
      LoggingService.log("AMARILLO", "UBICACION", "WARN", "geocerca no iniciada: sitio sin coordenadas", { siteId });
      return false;
    }
    const settings = await SettingsService.load();
    const radius = SiteRegistryService.effectiveRadius(site, settings.company);
    try {
      const fg = await Location.getForegroundPermissionsAsync();
      if (fg.status !== "granted") {
        LoggingService.log("ROJO", "UBICACION", "ERROR", "sin permiso de ubicación: no se inicia geocerca");
        return false;
      }
      if (!(await Location.hasServicesEnabledAsync())) {
        LoggingService.log("ROJO", "UBICACION", "ERROR", "servicios de ubicación desactivados");
        return false;
      }
      await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME).catch(() => {});
      await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, [
        {
          identifier: geofenceIdentifier(sessionId, siteId),
          latitude: site.targetLat!,
          longitude: site.targetLon!,
          radius,
          notifyOnEnter: true,
          notifyOnExit: true,
        },
      ]);
      // Calentamiento del GPS (GEOTrack).
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => {});
      LoggingService.log("VERDE", "UBICACION", "INFO", "geocerca iniciada", { sessionId, siteId, radius });
      return true;
    } catch (error) {
      LoggingService.log("ROJO", "UBICACION", "ERROR", "error iniciando geocerca", serializeError(error));
      return false;
    }
  },

  async stopMonitoring(): Promise<void> {
    try {
      if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME).catch(() => false)) {
        await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
      }
    } catch (error) {
      LoggingService.log("ROJO", "UBICACION", "ERROR", "fallo deteniendo geocerca", serializeError(error));
    }
    await GeofenceRuntimeService.clearPendingExit();
  },

  async isMonitoring(): Promise<boolean> {
    return Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME).catch(() => false);
  },

  /**
   * Handler de la tarea GEOFENCE (definida en TaskOrchestrator). Produce
   * hechos espaciales y, según el estado, intenciones al SessionEngine.
   */
  async handleGeofenceEvent(eventType: Location.GeofencingEventType, region: Location.LocationRegion): Promise<void> {
    const ctx = await loadContext();
    if (!ctx) {
      LoggingService.log("BLANCO", "UBICACION", "DEBUG", "evento de geocerca ignorado: sin jornada abierta");
      return;
    }
    const { session, target } = ctx;
    const expected = geofenceIdentifier(session.id, target.siteId);
    if (region.identifier !== expected) {
      LoggingService.log("AMARILLO", "UBICACION", "WARN", "GEOFENCE_STALE_EVENT_REJECTED", { received: region.identifier, expected });
      return;
    }
    const type: "ENTER" | "EXIT" = eventType === Location.GeofencingEventType.Enter ? "ENTER" : "EXIT";
    const nowMs = TimeAuthorityService.now();
    if (lastProcessed && lastProcessed.sessionId === session.id && lastProcessed.type === type && nowMs - lastProcessed.atMs < GEOFENCE_ANTI_REBOUNCE_MS) {
      return; // anti-rebote (GEOTrack)
    }
    lastProcessed = { sessionId: session.id, type, atMs: nowMs };

    let loc: Location.LocationObject | null = null;
    try {
      loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    } catch {
      loc = null;
    }
    const issue = loc ? await reliabilityIssue(type, loc, target) : "NO_FIX";
    const fact: SpatialFact = {
      sessionId: session.id,
      type,
      lat: loc?.coords.latitude ?? null,
      lon: loc?.coords.longitude ?? null,
      accuracyM: loc?.coords.accuracy ?? null,
      timestampMs: nowMs,
      source: sourceOf(loc?.coords.accuracy ?? null),
      reliable: issue === null,
      reason: issue,
      siteId: target.siteId,
    };
    await SessionEngineService.recordSpatialFact(fact);
    if (loc && issue === null) {
      await PersistenceService.setLastFix({ lat: loc.coords.latitude, lon: loc.coords.longitude, timestampMs: nowMs } satisfies LastFix);
    }

    if (type === "ENTER") {
      // Rebote: volver a entrar durante el debounce anula la salida pendiente.
      const pending = await GeofenceRuntimeService.getPendingExit();
      if (pending && pending.sessionId === session.id) {
        await GeofenceRuntimeService.clearPendingExit();
        return;
      }
      if (session.domainStatus === "ESPERANDO" || session.domainStatus === "TRASLADO") {
        await SessionEngineService.dispatch({ type: "ARRIVAL_CONFIRMED", fact }, "GEOFENCE");
      }
      return;
    }

    // EXIT: solo relevante en ACTIVA. Se guarda la PRIMERA salida y se espera el debounce.
    if (session.domainStatus !== "ACTIVA") return;
    const existing = await GeofenceRuntimeService.getPendingExit();
    if (existing && existing.sessionId === session.id) return; // conservar la primera
    const pending: PendingExit = {
      sessionId: session.id,
      siteId: target.siteId,
      firstExitAtMs: nowMs,
      reliable: fact.reliable,
      reason: fact.reason ?? null,
      strikes: 0,
    };
    await PersistenceService.setKv(KV_KEYS.PENDING_EXIT, pending);
    GeofenceRuntimeService.armDebounceTimer(ctx.exitDebounceMs);
  },

  /** Solo pruebas (test/setup.ts): limpia anti-rebote y temporizador en memoria entre casos. */
  __resetForTests(): void {
    lastProcessed = null;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = null;
  },

  /** Temporizador en primer plano; en segundo plano lo cubre el worker de TaskOrchestrator. */
  armDebounceTimer(ms: number): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      GeofenceRuntimeService.checkPendingExit().catch(() => {});
    }, ms);
  },

  async getPendingExit(): Promise<PendingExit | null> {
    return PersistenceService.getKv<PendingExit>(KV_KEYS.PENDING_EXIT);
  },

  async clearPendingExit(): Promise<void> {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    await PersistenceService.deleteKv(KV_KEYS.PENDING_EXIT).catch(() => {});
  },

  /**
   * Confirma la salida pendiente si venció el debounce o si hubo
   * EXIT_CONFIRM_STRIKES muestras fuera de radio. Emite EXIT_DETECTED con el
   * timestamp de la PRIMERA salida.
   */
  async checkPendingExit(): Promise<boolean> {
    const pending = await GeofenceRuntimeService.getPendingExit();
    if (!pending) return false;
    const ctx = await loadContext();
    if (!ctx || ctx.session.id !== pending.sessionId || ctx.session.domainStatus !== "ACTIVA") {
      await GeofenceRuntimeService.clearPendingExit();
      return false;
    }
    const elapsed = TimeAuthorityService.now() - pending.firstExitAtMs;
    if (elapsed < ctx.exitDebounceMs && pending.strikes < EXIT_CONFIRM_STRIKES) return false;
    await GeofenceRuntimeService.clearPendingExit();
    const fact: SpatialFact = {
      sessionId: pending.sessionId,
      type: "EXIT",
      lat: null,
      lon: null,
      accuracyM: null,
      timestampMs: pending.firstExitAtMs,
      source: "unknown",
      reliable: pending.reliable,
      reason: pending.reason,
      siteId: pending.siteId,
    };
    const r = await SessionEngineService.dispatch({ type: "EXIT_DETECTED", fact }, "GEOFENCE");
    return r.ok;
  },

  /**
   * Alimenta la confirmación de salida con muestras de la tarea BREADCRUMB
   * (strikes de LEDTracker). Dentro del radio anula la salida pendiente.
   */
  async observeSample(sample: { lat: number; lon: number; accuracyM: number | null }): Promise<void> {
    const pending = await GeofenceRuntimeService.getPendingExit();
    if (!pending) return;
    const ctx = await loadContext();
    if (!ctx) return;
    const dist = getDistanceFromLatLonInMeters(sample.lat, sample.lon, ctx.target.lat, ctx.target.lon);
    if (!Number.isFinite(dist) || sample.accuracyM === null || sample.accuracyM > ctx.target.radiusM) return;
    if (dist <= ctx.target.radiusM) {
      await GeofenceRuntimeService.clearPendingExit();
      return;
    }
    await PersistenceService.setKv(KV_KEYS.PENDING_EXIT, { ...pending, strikes: pending.strikes + 1 });
    await GeofenceRuntimeService.checkPendingExit();
  },

  /** Geocodificador para SiteRegistry (portado de DailySetupModal de LEDTracker). */
  async geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
    try {
      const results = await Location.geocodeAsync(address);
      const first = results?.[0];
      if (!first || !isValidCoordinate(first.latitude, first.longitude)) return null;
      return { lat: first.latitude, lon: first.longitude };
    } catch (error) {
      LoggingService.log("AMARILLO", "UBICACION", "WARN", "dirección no encontrada", serializeError(error));
      return null;
    }
  },

  /**
   * ¿El operario está fuera del radio del sitio ahora mismo? null si no hay
   * fix fiable (precisión > radio). Lo usan watchdog y EXIT_DECISION_TIMER
   * para "confirmedOutside" (sustituye el failsafe con radio fijo de 200 m
   * y coordenadas `|| 0` de BackgroundTasks.ts de GEOTrack).
   */
  async isCurrentlyOutside(): Promise<boolean | null> {
    const ctx = await loadContext();
    if (!ctx) return null;
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const acc = loc.coords.accuracy;
      if (acc === null || acc === undefined || acc > ctx.target.radiusM) return null;
      const dist = getDistanceFromLatLonInMeters(loc.coords.latitude, loc.coords.longitude, ctx.target.lat, ctx.target.lon);
      return Number.isFinite(dist) ? dist > ctx.target.radiusM : null;
    } catch {
      return null;
    }
  },

  /** Hecho PROVIDER_LOSS (servicios de ubicación apagados con jornada abierta). */
  async reportProviderLoss(session: SessionRecord): Promise<void> {
    await SessionEngineService.recordSpatialFact({
      sessionId: session.id,
      type: "PROVIDER_LOSS",
      lat: null,
      lon: null,
      accuracyM: null,
      timestampMs: TimeAuthorityService.now(),
      source: "unknown",
      reliable: false,
      reason: "LOCATION_SERVICES_DISABLED",
      siteId: session.siteId,
    });
  },
};

// AsyncStorage solo se usa para limpiar claves heredadas de GEOTrack/LEDTracker.
export async function clearLegacyLocationKeys(): Promise<void> {
  await AsyncStorage.multiRemove(["LAST_GEOFENCE_EXIT_TIMESTAMP", "LAST_VALID_LOCATION", "GPS_DRIFT_COUNTER"]).catch(() => {});
}
