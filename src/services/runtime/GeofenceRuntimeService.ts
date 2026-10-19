/**
 * GeofenceRuntimeService — Runtime (Propuesta Técnica §4.3)
 * ============================================================================
 * Observa el perímetro y emite hechos espaciales. No cierra la jornada por
 * sí mismo: EXIT_DETECTED deja la sesión en SALIDA y el temporizador decide.
 *
 * Endurecido tras el uso real en un Galaxy S22+ (comprobante 12–18 oct 2026:
 * seis sesiones sueltas, un CIERRE AUTOMÁTICO de 0.00 h y tránsito 0):
 *  - La llegada en coche ya no se rechaza por ir a más de 15 km/h ni por un
 *    salto > 500 m desde el sitio anterior. Solo una velocidad imposible.
 *  - Precisión peor que 50 m pero dentro del radio del sitio sí ficha.
 *  - Histéresis: salir exige quedar más allá del radio, no rozarlo.
 *  - Los primeros 90 s se ignora un EXIT que no sea una salida clara
 *    (Android dispara EXIT al registrar estando ya dentro → cierre de 0 min).
 *  - Si el ENTER del SO no llega (ya estabas dentro, o Samsung se lo tragó),
 *    la muestra del servicio en primer plano —que ya corre en «Solo geocerca»—
 *    confirma llegada y salida. No se añade un muestreo más agresivo.
 *  - En ACTIVA/SALIDA se vigilan los demás destinos (hasta 20). Llegar a otro
 *    sitio continúa la misma jornada (traslado), no abre una sesión nueva.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { Platform } from "react-native";
import type { SessionRecord, SpatialFact, SpatialSource } from "../../core/contracts";
import { GEOFENCE_ANTI_REBOUNCE_MS, GEOFENCE_TASK_NAME, MAX_ACCEPTABLE_ACCURACY_METERS } from "../../constants/geolocation";
import { getDistanceFromLatLonInMeters, isValidCoordinate } from "../../utils/geoUtils";
import { serializeError } from "../../utils/serializeError";
import { SessionEngineService } from "../domain/SessionEngineService";
import { SiteRegistryService } from "../domain/SiteRegistryService";
import { monitoredSiteId } from "../domain/siteVisits";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { LoggingService } from "../persistence/LoggingService";
import { PersistenceService } from "../persistence/PersistenceService";
import { KV_KEYS } from "../persistence/schema";
import { SettingsService } from "../persistence/SettingsService";
import { appendGeofenceDiag, readGeofenceDiag } from "./geofenceDiag";
import {
  MAX_MONITORED_REGIONS,
  MIN_DWELL_BEFORE_EXIT_MS,
  SAMPLE_MAX_AGE_MS,
  confirmExitDecision,
  isFarOutside,
  movementIssue,
  osGeofenceRadius,
  parseGeofenceIdentifier,
  presenceZone,
  shouldArmExit,
  type PresenceZone,
} from "./geofencePolicy";

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

interface Fix {
  lat: number;
  lon: number;
  accuracyM: number | null;
  speedMps: number | null;
  timestampMs: number;
}

interface Target {
  siteId: number;
  lat: number;
  lon: number;
  radiusM: number;
}

interface RegionSpec {
  identifier: string;
  latitude: number;
  longitude: number;
  radius: number;
  notifyOnEnter: boolean;
  notifyOnExit: boolean;
}

let lastProcessed: { sessionId: number; type: "ENTER" | "EXIT"; atMs: number } | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let registeredKey: string | null = null;

export function geofenceIdentifier(sessionId: number, siteId: number): string {
  return `SESSION_${sessionId}_SITE_${siteId}`;
}

function sourceOf(accuracy: number | null): SpatialSource {
  if (accuracy === null) return "unknown";
  return accuracy <= MAX_ACCEPTABLE_ACCURACY_METERS ? "gps" : "network";
}

function registrationKey(regions: RegionSpec[]): string {
  return regions
    .map((r) => `${r.identifier}@${r.latitude.toFixed(5)},${r.longitude.toFixed(5)}:${Math.round(r.radius)}:${r.notifyOnEnter ? 1 : 0}${r.notifyOnExit ? 1 : 0}`)
    .join("|");
}

async function loadContext(): Promise<{
  session: SessionRecord;
  target: Target;
  exitDebounceMs: number;
} | null> {
  const session = await PersistenceService.getOpenSession();
  if (!session) return null;
  const siteId = monitoredSiteId(session);
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

async function readFix(): Promise<Fix | null> {
  try {
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return {
      lat: loc.coords.latitude,
      lon: loc.coords.longitude,
      accuracyM: loc.coords.accuracy ?? null,
      speedMps: loc.coords.speed ?? null,
      timestampMs: loc.timestamp,
    };
  } catch {
    return null;
  }
}

async function jumpAgainstLast(fix: Fix, nowMs: number): Promise<{ jumpM: number | null; jumpDtMs: number | null }> {
  const last = await PersistenceService.getLastFix();
  if (!last) return { jumpM: null, jumpDtMs: null };
  const jump = getDistanceFromLatLonInMeters(fix.lat, fix.lon, last.lat, last.lon);
  if (!Number.isFinite(jump)) return { jumpM: null, jumpDtMs: null };
  return { jumpM: jump, jumpDtMs: nowMs - last.timestampMs };
}

/**
 * null = el fix corrobora el evento. Si no, el motivo (no ficha solo).
 * Llegar en vehículo es fiable: el veto de 15 km/h y el salto fijo de 500 m
 * rechazaban entradas reales entre obras.
 */
