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
import { t } from "../../i18n";
import { activeCorporateTimezone, formatTime } from "../../utils/dateUtils";
import { getDistanceFromLatLonInMeters, isValidCoordinate } from "../../utils/geoUtils";
import { serializeError } from "../../utils/serializeError";
import { resolveArrivalDwellMs } from "../domain/arrivalDwell";
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
  EXIT_ACCURACY_MAX_M,
  EXIT_READING_INTERVAL_MS,
  clampSampleTimestamp,
  classifyExitReading,
  confirmExitDecision,
  effectiveJumpMeters,
  isFarOutside,
  movementIssue,
  osGeofenceRadius,
  parseGeofenceIdentifier,
  presenceZone,
  shouldArmExit,
  type PresenceZone,
} from "./geofencePolicy";
import { noteMockedFix } from "./mockLocationNotice";
import { NotificationService } from "./NotificationService";

export interface PendingExit {
  sessionId: number;
  siteId: number | null;
  firstExitAtMs: number;
  reliable: boolean;
  reason: string | null;
  strikes: number;
  /** Hora de la última lectura que sumó, o la del EXIT que abrió la cuenta. */
  lastReadingAtMs?: number;
}

interface Fix {
  lat: number;
  lon: number;
  accuracyM: number | null;
  speedMps: number | null;
  timestampMs: number;
  /** Proveedor simulado (expo-location, Android). */
  mocked?: boolean;
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

let lastProcessed: { sessionId: number; siteId: number; type: "ENTER" | "EXIT"; atMs: number } | null = null;
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
      mocked: loc.mocked === true,
    };
  } catch {
    return null;
  }
}

async function jumpAgainstLast(fix: Fix, nowMs: number): Promise<{ jumpM: number | null; jumpDtMs: number | null }> {
  const last = await PersistenceService.getLastFix();
  if (!last) return { jumpM: null, jumpDtMs: null };
  const distanceM = getDistanceFromLatLonInMeters(fix.lat, fix.lon, last.lat, last.lon);
  if (!Number.isFinite(distanceM)) return { jumpM: null, jumpDtMs: null };
  const at = clampSampleTimestamp(fix.timestampMs, nowMs);
  return {
    jumpM: effectiveJumpMeters(distanceM, fix.accuracyM, last.accuracyM),
    jumpDtMs: at - last.timestampMs,
  };
}

/**
 * null = el fix corrobora el evento. Si no, el motivo (no ficha solo).
 * Llegar en vehículo es fiable: el veto de 15 km/h y el salto fijo de 500 m
 * rechazaban entradas reales entre obras.
 */
async function reliabilityIssue(type: "ENTER" | "EXIT", fix: Fix | null, target: Target, nowMs: number): Promise<string | null> {
  if (!fix) return "NO_FIX";
  if (fix.mocked) return "MOCK_LOCATION";
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
  if (!fix || fix.mocked) return { zone: "unknown", dist: NaN, far: false };
  const dist = getDistanceFromLatLonInMeters(fix.lat, fix.lon, target.lat, target.lon);
  return {
    zone: presenceZone(dist, target.radiusM, fix.accuracyM),
    dist,
    far: isFarOutside(dist, target.radiusM, fix.accuracyM),
  };
}

