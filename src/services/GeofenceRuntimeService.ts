import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import * as Crypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SpatialFact, SpatialFactType } from "../core/contracts";
import { persistenceService } from "./PersistenceService";
import { log } from "../utils/logger";
import { now as nowMs } from "../utils/timeProvider";

/**
 * ============================================================================
 * GeofenceRuntimeService — Propuesta 4.3
 * ----------------------------------------------------------------------------
 * Fusiona GeofenceService (legacy, ver Consolidated_AUDIT.md §2),
 * LocationManager.ts y locationAdapter.ts en un único observador de
 * perímetro. Regla de frontera dura: este servicio NUNCA cierra una jornada
 * por sí mismo. Su único trabajo es observar la(s) geocerca(s) nativas y
 * emitir SpatialFact (ENTER/EXIT/DWELL/ACCURACY_DROP/PROVIDER_LOSS). La
 * decisión de qué hacer con esos hechos (confirmar llegada, pedir decisión
 * de salida, degradar integridad) es de SessionEngineService/IntegrityLedger,
 * ambos fuera de esta ola.
 *
 * Correcciones aplicadas sobre los hallazgos forenses del audit
 * (Consolidated_AUDIT.md §2, "## 2. GeofenceService.ts"):
 *  - `TaskManager.defineTask` se registra una sola vez y de forma perezosa
 *    (`isTaskDefined` guard), nunca redefinido en cada import/Fast Refresh.
 *  - El radio de la geocerca es configurable POR SITIO (`radiusMeters` en
 *    `MonitoredRegion`), nunca una única constante global.
 *  - El catálogo de regiones monitoreadas y el estado de debounce de salida
 *    se persisten en AsyncStorage (no solo en memoria de módulo), porque un
 *    `TaskManager.defineTask` en Android/iOS puede ejecutarse en un contexto
 *    JS nuevo tras la muerte del proceso: el estado en memoria NO sobrevive
 *    background execution real, solo Fast Refresh en desarrollo.
 *  - Debounce de salida: se registra la PRIMERA salida como autoritativa
 *    (`lastExitTimestampMs` por identifier). El bug legacy reiniciaba un
 *    `setTimeout` en cada EXIT sucesivo (equivalente a autorizar la ÚLTIMA
 *    salida). Aquí, toda salida dentro de la ventana de debounce desde la
 *    primera se marca como duplicado (`dedupedOf`) pero se registra igual.
 * ============================================================================
 */

/** Nombre único de la tarea nativa de geocercas de este servicio. */
export const GEOFENCE_RUNTIME_TASK_NAME = "DT_GEOFENCE_RUNTIME_TASK";

const REGION_CATALOG_KEY = "dualtracker.geofenceRuntime.regions.v1";
const EXIT_STATE_KEY_PREFIX = "dualtracker.geofenceRuntime.exitState.";

/** Ventana de debounce de salida por defecto: ~2 minutos (Propuesta 4.3). */
export const DEFAULT_EXIT_DEBOUNCE_MS = 2 * 60 * 1000;

/** Descriptor de una región monitoreada, con radio propio (no global). */
export interface MonitoredRegion {
  identifier: string;
  sessionId: number | null;
  siteId: string | null;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  /** Ventana de debounce de salida propia de este sitio; usa el default si se omite. */
  exitDebounceMs?: number;
}

/**
 * Envoltorio propio (NO forma parte del contrato congelado `SpatialFact` en
 * domain.ts): agrega `dedupedOf`, el id del hecho EXIT autoritativo del que
 * este es duplicado dentro de la ventana de debounce, o `null` si el propio
 * hecho es autoritativo (o no aplica, para ENTER/DWELL/ACCURACY_DROP/
 * PROVIDER_LOSS). Estructuralmente sigue siendo asignable a `SpatialFact`.
 */
export interface GeofenceFactRecord extends SpatialFact {
  dedupedOf: string | null;
}

type SpatialFactHandler = (fact: GeofenceFactRecord) => void;

interface PersistedExitState {
  authoritativeFactId: string;
  lastExitTimestampMs: number;
}

const handlers = new Set<SpatialFactHandler>();