async function reliabilityIssue(type: "ENTER" | "EXIT", fix: Fix | null, target: Target, nowMs: number): Promise<string | null> {
  if (!fix) return "NO_FIX";
  if (fix.accuracyM === null) return "ACCURACY_UNKNOWN";
  if (fix.accuracyM > target.radiusM) return "ACCURACY_GT_RADIUS";
  const dist = getDistanceFromLatLonInMeters(fix.lat, fix.lon, target.lat, target.lon);
  if (!Number.isFinite(dist)) return "INVALID_COORDS";
  const jump = await jumpAgainstLast(fix, nowMs);
  const move = movementIssue({ speedMps: fix.speedMps, ...jump });
  if (move) return move;
  const zone = presenceZone(dist, target.radiusM, fix.accuracyM);
  if (type === "ENTER" && zone !== "inside") return dist > target.radiusM ? "OUTSIDE_RADIUS" : "HYSTERESIS";
  if (type === "EXIT" && zone === "inside") return "INSIDE_RADIUS";
  if (type === "EXIT" && zone !== "outside") return "HYSTERESIS";
  return null;
}

function zoneOf(fix: Fix | null, target: Target): { zone: PresenceZone; dist: number; far: boolean } {
  if (!fix) return { zone: "unknown", dist: NaN, far: false };
  const dist = getDistanceFromLatLonInMeters(fix.lat, fix.lon, target.lat, target.lon);
  return {
    zone: presenceZone(dist, target.radiusM, fix.accuracyM),
    dist,
    far: isFarOutside(dist, target.radiusM, fix.accuracyM),
  };
}

async function rememberFix(fix: Fix, nowMs: number): Promise<void> {
  if (!isValidCoordinate(fix.lat, fix.lon)) return;
  if (fix.accuracyM === null) return;
  await PersistenceService.setLastFix({ lat: fix.lat, lon: fix.lon, timestampMs: nowMs } satisfies LastFix);
}

function dwellMs(session: SessionRecord, atMs: number): number {
  const start = session.actualStartAtMs ?? session.declaredStartAtMs;
  return atMs - start;
}