/** Guarda la hora del fix (acotada) y su precisión. Un mock no pasa a ser la referencia. */
async function rememberFix(fix: Fix): Promise<void> {
  if (fix.mocked) return;
  if (!isValidCoordinate(fix.lat, fix.lon)) return;
  if (fix.accuracyM === null || !Number.isFinite(fix.accuracyM)) return;
  const nowMs = TimeAuthorityService.now();
  await PersistenceService.setLastFix({
    lat: fix.lat,
    lon: fix.lon,
    timestampMs: clampSampleTimestamp(fix.timestampMs, nowMs),
    accuracyM: fix.accuracyM,
  });
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

/**
 * Instante de cierre de la llegada. No pasa de la hora de confianza, y si ya
 * hay un ENTER fiable del destino (el del 1:09 que no fichó solo), se cierra
 * ahí: es la llegada real, no el reloj adelantado de la muestra.
 */
async function arrivalInstant(session: SessionRecord, siteId: number, atMs: number): Promise<number> {
  const now = TimeAuthorityService.now();
  let at = clampSampleTimestamp(atMs, now);
  if (session.domainStatus !== "ESPERANDO" && session.domainStatus !== "TRASLADO") return at;
  const open = session.transitSegments.find((t) => t.endAtMs === null && !t.cancelled && !t.suppressed);
  const floor = open?.startAtMs ?? session.actualStartAtMs ?? session.declaredStartAtMs;
  const enters = await PersistenceService.listSpatialFacts(session.id, ["ENTER"]);
  for (const fact of enters) {
    if (!fact.reliable || fact.siteId !== siteId) continue;
    if (fact.timestampMs < floor || fact.timestampMs > now) continue;
    if (fact.timestampMs < at) at = fact.timestampMs;
  }
  return at;
}

interface ArrivalHold {
  sessionId: number;
  siteId: number;
  sinceMs: number;
  fact: SpatialFact;
}

async function arrivalDwellFor(siteId: number): Promise<number> {
  const site = await PersistenceService.getSite(siteId);
  const settings = await SettingsService.load();
  return resolveArrivalDwellMs(site, settings.company);
}

type HoldGate = { action: "continue" } | { action: "waiting" } | { action: "dispatched"; ok: boolean };

/**
 * Si ya hay una espera en curso para este sitio: o sigue esperando (sin otro
 * ENTER) o ya cumplió y ficha con la hora de la primera lectura. 0 ms no espera.
 */
async function consumeArrivalHold(session: SessionRecord, siteId: number, kind: "ENTER" | "SAMPLE", silentWait = false): Promise<HoldGate> {
  const dwell = await arrivalDwellFor(siteId);
  if (dwell <= 0) {
    await PersistenceService.deleteKv(KV_KEYS.ARRIVAL_DWELL).catch(() => {});
    return { action: "continue" };
  }
  const pending = await PersistenceService.getKv<ArrivalHold>(KV_KEYS.ARRIVAL_DWELL);
  if (!pending || pending.sessionId !== session.id || pending.siteId !== siteId) return { action: "continue" };
  const now = TimeAuthorityService.now();
  if (now - pending.sinceMs < dwell) {
    if (!silentWait) {
      await appendGeofenceDiag({
        kind,
        region: geofenceIdentifier(session.id, siteId),
        siteId,
        accuracyM: pending.fact.accuracyM,
        accepted: false,
        reason: "ARRIVAL_DWELL",
        atMs: now,
      });
    }
    return { action: "waiting" };
  }
  await PersistenceService.deleteKv(KV_KEYS.ARRIVAL_DWELL);
  const r = await SessionEngineService.dispatch({ type: "ARRIVAL_CONFIRMED", fact: pending.fact }, "GEOFENCE");
  if (r.ok) await NotificationService.notifyArrivalRegistered(session.id, formatTime(pending.fact.timestampMs)).catch(() => {});
  await appendGeofenceDiag({
    kind,
    region: geofenceIdentifier(session.id, siteId),
    siteId,
    accuracyM: pending.fact.accuracyM,
    accepted: r.ok,
    reason: r.ok ? "ARRIVAL_DWELL_ELAPSED" : String(r.code),
    atMs: pending.sinceMs,
  });
  return { action: "dispatched", ok: r.ok };
}

async function rememberArrivalHold(session: SessionRecord, fact: SpatialFact, kind: "ENTER" | "SAMPLE"): Promise<void> {
  const siteId = fact.siteId;
  if (siteId == null) return;
  await PersistenceService.setKv(KV_KEYS.ARRIVAL_DWELL, {
    sessionId: session.id,
    siteId,
    sinceMs: fact.timestampMs,
    fact,
  });
  await appendGeofenceDiag({
    kind,
    region: geofenceIdentifier(session.id, siteId),
    siteId,
    accuracyM: fact.accuracyM,
    accepted: false,
    reason: "ARRIVAL_DWELL",
    atMs: fact.timestampMs,
  });
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
  const held = await consumeArrivalHold(session, siteId, kind);
  if (held.action === "waiting") return false;
  if (held.action === "dispatched") return held.ok;
  atMs = await arrivalInstant(session, siteId, atMs);
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
  if (issue === "MOCK_LOCATION") await noteMockedFix(session.id);
  if (!fix.mocked) await rememberFix(fix);
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
    ...(fix.mocked ? { mocked: true } : {}),
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
  await GeofenceRuntimeService.clearPendingExit();
  if ((await arrivalDwellFor(siteId)) > 0) {
    await rememberArrivalHold(session, fact, kind);
    return false;
  }
  const r = await SessionEngineService.dispatch({ type: "ARRIVAL_CONFIRMED", fact }, "GEOFENCE");
  if (r.ok) await NotificationService.notifyArrivalRegistered(session.id, formatTime(fact.timestampMs)).catch(() => {});
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
  if (fix.mocked) {
    await noteMockedFix(session.id);
    await appendGeofenceDiag({
      kind,
      region: geofenceIdentifier(session.id, toSiteId),
      siteId: toSiteId,
      accuracyM: fix.accuracyM,
      accepted: false,
      reason: "MOCK_LOCATION",
      atMs,
    });
    return false;
  }
  if (session.domainStatus === "TRASLADO") {
    const open = session.transitSegments.find((t) => t.endAtMs === null && !t.cancelled && !t.suppressed);
    if (open && open.toSiteId === toSiteId) return commitArrival(session, toSiteId, fix, atMs, kind);
    return false;
  }
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

interface ReregisterGuard {
  sessionId: number;
  siteId: number;
  atMs: number;
}

const REREGISTER_GUARD_MS = 60_000;
const OFFSITE_STILL_MS = 10 * 60_000;

interface OffsiteStill {
  sessionId: number;
  latKey: string;
  lonKey: string;
  sinceMs: number;
  prompted: string[];
}

async function reregisterGuard(sessionId: number): Promise<ReregisterGuard | null> {
  const guard = await PersistenceService.getKv<ReregisterGuard>(KV_KEYS.REREGISTER_EXIT_GUARD);
  if (!guard || guard.sessionId !== sessionId) return null;
  return guard;
}

/** Tras cancelar un traslado lejos del origen, el EXIT de re-registro no es una salida nueva. */
async function maybeArmReregisterGuard(session: SessionRecord | null | undefined, target: Target): Promise<void> {
  if (!session || session.domainStatus !== "ACTIVA") return;
  const latest = session.transitSegments[session.transitSegments.length - 1];
  if (!latest?.cancelled || latest.endAtMs == null) return;
  const now = TimeAuthorityService.now();
  if (now - latest.endAtMs > REREGISTER_GUARD_MS) {
    await PersistenceService.deleteKv(KV_KEYS.REREGISTER_EXIT_GUARD).catch(() => {});
    return;
  }
  const fix = await readFix();
  if (zoneOf(fix, target).zone === "inside") {
    await PersistenceService.deleteKv(KV_KEYS.REREGISTER_EXIT_GUARD).catch(() => {});
    return;
  }
  await PersistenceService.setKv(KV_KEYS.REREGISTER_EXIT_GUARD, {
    sessionId: session.id,
    siteId: target.siteId,
    atMs: latest.endAtMs,
  } satisfies ReregisterGuard);
}

function corporateDay(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: activeCorporateTimezone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

/** N06: 10 min quieto, fuera del radio, en ESPERANDO. Una vez por punto y día. No cambia el estado. */
async function maybeNotifyOffsite(session: SessionRecord, fix: Fix, target: Target, atMs: number): Promise<void> {
  if (session.domainStatus !== "ESPERANDO") return;
  const dist = getDistanceFromLatLonInMeters(fix.lat, fix.lon, target.lat, target.lon);
  if (!Number.isFinite(dist) || dist <= target.radiusM) return;
  if (fix.accuracyM === null || !Number.isFinite(fix.accuracyM) || fix.accuracyM < 0 || fix.accuracyM > EXIT_ACCURACY_MAX_M) return;
  const latKey = fix.lat.toFixed(3);
  const lonKey = fix.lon.toFixed(3);
  const pointKey = `${corporateDay(atMs)}:${latKey}:${lonKey}`;
  const prev = await PersistenceService.getKv<OffsiteStill>(KV_KEYS.OFFSITE_PROMPT);
  const same = prev && prev.sessionId === session.id && prev.latKey === latKey && prev.lonKey === lonKey;
  const prompted = prev?.prompted ?? [];
  if (prompted.includes(pointKey)) return;
  const sinceMs = same ? prev.sinceMs : atMs;
  if (!same || atMs - sinceMs < OFFSITE_STILL_MS) {
    await PersistenceService.setKv(KV_KEYS.OFFSITE_PROMPT, { sessionId: session.id, latKey, lonKey, sinceMs, prompted });
    return;
  }
  let address = t("notifications.offsiteTitle");
  try {
    const rows = await Location.reverseGeocodeAsync({ latitude: fix.lat, longitude: fix.lon });
    const row = rows?.[0];
    if (row) {
      const line = [row.street, row.city, row.name].filter((part) => !!part && String(part).trim()).join(", ");
      if (line) address = line;
    }
  } catch {
    address = t("notifications.offsiteTitle");
  }
  await NotificationService.notifyOffsite(session.id, address);
  await PersistenceService.setKv(KV_KEYS.OFFSITE_PROMPT, {
    sessionId: session.id,
    latKey,
    lonKey,
    sinceMs,
    prompted: [...prompted, pointKey],
  });
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
      await maybeArmReregisterGuard(session, target);
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
    if (
      lastProcessed &&
      lastProcessed.sessionId === session.id &&
      lastProcessed.siteId === parsed.siteId &&
      lastProcessed.type === type &&
      nowMs - lastProcessed.atMs < GEOFENCE_ANTI_REBOUNCE_MS
    ) {
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

    lastProcessed = { sessionId: session.id, siteId: parsed.siteId, type, atMs: nowMs };
    const issue = await reliabilityIssue(type, fix, target, nowMs);
    const { far, zone } = zoneOf(fix, target);
    let reason = issue;
    if (type === "EXIT" && !shouldArmExit({ zone, far, dwellMs: dwellMs(session, nowMs) })) {
      if (zone === "inside") reason = "INSIDE_RADIUS";
      else if (reason === null) reason = "FLICKER_DWELL";
    }
    if (issue === "MOCK_LOCATION") await noteMockedFix(session.id);
    if (fix && !fix.mocked) await rememberFix(fix);
    if (type === "ENTER" && (session.domainStatus === "ESPERANDO" || session.domainStatus === "TRASLADO")) {
      const held = await consumeArrivalHold(session, target.siteId, "ENTER");
      if (held.action !== "continue") return;
    }
    if (type === "EXIT") await PersistenceService.deleteKv(KV_KEYS.ARRIVAL_DWELL).catch(() => {});
    const guard = type === "EXIT" ? await reregisterGuard(session.id) : null;
    const guarded = guard !== null && session.domainStatus === "ACTIVA";
    const fact: SpatialFact = {
      sessionId: session.id,
      type,
      lat: fix?.lat ?? null,
      lon: fix?.lon ?? null,
      accuracyM: fix?.accuracyM ?? null,
      timestampMs: nowMs,
      source: sourceOf(fix?.accuracyM ?? null),
      reliable: guarded ? false : reason === null,
      reason: guarded ? "REREGISTER_GUARD" : reason,
      siteId: target.siteId,
      ...(fix?.mocked ? { mocked: true } : {}),
    };
    await SessionEngineService.recordSpatialFact(fact);
    if (guarded) {
      await NotificationService.notifyReturnOrFinish(session.id).catch(() => {});
      await appendGeofenceDiag({
        kind: "EXIT",
        region: region.identifier ?? null,
        siteId: target.siteId,
        accuracyM: fix?.accuracyM ?? null,
        accepted: false,
        reason: "REREGISTER_GUARD",
        atMs: nowMs,
      });
      return;
    }

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
        if (sameSite) {
          const openDest = session.transitSegments.find((t) => t.endAtMs === null && !t.cancelled && !t.suppressed);
          const arriving =
            (session.domainStatus === "ESPERANDO" || session.domainStatus === "TRASLADO") &&
            (openDest ? openDest.toSiteId === target.siteId : session.domainStatus === "ESPERANDO");
          if (!arriving) return;
        }
      }
      if ((session.domainStatus === "ESPERANDO" || session.domainStatus === "TRASLADO") && reason === null && fix) {
        if ((await arrivalDwellFor(target.siteId)) > 0) {
          await rememberArrivalHold(session, fact, "ENTER");
          return;
        }
        const r = await SessionEngineService.dispatch({ type: "ARRIVAL_CONFIRMED", fact }, "GEOFENCE");
        if (r.ok) await NotificationService.notifyArrivalRegistered(session.id, formatTime(fact.timestampMs)).catch(() => {});
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
      // Un EXIT posterior no es un rebote que se tira: refresca la salida
      // pendiente y se vuelve a decidir. El anti-rebote de unos segundos
      // sigue arriba (GEOFENCE_ANTI_REBOUNCE_MS).
      const refreshed: PendingExit = {
        ...existing,
        reliable: existing.reliable || fact.reliable,
        reason: existing.reason ?? fact.reason ?? null,
      };
      await PersistenceService.setKv(KV_KEYS.PENDING_EXIT, refreshed);
      const confirmed = await GeofenceRuntimeService.checkPendingExit();
      await appendGeofenceDiag({
        kind: "EXIT",
        region: region.identifier ?? null,
        siteId: target.siteId,
        accuracyM: fix?.accuracyM ?? null,
        accepted: confirmed,
        reason: confirmed ? null : "EXIT_REFRESHED",
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
      strikes: 1,
      lastReadingAtMs: nowMs,
    };
    await PersistenceService.setKv(KV_KEYS.PENDING_EXIT, pending);
    GeofenceRuntimeService.armDebounceTimer(EXIT_READING_INTERVAL_MS);
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

  /** Rearma la siguiente lectura (15 s) si el proceso murió a medias. */
  async resumePendingTimer(): Promise<void> {
    const pending = await GeofenceRuntimeService.getPendingExit();
    if (!pending) return;
    const last = pending.lastReadingAtMs ?? pending.firstExitAtMs;
    const remain = Math.max(0, last + EXIT_READING_INTERVAL_MS - TimeAuthorityService.now());
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
    if (fix?.mocked) {
      await noteMockedFix(ctx.session.id);
      await appendGeofenceDiag({
        kind: "EXIT",
        region: geofenceIdentifier(ctx.session.id, ctx.target.siteId),
        siteId: ctx.target.siteId,
        accuracyM: fix.accuracyM,
        accepted: false,
        reason: "MOCK_LOCATION",
        atMs: nowMs,
      });
      return false;
    }
    if (await reregisterGuard(ctx.session.id)) {
      await GeofenceRuntimeService.clearPendingExit();
      return false;
    }
    const { zone, far, dist } = zoneOf(fix, ctx.target);
    const reading = fix ? classifyExitReading(dist, ctx.target.radiusM, fix.accuracyM) : "ignore";
    const dwell = dwellMs(ctx.session, pending.firstExitAtMs);
    if (reading === "inside" || (dwell < MIN_DWELL_BEFORE_EXIT_MS && !far)) {
      await GeofenceRuntimeService.clearPendingExit();
      await appendGeofenceDiag({
        kind: "EXIT",
        region: geofenceIdentifier(ctx.session.id, ctx.target.siteId),
        siteId: ctx.target.siteId,
        accuracyM: fix?.accuracyM ?? null,
        accepted: false,
        reason: reading === "inside" ? "INSIDE_RADIUS" : "FLICKER_DWELL",
        atMs: nowMs,
      });
      return false;
    }
    let strikes = pending.strikes;
    const lastReading = pending.lastReadingAtMs ?? pending.firstExitAtMs;
    if (reading === "outside" && nowMs - lastReading >= EXIT_READING_INTERVAL_MS) {
      strikes += 1;
      await PersistenceService.setKv(KV_KEYS.PENDING_EXIT, { ...pending, strikes, lastReadingAtMs: nowMs });
    }
    const gate = confirmExitDecision({
      zone: reading === "outside" ? "outside" : "unknown",
      far: reading === "outside" && far,
      dwellMs: dwell,
      elapsedMs: nowMs - pending.firstExitAtMs,
      debounceMs: 0,
      strikes,
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
    if (gate === "wait") {
      GeofenceRuntimeService.armDebounceTimer(EXIT_READING_INTERVAL_MS);
      return false;
    }
    await GeofenceRuntimeService.clearPendingExit();
    const reliable = pending.reliable && reading === "outside";
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
   * Si la espera de llegada ya se cumplió, ficha con la hora de la primera
   * lectura. No dispara un temporizador: la siguiente muestra o el worker lo llaman.
   */
  async flushArrivalDwell(): Promise<boolean> {
    const pending = await PersistenceService.getKv<ArrivalHold>(KV_KEYS.ARRIVAL_DWELL);
    if (!pending) return false;
    const session = await PersistenceService.getSession(pending.sessionId);
    if (!session || (session.domainStatus !== "ESPERANDO" && session.domainStatus !== "TRASLADO")) {
      await PersistenceService.deleteKv(KV_KEYS.ARRIVAL_DWELL).catch(() => {});
      return false;
    }
    const held = await consumeArrivalHold(session, pending.siteId, "SAMPLE", true);
    return held.action === "dispatched" && held.ok;
  },

  /**
   * Muestra que ya entrega el servicio en primer plano (también en «Solo
   * geocerca», perfil de espera). No graba rastro: solo confirma llegada,
   * salida o traslado cuando la geocerca nativa no avisó.
   */
  async observeSample(sample: {
    lat: number;
    lon: number;
    accuracyM: number | null;
    speedMps?: number | null;
    timestampMs?: number;
    mocked?: boolean;
  }): Promise<void> {
    const ctx = await loadContext();
    if (!ctx) return;
    const nowMs = TimeAuthorityService.now();
    const rawAt = sample.timestampMs ?? nowMs;
    if (Math.abs(nowMs - rawAt) > SAMPLE_MAX_AGE_MS) {
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
    const at = clampSampleTimestamp(rawAt, nowMs);
    const fix: Fix = {
      lat: sample.lat,
      lon: sample.lon,
      accuracyM: sample.accuracyM,
      speedMps: sample.speedMps ?? null,
      timestampMs: at,
      mocked: sample.mocked === true,
    };
    try {
    if (fix.mocked) {
      await noteMockedFix(ctx.session.id);
      await appendGeofenceDiag({
        kind: "SAMPLE",
        region: geofenceIdentifier(ctx.session.id, ctx.target.siteId),
        siteId: ctx.target.siteId,
        accuracyM: sample.accuracyM,
        accepted: false,
        reason: "MOCK_LOCATION",
        atMs: at,
      });
      return;
    }
    const { zone } = zoneOf(fix, ctx.target);
    const { session, target } = ctx;
    const pending = await GeofenceRuntimeService.getPendingExit();
    if (pending && pending.sessionId === session.id && zone === "inside") {
      await GeofenceRuntimeService.clearPendingExit();
      const openDest = session.transitSegments.find((t) => t.endAtMs === null && !t.cancelled && !t.suppressed);
      const arriving =
        (session.domainStatus === "ESPERANDO" || session.domainStatus === "TRASLADO") &&
        (openDest ? openDest.toSiteId === target.siteId : session.domainStatus === "ESPERANDO");
      if (!arriving) {
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
    }

    if ((session.domainStatus === "ESPERANDO" || session.domainStatus === "TRASLADO") && zone !== "inside") {
      await PersistenceService.deleteKv(KV_KEYS.ARRIVAL_DWELL).catch(() => {});
      if (session.domainStatus === "ESPERANDO") await maybeNotifyOffsite(session, fix, target, at);
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

    if (pending && pending.sessionId === session.id && (zone === "outside" || zone === "unknown")) {
      await GeofenceRuntimeService.checkPendingExit();
      return;
    }

    if (session.domainStatus === "ACTIVA" && zone === "outside") {
      if (await reregisterGuard(session.id)) {
        await NotificationService.notifyReturnOrFinish(session.id).catch(() => {});
        return;
      }
      const { far } = zoneOf(fix, target);
      const sampleReading = classifyExitReading(getDistanceFromLatLonInMeters(fix.lat, fix.lon, target.lat, target.lon), target.radiusM, fix.accuracyM);
      if (sampleReading !== "outside") return;
      if (!shouldArmExit({ zone, far, dwellMs: dwellMs(session, at) })) return;
      const armed: PendingExit = {
        sessionId: session.id,
        siteId: target.siteId,
        firstExitAtMs: at,
        reliable: true,
        reason: null,
        strikes: 1,
        lastReadingAtMs: at,
      };
      await PersistenceService.setKv(KV_KEYS.PENDING_EXIT, armed);
      GeofenceRuntimeService.armDebounceTimer(EXIT_READING_INTERVAL_MS);
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
    } finally {
      await rememberFix(fix);
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
  /** Al reanudar, si ya estás fuera, esta lectura es la 1.ª de la cuenta (D-20). */
  async sampleExitAfterResume(): Promise<void> {
    const ctx = await loadContext();
    if (!ctx || ctx.session.domainStatus !== "ACTIVA") return;
    const fix = await readFix();
    if (!fix || fix.mocked) return;
    const nowMs = TimeAuthorityService.now();
    const dist = getDistanceFromLatLonInMeters(fix.lat, fix.lon, ctx.target.lat, ctx.target.lon);
    const reading = classifyExitReading(dist, ctx.target.radiusM, fix.accuracyM);
    if (reading !== "outside") return;
    const { zone, far } = zoneOf(fix, ctx.target);
    if (!shouldArmExit({ zone, far, dwellMs: dwellMs(ctx.session, nowMs) })) return;
    const armed: PendingExit = {
      sessionId: ctx.session.id,
      siteId: ctx.target.siteId,
      firstExitAtMs: nowMs,
      reliable: true,
      reason: null,
      strikes: 1,
      lastReadingAtMs: nowMs,
    };
    await PersistenceService.setKv(KV_KEYS.PENDING_EXIT, armed);
    GeofenceRuntimeService.armDebounceTimer(EXIT_READING_INTERVAL_MS);
  },

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