function genFactId(): string {
  try {
    return `fact_${Crypto.randomUUID()}`;
  } catch {
    return `fact_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

async function readRegionCatalog(): Promise<Record<string, MonitoredRegion>> {
  try {
    const raw = await AsyncStorage.getItem(REGION_CATALOG_KEY);
    return raw ? (JSON.parse(raw) as Record<string, MonitoredRegion>) : {};
  } catch (error) {
    log("ROJO", "GEOFENCE_RUNTIME", "ERROR", "Fallo leyendo catálogo de regiones", error);
    return {};
  }
}

async function writeRegionCatalog(catalog: Record<string, MonitoredRegion>): Promise<void> {
  await AsyncStorage.setItem(REGION_CATALOG_KEY, JSON.stringify(catalog));
}

async function readExitState(identifier: string): Promise<PersistedExitState | null> {
  try {
    const raw = await AsyncStorage.getItem(EXIT_STATE_KEY_PREFIX + identifier);
    return raw ? (JSON.parse(raw) as PersistedExitState) : null;
  } catch {
    return null;
  }
}

async function writeExitState(identifier: string, state: PersistedExitState | null): Promise<void> {
  const key = EXIT_STATE_KEY_PREFIX + identifier;
  if (state === null) {
    await AsyncStorage.removeItem(key);
  } else {
    await AsyncStorage.setItem(key, JSON.stringify(state));
  }
}

function buildFact(params: {
  type: SpatialFactType;
  region: MonitoredRegion;
  loc: Location.LocationObject | null;
}): SpatialFact {
  const { type, region, loc } = params;
  const rawAccuracy = loc?.coords.accuracy;
  const accuracyM =
    rawAccuracy === null || rawAccuracy === undefined ? Number.POSITIVE_INFINITY : rawAccuracy;
  const reliable = Number.isFinite(accuracyM) ? accuracyM <= region.radiusMeters : false;

  return {
    id: genFactId(),
    sessionId: region.sessionId,
    siteId: region.siteId,
    type,
    lat: loc?.coords.latitude ?? region.latitude,
    lon: loc?.coords.longitude ?? region.longitude,
    accuracyM: Number.isFinite(accuracyM) ? accuracyM : 0,
    speedMps: loc?.coords.speed ?? null,
    altitudeM: loc?.coords.altitude ?? null,
    battery: null,
    timestampMs: loc?.timestamp ?? nowMs(),
    source: loc ? "gps" : "unknown",
    reliable,
  };
}

/** Persiste el hecho (forma congelada, sin `dedupedOf`) y notifica a los listeners. */
async function emit(fact: GeofenceFactRecord): Promise<void> {
  const { dedupedOf: _dedupedOf, ...canonicalFact } = fact;

  try {
    await persistenceService.insertSpatialFact(canonicalFact);
  } catch (error) {
    log("ROJO", "GEOFENCE_RUNTIME", "ERROR", "Fallo al persistir SpatialFact", error);
  }

  handlers.forEach((handler) => {
    try {
      handler(fact);
    } catch (error) {
      log("ROJO", "GEOFENCE_RUNTIME", "ERROR", "onSpatialFact handler lanzó una excepción", error);
    }
  });
}

async function safeGetCurrentPosition(): Promise<Location.LocationObject | null> {
  try {
    return await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
  } catch (error) {
    log(
      "AMARILLO",
      "GEOFENCE_RUNTIME",
      "WARN",
      "getCurrentPositionAsync falló durante evento de geocerca",
      error,
    );
    return null;
  }
}

// Guard contra redefinición en Fast Refresh / múltiples imports (hallazgo del
// audit: "¿TaskManager.defineTask en top-level? ¿Lazy initialization?").
if (!TaskManager.isTaskDefined(GEOFENCE_RUNTIME_TASK_NAME)) {
  TaskManager.defineTask(GEOFENCE_RUNTIME_TASK_NAME, async ({ data, error }: any) => {
    if (error) {
      log("ROJO", "GEOFENCE_RUNTIME", "ERROR", "Tarea de geocerca reportó error nativo", error);
      return;
    }
    if (!data) return;

    const { eventType, region } = data as {
      eventType: Location.GeofencingEventType;
      region: Location.LocationRegion;
    };
    const identifier = region?.identifier;
    if (!identifier) return;

    const catalog = await readRegionCatalog();
    const monitored = catalog[identifier];
    if (!monitored) {
      log(
        "AMARILLO",
        "GEOFENCE_RUNTIME",
        "WARN",
        "Evento de geocerca para identifier no registrado en catálogo",
        { identifier },
      );
      return;
    }

    const loc = await safeGetCurrentPosition();

    if (!loc) {
      await emit({
        ...buildFact({ type: "PROVIDER_LOSS", region: monitored, loc: null }),
        dedupedOf: null,
      });
    } else if (loc.coords.accuracy != null && loc.coords.accuracy > monitored.radiusMeters) {
      await emit({
        ...buildFact({ type: "ACCURACY_DROP", region: monitored, loc }),
        dedupedOf: null,
      });
    }

    if (eventType === Location.GeofencingEventType.Enter) {
      // Re-entrar cancela cualquier debounce de salida pendiente para este sitio.
      await writeExitState(identifier, null);
      const fact = buildFact({ type: "ENTER", region: monitored, loc });
      await emit({ ...fact, dedupedOf: null });
      return;
    }

    if (eventType === Location.GeofencingEventType.Exit) {
      const fact = buildFact({ type: "EXIT", region: monitored, loc });
      const debounceMs = monitored.exitDebounceMs ?? DEFAULT_EXIT_DEBOUNCE_MS;
      const priorState = await readExitState(identifier);

      const withinDebounceOfFirstExit =
        priorState !== null && fact.timestampMs - priorState.lastExitTimestampMs < debounceMs;

      if (withinDebounceOfFirstExit && priorState) {
        // No es la primera salida dentro de la ventana: se registra el hecho
        // crudo pero se marca como duplicado de la salida autoritativa.
        await emit({ ...fact, dedupedOf: priorState.authoritativeFactId });
      } else {
        // Primera salida (o la ventana anterior ya expiró): esta es la
        // autoritativa. Es la que debe reenviarse a SessionEngine.
        await writeExitState(identifier, {
          authoritativeFactId: fact.id,
          lastExitTimestampMs: fact.timestampMs,
        });
        await emit({ ...fact, dedupedOf: null });
      }
    }
  });
}

function isValidLatitude(lat: number): boolean {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

function isValidLongitude(lon: number): boolean {
  return Number.isFinite(lon) && lon >= -180 && lon <= 180;
}

class GeofenceRuntimeService {
  /**
   * Registra un handler para cada SpatialFact emitido (incluyendo los
   * marcados como duplicado vía `dedupedOf`). Retorna una función para
   * desuscribirse.
   */
  onSpatialFact(handler: SpatialFactHandler): () => void {
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
    };
  }

  /**
   * Solicita permisos de ubicación en primer y segundo plano. No decide
   * política de negocio: solo refleja el resultado real del sistema
   * operativo (PermissionsHealthService es la fuente de verdad continua).
   */
  async requestPermissions(): Promise<{
    foreground: "granted" | "denied" | "unknown";
    background: "granted" | "denied" | "unknown";
  }> {
    try {
      const { status: fgStatus } = await Location.getForegroundPermissionsAsync();
      let finalFg = fgStatus;
      if (finalFg !== "granted") {
        const { status } = await Location.requestForegroundPermissionsAsync();
        finalFg = status;
      }

      let finalBg: Location.PermissionStatus | "unknown" = "unknown";
      if (finalFg === "granted") {
        const { status: bgStatus } = await Location.getBackgroundPermissionsAsync();
        finalBg = bgStatus;
        if (finalBg !== "granted") {
          const { status } = await Location.requestBackgroundPermissionsAsync();
          finalBg = status;
        }
      }

      return {
        foreground: finalFg as "granted" | "denied" | "unknown",
        background: finalBg as "granted" | "denied" | "unknown",
      };
    } catch (error) {
      log("ROJO", "GEOFENCE_RUNTIME", "ERROR", "Fallo solicitando permisos de ubicación", error);
      return { foreground: "unknown", background: "unknown" };
    }
  }

  /**
   * Agrega (o reemplaza, si `identifier` ya existía) una región monitoreada
   * con su propio radio (`radiusMeters`) y reinicia la geocerca nativa con
   * el catálogo completo (la API de expo-location reemplaza todas las
   * regiones en cada `startGeofencingAsync`, no admite altas incrementales).
   */
  async monitorRegion(region: MonitoredRegion): Promise<boolean> {
    if (!region.identifier || !region.identifier.trim()) {
      log("AMARILLO", "GEOFENCE_RUNTIME", "WARN", "monitorRegion rechazado: identifier vacío");
      return false;
    }
    if (!isValidLatitude(region.latitude) || !isValidLongitude(region.longitude)) {
      log(
        "AMARILLO",
        "GEOFENCE_RUNTIME",
        "WARN",
        "monitorRegion rechazado: coordenadas inválidas",
        region,
      );
      return false;
    }
    if (!Number.isFinite(region.radiusMeters) || region.radiusMeters <= 0) {
      log(
        "AMARILLO",
        "GEOFENCE_RUNTIME",
        "WARN",
        "monitorRegion rechazado: radiusMeters inválido",
        region,
      );
      return false;
    }

    try {
      const enabled = await Location.hasServicesEnabledAsync();
      if (!enabled) {
        log(
          "ROJO",
          "GEOFENCE_RUNTIME",
          "ERROR",
          "Servicios de ubicación deshabilitados: no se puede monitorear",
        );
        return false;
      }

      const catalog = await readRegionCatalog();
      catalog[region.identifier] = region;
      await writeRegionCatalog(catalog);

      return await this.restartNativeGeofencing(catalog);
    } catch (error) {
      log("ROJO", "GEOFENCE_RUNTIME", "ERROR", "Fallo iniciando monitoreo de región", error);
      return false;
    }
  }

  /** Quita una región del catálogo y reinicia la geocerca nativa. */
  async unmonitorRegion(identifier: string): Promise<void> {
    const catalog = await readRegionCatalog();
    delete catalog[identifier];
    await writeRegionCatalog(catalog);
    await writeExitState(identifier, null);
    await this.restartNativeGeofencing(catalog);
  }

  /** Detiene toda geocerca nativa y vacía el catálogo. */
  async stopAll(): Promise<void> {
    await writeRegionCatalog({});
    try {
      const running = await Location.hasStartedGeofencingAsync(GEOFENCE_RUNTIME_TASK_NAME);
      if (running) {
        await Location.stopGeofencingAsync(GEOFENCE_RUNTIME_TASK_NAME);
      }
    } catch (error) {
      log("ROJO", "GEOFENCE_RUNTIME", "ERROR", "Fallo deteniendo toda la geocerca", error);
    }
  }

  /** Lista las regiones actualmente monitoreadas (según catálogo persistido). */
  async listMonitoredRegions(): Promise<MonitoredRegion[]> {
    return Object.values(await readRegionCatalog());
  }

  /**
   * Punto de entrada para muestras de ubicación de fuentes externas (por
   * ejemplo, el stream continuo de `ForegroundWorkService`). Permite
   * detectar ACCURACY_DROP/PROVIDER_LOSS/DWELL sin depender exclusivamente
   * de eventos Enter/Exit nativos, sin duplicar la lógica de debounce de
   * salida (que solo aplica a EXIT).
   */
  async reportLocationSample(
    identifier: string,
    loc: Location.LocationObject | null,
  ): Promise<void> {
    const catalog = await readRegionCatalog();
    const region = catalog[identifier];
    if (!region) return;

    if (!loc) {
      await emit({
        ...buildFact({ type: "PROVIDER_LOSS", region, loc: null }),
        dedupedOf: null,
      });
      return;
    }

    const accuracy = loc.coords.accuracy;
    if (accuracy != null && accuracy > region.radiusMeters) {
      await emit({
        ...buildFact({ type: "ACCURACY_DROP", region, loc }),
        dedupedOf: null,
      });
      return;
    }

    await emit({
      ...buildFact({ type: "DWELL", region, loc }),
      dedupedOf: null,
    });
  }

  private async restartNativeGeofencing(
    catalog: Record<string, MonitoredRegion>,
  ): Promise<boolean> {
    const regions = Object.values(catalog);

    try {
      const running = await Location.hasStartedGeofencingAsync(GEOFENCE_RUNTIME_TASK_NAME);
      if (running) {
        await Location.stopGeofencingAsync(GEOFENCE_RUNTIME_TASK_NAME);
      }

      if (regions.length === 0) {
        return true;
      }

      await Location.startGeofencingAsync(
        GEOFENCE_RUNTIME_TASK_NAME,
        regions.map((r) => ({
          identifier: r.identifier,
          latitude: r.latitude,
          longitude: r.longitude,
          radius: r.radiusMeters,
          notifyOnEnter: true,
          notifyOnExit: true,
        })),
      );

      log("VERDE", "GEOFENCE_RUNTIME", "INFO", "Geocerca nativa (re)iniciada", {
        count: regions.length,
      });
      return true;
    } catch (error) {
      log("ROJO", "GEOFENCE_RUNTIME", "ERROR", "Fallo reiniciando geocerca nativa", error);
      return false;
    }
  }
}

/** Instancia única — un solo observador de perímetro por proceso. */
export const geofenceRuntimeService = new GeofenceRuntimeService();