async function buildRegions(session: SessionRecord, target: Target): Promise<RegionSpec[]> {
  const primary: RegionSpec = {
    identifier: geofenceIdentifier(session.id, target.siteId),
    latitude: target.lat,
    longitude: target.lon,
    radius: osGeofenceRadius(target.radiusM, Platform.OS),
    notifyOnEnter: true,
    notifyOnExit: true,
  };
  const regions = [primary];
  if (session.domainStatus !== "ACTIVA" && session.domainStatus !== "SALIDA") return regions;
  const settings = await SettingsService.load();
  const sites = await PersistenceService.listSites();
  for (const site of sites) {
    if (regions.length >= MAX_MONITORED_REGIONS) break;
    if (site.id === target.siteId || !site.active) continue;
    if (!isValidCoordinate(site.targetLat, site.targetLon)) continue;
    const radius = SiteRegistryService.effectiveRadius(site, settings.company);
    regions.push({
      identifier: geofenceIdentifier(session.id, site.id),
      latitude: site.targetLat!,
      longitude: site.targetLon!,
      radius: osGeofenceRadius(radius, Platform.OS),
      notifyOnEnter: true,
      notifyOnExit: false,
    });
  }
  return regions;
}

async function commitArrival(
  session: SessionRecord,
  siteId: number,
  fix: Fix,
  atMs: number,
  kind: "ENTER" | "SAMPLE",
  acceptReason?: string | null,
): Promise<boolean> {
  if (session.domainStatus !== "ESPERANDO" && session.domainStatus !== "TRASLADO") return false;
  const site = await PersistenceService.getSite(siteId);
  if (!site || !isValidCoordinate(site.targetLat, site.targetLon)) return false;
  const settings = await SettingsService.load();
  const target: Target = {
    siteId,
    lat: site.targetLat!,
    lon: site.targetLon!,
    radiusM: SiteRegistryService.effectiveRadius(site, settings.company),
  };
  const issue = await reliabilityIssue("ENTER", fix, target, atMs);
  const fact: SpatialFact = {
    sessionId: session.id,
    type: "ENTER",
    lat: fix.lat,
    lon: fix.lon,
    accuracyM: fix.accuracyM,
    timestampMs: atMs,
    source: sourceOf(fix.accuracyM),
    reliable: issue === null,
    reason: issue,
    siteId,
  };
  await SessionEngineService.recordSpatialFact(fact);
  if (issue !== null) {
    await appendGeofenceDiag({
      kind,
      region: geofenceIdentifier(session.id, siteId),
      siteId,
      accuracyM: fix.accuracyM,
      accepted: false,
      reason: issue,
      atMs,
    });
    return false;
  }
  await rememberFix(fix, atMs);
  await GeofenceRuntimeService.clearPendingExit();
  const r = await SessionEngineService.dispatch({ type: "ARRIVAL_CONFIRMED", fact }, "GEOFENCE");
  await appendGeofenceDiag({
    kind,
    region: geofenceIdentifier(session.id, siteId),
    siteId,
    accuracyM: fix.accuracyM,
    accepted: r.ok,
    reason: r.ok ? (acceptReason !== undefined ? acceptReason : kind === "SAMPLE" ? "SAMPLE_INSIDE" : null) : String(r.code),
    atMs,
  });
  return r.ok;
}

async function beginTransfer(session: SessionRecord, toSiteId: number, fix: Fix, atMs: number, kind: "ENTER" | "SAMPLE" = "SAMPLE"): Promise<boolean> {
  if (session.domainStatus !== "ACTIVA" && session.domainStatus !== "SALIDA") return false;
  if (toSiteId === session.siteId && session.domainStatus === "ACTIVA") return false;
  const site = await PersistenceService.getSite(toSiteId);
  const settings = await SettingsService.load();
  if (!site || !isValidCoordinate(site.targetLat, site.targetLon)) return false;
  const radius = SiteRegistryService.effectiveRadius(site, settings.company);
  const dist = getDistanceFromLatLonInMeters(fix.lat, fix.lon, site.targetLat!, site.targetLon!);
  if (presenceZone(dist, radius, fix.accuracyM) !== "inside") {
    await appendGeofenceDiag({
      kind,
      region: geofenceIdentifier(session.id, toSiteId),
      siteId: toSiteId,
      accuracyM: fix.accuracyM,
      accepted: false,
      reason: "OUTSIDE_RADIUS",
      atMs,
    });
    return false;
  }
  await GeofenceRuntimeService.clearPendingExit();
  const started = await SessionEngineService.dispatch({ type: "TRANSFER_START", toSiteId }, "GEOFENCE");
  if (!started.ok) {
    await appendGeofenceDiag({
      kind,
      region: geofenceIdentifier(session.id, toSiteId),
      siteId: toSiteId,
      accuracyM: fix.accuracyM,
      accepted: false,
      reason: String(started.code),
      atMs,
    });
    return false;
  }
  await appendGeofenceDiag({
    kind,
    region: geofenceIdentifier(session.id, toSiteId),
    siteId: toSiteId,
    accuracyM: fix.accuracyM,
    accepted: true,
    reason: "TRANSFER",
    atMs,
  });
  const fresh = started.data?.session ?? (await PersistenceService.getOpenSession());
  if (!fresh) return false;
  return commitArrival(fresh, toSiteId, fix, atMs, kind);
}

/** Otro destino activo cuyo radio contiene el fix con holgura. */
async function foreignSiteInside(fix: Fix, exceptSiteId: number | null): Promise<number | null> {
  const settings = await SettingsService.load();
  const sites = await PersistenceService.listSites();
  let best: { id: number; dist: number } | null = null;
  for (const site of sites) {
    if (site.id === exceptSiteId || !site.active) continue;
    if (!isValidCoordinate(site.targetLat, site.targetLon)) continue;
    const radius = SiteRegistryService.effectiveRadius(site, settings.company);
    const dist = getDistanceFromLatLonInMeters(fix.lat, fix.lon, site.targetLat!, site.targetLon!);
    if (presenceZone(dist, radius, fix.accuracyM) !== "inside") continue;
    if (!best || dist < best.dist) best = { id: site.id, dist };
  }
  return best?.id ?? null;
}

export const GeofenceRuntimeService = {
  /** Arranca la geocerca del sitio objetivo y, en sitio o en salida, la de los demás destinos. */
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
        await appendGeofenceDiag({ kind: "REGISTER", region: null, siteId, accuracyM: null, accepted: false, reason: "FOREGROUND_DENIED" });
        return false;
      }
      if (!(await Location.hasServicesEnabledAsync())) {
        LoggingService.log("ROJO", "UBICACION", "ERROR", "servicios de ubicación desactivados");
        await appendGeofenceDiag({ kind: "REGISTER", region: null, siteId, accuracyM: null, accepted: false, reason: "SERVICES_DISABLED" });
        return false;
      }
      const bg = await Location.getBackgroundPermissionsAsync().catch(() => null);
      const session = await PersistenceService.getSession(sessionId);
      const target: Target = { siteId, lat: site.targetLat!, lon: site.targetLon!, radiusM: radius };
      const regions = session
        ? await buildRegions(session, target)
        : [
            {
              identifier: geofenceIdentifier(sessionId, siteId),
              latitude: site.targetLat!,
              longitude: site.targetLon!,
              radius: osGeofenceRadius(radius, Platform.OS),
              notifyOnEnter: true,
              notifyOnExit: true,
            } satisfies RegionSpec,
          ];
      const key = registrationKey(regions);
      const pending = await GeofenceRuntimeService.getPendingExit();
      if (pending && pending.siteId !== siteId) await GeofenceRuntimeService.clearPendingExit();

      const already = key === registeredKey && (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME).catch(() => false));
      if (!already) {
        await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME).catch(() => {});
        await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, regions);
        registeredKey = key;
        LoggingService.log("VERDE", "UBICACION", "INFO", "geocerca iniciada", { sessionId, siteId, radius: regions[0]?.radius, regions: regions.length });
        await appendGeofenceDiag({
          kind: "REGISTER",
          region: geofenceIdentifier(sessionId, siteId),
          siteId,
          accuracyM: null,
          accepted: true,
          reason: bg && bg.status !== "granted" ? "BACKGROUND_NOT_ALWAYS" : null,
        });
      }
      await GeofenceRuntimeService.resumePendingTimer();
      if (session && (session.domainStatus === "ESPERANDO" || session.domainStatus === "TRASLADO")) {
        await GeofenceRuntimeService.confirmPresence();
      }
      return true;
    } catch (error) {
      LoggingService.log("ROJO", "UBICACION", "ERROR", "error iniciando geocerca", serializeError(error));
      registeredKey = null;
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
    registeredKey = null;
    await GeofenceRuntimeService.clearPendingExit();
  },

  async isMonitoring(): Promise<boolean> {
    return Location.hasStartedGeofencingAsync(GEOFENCE_TASK_NAME).catch(() => false);
  },

  recentDiagnostics: readGeofenceDiag,

  /**
   * Si la geocerca nativa no avisa (el operario ya estaba dentro al registrar,
   * o el ENTER se perdió), un fix actual dentro del radio ficha igual.
   */
  async confirmPresence(): Promise<boolean> {
    const ctx = await loadContext();
    if (!ctx) return false;
    if (ctx.session.domainStatus !== "ESPERANDO" && ctx.session.domainStatus !== "TRASLADO") return false;
    const fix = await readFix();
    if (!fix) return false;
    const at = TimeAuthorityService.now();
    return commitArrival(ctx.session, ctx.target.siteId, fix, at, "ENTER", "ALREADY_INSIDE");
  },

  /**
   * Handler de la tarea GEOFENCE. Produce hechos espaciales y, según el
   * estado, intenciones al SessionEngine.
   */
  async handleGeofenceEvent(eventType: Location.GeofencingEventType, region: Location.LocationRegion): Promise<void> {
    const ctx = await loadContext();
    if (!ctx) {
      LoggingService.log("BLANCO", "UBICACION", "DEBUG", "evento de geocerca ignorado: sin jornada abierta");
      await appendGeofenceDiag({
        kind: eventType === Location.GeofencingEventType.Enter ? "ENTER" : "EXIT",
        region: region.identifier ?? null,
        siteId: null,
        accuracyM: null,
        accepted: false,
        reason: "NO_SESSION",
      });
      return;
    }
    const { session, target } = ctx;
    const parsed = region.identifier ? parseGeofenceIdentifier(region.identifier) : null;
    if (!parsed || parsed.sessionId !== session.id) {
      LoggingService.log("AMARILLO", "UBICACION", "WARN", "GEOFENCE_STALE_EVENT_REJECTED", {
        received: region.identifier,
        expected: geofenceIdentifier(session.id, target.siteId),
      });
      await appendGeofenceDiag({
        kind: eventType === Location.GeofencingEventType.Enter ? "ENTER" : "EXIT",
        region: region.identifier ?? null,
        siteId: parsed?.siteId ?? null,
        accuracyM: null,
        accepted: false,
        reason: "STALE_REGION",
      });
      return;
    }
    const type: "ENTER" | "EXIT" = eventType === Location.GeofencingEventType.Enter ? "ENTER" : "EXIT";
    const nowMs = TimeAuthorityService.now();
    if (lastProcessed && lastProcessed.sessionId === session.id && lastProcessed.type === type && nowMs - lastProcessed.atMs < GEOFENCE_ANTI_REBOUNCE_MS) {
      await appendGeofenceDiag({
        kind: type,
        region: region.identifier ?? null,
        siteId: parsed.siteId,
        accuracyM: null,
        accepted: false,
        reason: "ANTI_REBOUNCE",
        atMs: nowMs,
      });
      return;
    }

    const fix = await readFix();
    if (parsed.siteId !== target.siteId) {
      if (type === "ENTER" && fix) await beginTransfer(session, parsed.siteId, fix, nowMs, "ENTER");
      else {
        await appendGeofenceDiag({
          kind: type,
          region: region.identifier ?? null,
          siteId: parsed.siteId,
          accuracyM: fix?.accuracyM ?? null,
          accepted: false,
          reason: fix ? "NOT_MONITORED" : "NO_FIX",
          atMs: nowMs,
        });
      }
      return;
    }

    lastProcessed = { sessionId: session.id, type, atMs: nowMs };
    const issue = await reliabilityIssue(type, fix, target, nowMs);
    const { far, zone } = zoneOf(fix, target);
    let reason = issue;
    if (type === "EXIT" && !shouldArmExit({ zone, far, dwellMs: dwellMs(session, nowMs) })) {
      reason = zone === "inside" ? "INSIDE_RADIUS" : "FLICKER_DWELL";
    }
    const fact: SpatialFact = {
      sessionId: session.id,
      type,
      lat: fix?.lat ?? null,
      lon: fix?.lon ?? null,
      accuracyM: fix?.accuracyM ?? null,
      timestampMs: nowMs,
      source: sourceOf(fix?.accuracyM ?? null),
      reliable: reason === null,
      reason,
      siteId: target.siteId,
    };
    await SessionEngineService.recordSpatialFact(fact);
    if (fix && reason === null) await rememberFix(fix, nowMs);

    if (type === "ENTER") {
      const pending = await GeofenceRuntimeService.getPendingExit();
      if (pending && pending.sessionId === session.id && zone !== "outside") {
        const sameSite = pending.siteId === target.siteId;
        await GeofenceRuntimeService.clearPendingExit();
        await appendGeofenceDiag({
          kind: "ENTER",
          region: region.identifier ?? null,
          siteId: target.siteId,
          accuracyM: fix?.accuracyM ?? null,
          accepted: true,
          reason: "RETURNED",
          atMs: nowMs,
        });
        if (sameSite) return;
      }
      if ((session.domainStatus === "ESPERANDO" || session.domainStatus === "TRASLADO") && reason === null && fix) {
        const r = await SessionEngineService.dispatch({ type: "ARRIVAL_CONFIRMED", fact }, "GEOFENCE");
        await appendGeofenceDiag({
          kind: "ENTER",
          region: region.identifier ?? null,
          siteId: target.siteId,
          accuracyM: fix.accuracyM,
          accepted: r.ok,
          reason: r.ok ? null : String(r.code),
          atMs: nowMs,
        });
        return;
      }
      await appendGeofenceDiag({
        kind: "ENTER",
        region: region.identifier ?? null,
        siteId: target.siteId,
        accuracyM: fix?.accuracyM ?? null,
        accepted: reason === null,
        reason,
        atMs: nowMs,
      });
      return;
    }

    if (session.domainStatus !== "ACTIVA") {
      await appendGeofenceDiag({
        kind: "EXIT",
        region: region.identifier ?? null,
        siteId: target.siteId,
        accuracyM: fix?.accuracyM ?? null,
        accepted: false,
        reason: "NOT_MONITORED",
        atMs: nowMs,
      });
      return;
    }
    const existing = await GeofenceRuntimeService.getPendingExit();
    if (existing && existing.sessionId === session.id) {
      await appendGeofenceDiag({
        kind: "EXIT",
        region: region.identifier ?? null,
        siteId: target.siteId,
        accuracyM: fix?.accuracyM ?? null,
        accepted: false,
        reason: "ANTI_REBOUNCE",
        atMs: nowMs,
      });
      return;
    }
    if (!shouldArmExit({ zone, far, dwellMs: dwellMs(session, nowMs) })) {
      await appendGeofenceDiag({
        kind: "EXIT",
        region: region.identifier ?? null,
        siteId: target.siteId,
        accuracyM: fix?.accuracyM ?? null,
        accepted: false,
        reason: reason ?? "FLICKER_DWELL",
        atMs: nowMs,
      });
      return;
    }
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
    await appendGeofenceDiag({
      kind: "EXIT",
      region: region.identifier ?? null,
      siteId: target.siteId,
      accuracyM: fix?.accuracyM ?? null,
      accepted: true,
      reason: fact.reliable ? null : (fact.reason ?? null),
      atMs: nowMs,
    });
  },

  /** Solo pruebas: limpia anti-rebote, temporizador y la firma de registro. */
  __resetForTests(): void {
    lastProcessed = null;
    registeredKey = null;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = null;
  },

  armDebounceTimer(ms: number): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      GeofenceRuntimeService.checkPendingExit().catch(() => {});
    }, ms);
  },

  /** Rearma el debounce con el tiempo que falta si el proceso murió a medias. */
  async resumePendingTimer(): Promise<void> {
    const pending = await GeofenceRuntimeService.getPendingExit();
    if (!pending) return;
    const settings = await SettingsService.load();
    const remain = Math.max(0, pending.firstExitAtMs + settings.company.exitDebounceMs - TimeAuthorityService.now());
    GeofenceRuntimeService.armDebounceTimer(remain);
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
   * Confirma la salida pendiente si venció el debounce (o los strikes) y un
   * fix actual sigue fuera con histéresis. Dentro, o un rebote al llegar, la
   * anula: eso es el cierre de 0.00 h.
   */
  async checkPendingExit(): Promise<boolean> {
    const pending = await GeofenceRuntimeService.getPendingExit();
    if (!pending) return false;
    const ctx = await loadContext();
    if (!ctx || ctx.session.id !== pending.sessionId || ctx.session.domainStatus !== "ACTIVA") {
      await GeofenceRuntimeService.clearPendingExit();
      return false;
    }
    const nowMs = TimeAuthorityService.now();
    const fix = await readFix();
    const { zone, far } = zoneOf(fix, ctx.target);
    const gate = confirmExitDecision({
      zone,
      far,
      dwellMs: dwellMs(ctx.session, pending.firstExitAtMs),
      elapsedMs: nowMs - pending.firstExitAtMs,
      debounceMs: ctx.exitDebounceMs,
      strikes: pending.strikes,
      pendingReliable: pending.reliable,
    });
    if (gate === "clear") {
      await GeofenceRuntimeService.clearPendingExit();
      await appendGeofenceDiag({
        kind: "EXIT",
        region: geofenceIdentifier(ctx.session.id, ctx.target.siteId),
        siteId: ctx.target.siteId,
        accuracyM: fix?.accuracyM ?? null,
        accepted: false,
        reason: zone === "inside" ? "INSIDE_RADIUS" : "FLICKER_DWELL",
        atMs: nowMs,
      });
      return false;
    }
    if (gate === "wait") return false;
    await GeofenceRuntimeService.clearPendingExit();
    const reliable = pending.reliable && zone === "outside";
    const fact: SpatialFact = {
      sessionId: pending.sessionId,
      type: "EXIT",
      lat: null,
      lon: null,
      accuracyM: fix?.accuracyM ?? null,
      timestampMs: pending.firstExitAtMs,
      source: "unknown",
      reliable,
      reason: reliable ? null : (pending.reason ?? "HYSTERESIS"),
      siteId: pending.siteId,
    };
    const r = await SessionEngineService.dispatch({ type: "EXIT_DETECTED", fact }, "GEOFENCE");
    await appendGeofenceDiag({
      kind: "EXIT",
      region: geofenceIdentifier(pending.sessionId, pending.siteId ?? ctx.target.siteId),
      siteId: pending.siteId,
      accuracyM: fix?.accuracyM ?? null,
      accepted: r.ok,
      reason: r.ok ? null : String(r.code),
      atMs: nowMs,
    });
    return r.ok;
  },

  /**
   * Muestra que ya entrega el servicio en primer plano (también en «Solo
   * geocerca», perfil de espera). No graba rastro: solo confirma llegada,
   * salida o traslado cuando la geocerca nativa no avisó.
   */
  async observeSample(sample: { lat: number; lon: number; accuracyM: number | null; speedMps?: number | null; timestampMs?: number }): Promise<void> {
    const ctx = await loadContext();
    if (!ctx) return;
    const nowMs = TimeAuthorityService.now();
    const at = sample.timestampMs ?? nowMs;
    if (Math.abs(nowMs - at) > SAMPLE_MAX_AGE_MS) {
      await appendGeofenceDiag({
        kind: "SAMPLE",
        region: geofenceIdentifier(ctx.session.id, ctx.target.siteId),
        siteId: ctx.target.siteId,
        accuracyM: sample.accuracyM,
        accepted: false,
        reason: "STALE_SAMPLE",
        atMs: nowMs,
      });
      return;
    }
    const fix: Fix = { lat: sample.lat, lon: sample.lon, accuracyM: sample.accuracyM, speedMps: sample.speedMps ?? null, timestampMs: at };
    const { zone } = zoneOf(fix, ctx.target);
    const { session, target } = ctx;
    const pending = await GeofenceRuntimeService.getPendingExit();
    if (pending && pending.sessionId === session.id && zone === "inside") {
      await GeofenceRuntimeService.clearPendingExit();
      await appendGeofenceDiag({
        kind: "SAMPLE",
        region: geofenceIdentifier(session.id, target.siteId),
        siteId: target.siteId,
        accuracyM: sample.accuracyM,
        accepted: true,
        reason: "RETURNED",
        atMs: at,
      });
      return;
    }

    if ((session.domainStatus === "ESPERANDO" || session.domainStatus === "TRASLADO") && zone === "inside") {
      await commitArrival(session, target.siteId, fix, at, "SAMPLE");
      return;
    }

    if (session.domainStatus === "SALIDA" && zone === "inside") {
      const r = await SessionEngineService.dispatch({ type: "STAY_WORKING" }, "GEOFENCE");
      await appendGeofenceDiag({
        kind: "SAMPLE",
        region: geofenceIdentifier(session.id, target.siteId),
        siteId: target.siteId,
        accuracyM: sample.accuracyM,
        accepted: r.ok,
        reason: r.ok ? "STAY" : String(r.code),
        atMs: at,
      });
      return;
    }

    if (session.domainStatus === "ACTIVA" || session.domainStatus === "SALIDA") {
      const other = await foreignSiteInside(fix, target.siteId);
      const dwell = dwellMs(session, at);
      const farFromHere = isFarOutside(getDistanceFromLatLonInMeters(fix.lat, fix.lon, target.lat, target.lon), target.radiusM, fix.accuracyM);
      if (other !== null && (session.domainStatus === "SALIDA" || dwell >= MIN_DWELL_BEFORE_EXIT_MS || farFromHere)) {
        await beginTransfer(session, other, fix, at);
        return;
      }
    }

    if (pending && pending.sessionId === session.id && zone === "outside") {
      await PersistenceService.setKv(KV_KEYS.PENDING_EXIT, { ...pending, strikes: pending.strikes + 1 });
      await GeofenceRuntimeService.checkPendingExit();
      return;
    }

    if (session.domainStatus === "ACTIVA" && zone === "outside") {
      const { far } = zoneOf(fix, target);
      if (!shouldArmExit({ zone, far, dwellMs: dwellMs(session, at) })) return;
      const armed: PendingExit = {
        sessionId: session.id,
        siteId: target.siteId,
        firstExitAtMs: at,
        reliable: true,
        reason: null,
        strikes: 1,
      };
      await PersistenceService.setKv(KV_KEYS.PENDING_EXIT, armed);
      GeofenceRuntimeService.armDebounceTimer(ctx.exitDebounceMs);
      await appendGeofenceDiag({
        kind: "SAMPLE",
        region: geofenceIdentifier(session.id, target.siteId),
        siteId: target.siteId,
        accuracyM: sample.accuracyM,
        accepted: true,
        reason: "SAMPLE_OUTSIDE",
        atMs: at,
      });
      await GeofenceRuntimeService.checkPendingExit();
    }
  },

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
   * ¿Está claramente fuera del radio (histéresis incluida)? null si el fix
   * no alcanza para decirlo. true solo confirma un cierre AUTO.
   */
  async isCurrentlyOutside(): Promise<boolean | null> {
    const ctx = await loadContext();
    if (!ctx) return null;
    const fix = await readFix();
    const { zone } = zoneOf(fix, ctx.target);
    if (zone === "outside") return true;
    if (zone === "inside") return false;
    return null;
  },

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

export async function clearLegacyLocationKeys(): Promise<void> {
  await AsyncStorage.multiRemove(["LAST_GEOFENCE_EXIT_TIMESTAMP", "LAST_VALID_LOCATION", "GPS_DRIFT_COUNTER"]).catch(() => {});
}
