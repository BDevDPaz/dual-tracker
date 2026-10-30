import * as Location from "expo-location";
import { DomainStatus, SpatialFact } from "../core/contracts";
import { persistenceService } from "./PersistenceService";
import { log } from "../utils/logger";

/**
 * ============================================================================
 * TraceRecorderService — Propuesta 5.4 (nuevo, Dual Tracker)
 * ----------------------------------------------------------------------------
 * Rastreo de trayectoria DISTINTO de la geocerca:
 *   - GeofenceRuntimeService responde "¿está dentro o fuera?" y ya emite por
 *     su cuenta los SpatialFact de tipo ENTER / EXIT / DWELL / ACCURACY_DROP /
 *     PROVIDER_LOSS (Modo A — perímetro). Este archivo NO duplica esa lógica:
 *     no vuelve a escuchar geofencing nativo ni a producir esos tipos de
 *     hecho. Modo A es, para este servicio, un simple pass-through (no-op):
 *     mientras solo corre el perímetro, TraceRecorderService no muestrea nada.
 *   - Modo B — "miga de pan" (BREADCRUMB): muestreo adaptativo de posición
 *     ÚNICAMENTE mientras domainStatus es "ACTIVA" o "TRASLADO". Fuera de esas
 *     dos jornadas no se graba rastro: Dual Tracker no es vigilancia continua
 *     de la vida personal (Propuesta 5.4 / sección 10).
 *
 * Garantía de no-grabación fuera de jornada:
 *   - `startBreadcrumb` solo acepta mode === "ACTIVA" | "TRASLADO"; cualquier
 *     otro valor es rechazado (no-op) de forma defensiva, aunque el tipo ya
 *     lo restringe en compilación.
 *   - El llamador (TaskOrchestratorService / SessionEngine) es responsable de
 *     invocar `stopBreadcrumb()` en cualquier otra transición de estado
 *     (PAUSADA, CERRADA, NO_INICIADA, etc.). Este servicio, además, se
 *     defiende: si por error se le pidiera muestrear fuera de esos dos
 *     estados, `startBreadcrumb` simplemente no arranca el watcher.
 * ============================================================================
 */

/** Modos de jornada durante los cuales el muestreo de miga de pan es legal. */
export type BreadcrumbMode = Extract<DomainStatus, "ACTIVA" | "TRASLADO">;

/** Intervalo largo (ms) mientras la jornada está ACTIVA (en sitio). */
export const BREADCRUMB_INTERVAL_ACTIVA_MS = 5 * 60 * 1000; // 5 minutos

/** Intervalo corto (ms) mientras la jornada está en TRASLADO. */
export const BREADCRUMB_INTERVAL_TRASLADO_MS = 45 * 1000; // 45 segundos (30s–1min)

/** Distancia mínima (m) para disparar un nuevo punto, además del intervalo. */
const BREADCRUMB_DISTANCE_INTERVAL_METERS = 25;

const ALLOWED_MODES: ReadonlySet<string> = new Set<BreadcrumbMode>(["ACTIVA", "TRASLADO"]);

function generateFactId(): string {
  return `fact_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Resuelve el nivel de batería del dispositivo, si hay un provedor disponible.
 *
 * NOTA DE DEPENDENCIA: `expo-battery` NO está presente en package.json de
 * este proyecto. Por instrucción explícita del encargo, no se agrega una
 * dependencia npm nueva para resolver esto. En su lugar se degrada de forma
 * agraciada: `battery` queda en `null` (valor explícitamente permitido por el
 * contrato `SpatialFact.battery: number | null`). Si en el futuro se instala
 * `expo-battery`, esta función es el único punto a actualizar.
 */
async function resolveBatteryLevel(): Promise<number | null> {
  return null;
}

class TraceRecorderService {
  private currentMode: BreadcrumbMode | null = null;
  private currentSessionId: number | null = null;
  private subscription: Location.LocationSubscription | null = null;

  /**
   * Arranca el muestreo adaptativo de miga de pan para una jornada en curso.
   * No-op defensivo si `mode` no es "ACTIVA" ni "TRASLADO" (aunque el tipo ya
   * lo impide en tiempo de compilación) o si ya hay un watcher activo para la
   * misma sesión/modo.
   */
  startBreadcrumb(sessionId: number, mode: BreadcrumbMode): void {
    if (!ALLOWED_MODES.has(mode)) {
      log("AMARILLO", "TRACE_RECORDER", "WARN", "Modo no permitido para breadcrumb, ignorado", {
        mode,
      });
      return;
    }

    // Reinicia el watcher si cambia de sesión o de modo (cambia el intervalo).
    if (this.subscription && this.currentSessionId === sessionId && this.currentMode === mode) {
      return;
    }
    this.stopBreadcrumb();

    this.currentMode = mode;
    this.currentSessionId = sessionId;

    const timeInterval =
      mode === "ACTIVA" ? BREADCRUMB_INTERVAL_ACTIVA_MS : BREADCRUMB_INTERVAL_TRASLADO_MS;

    Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval,
        distanceInterval: BREADCRUMB_DISTANCE_INTERVAL_METERS,
      },
      (loc) => {
        void this.handleLocationUpdate(sessionId, mode, loc);
      },
    )
      .then((sub) => {
        // Otro startBreadcrumb/stopBreadcrumb pudo correr durante el await.
        if (this.currentSessionId !== sessionId || this.currentMode !== mode) {
          sub.remove();
          return;
        }
        this.subscription = sub;
      })
      .catch((error) => {
        log("ROJO", "TRACE_RECORDER", "ERROR", "Fallo al iniciar watchPositionAsync", { error });
      });
  }

  /** Detiene el muestreo de miga de pan, si estuviera activo. */
  stopBreadcrumb(): void {
    if (this.subscription) {
      this.subscription.remove();
      this.subscription = null;
    }
    this.currentMode = null;
    this.currentSessionId = null;
  }

  private async handleLocationUpdate(
    sessionId: number,
    mode: BreadcrumbMode,
    loc: Location.LocationObject,
  ): Promise<void> {
    // Defensa en profundidad: si el modo cambió (p.ej. a PAUSADA) entre el
    // registro del callback y su disparo, no se persiste el punto.
    if (this.currentSessionId !== sessionId || this.currentMode !== mode) {
      return;
    }

    const battery = await resolveBatteryLevel();
    const fact: SpatialFact = {
      id: generateFactId(),
      sessionId,
      siteId: null,
      type: "BREADCRUMB",
      lat: loc.coords.latitude,
      lon: loc.coords.longitude,
      accuracyM: loc.coords.accuracy ?? 0,
      speedMps: loc.coords.speed ?? null,
      altitudeM: loc.coords.altitude ?? null,
      battery,
      timestampMs: loc.timestamp,
      source: "gps",
      reliable: true,
    };

    try {
      await persistenceService.insertSpatialFact(fact);
    } catch (error) {
      log("ROJO", "TRACE_RECORDER", "ERROR", "Fallo al persistir SpatialFact BREADCRUMB", {
        error,
      });
    }
  }

  /**
   * Aplica la política de retención de traza cruda (Propuesta 5.4: "por
   * ejemplo 90 días o hasta exportación del periodo de nómina").
   *
   * INTEGRACIÓN PENDIENTE (ver notes/wave3.md): `PersistenceService` hoy solo
   * expone `listSpatialFacts(sessionId)` (acotado a una sesión) y no un
   * borrado por fecha. No existe ningún método para enumerar SpatialFact de
   * TODAS las sesiones, que es lo que exige una purga global por antigüedad.
   * Este método detecta en runtime (sin nueva dependencia de tipos) si el
   * ensamblador ya agregó `deleteSpatialFactsBefore(timestampMs): Promise<number>`
   * a PersistenceService y, de ser así, delega en él. Si todavía no existe,
   * registra una advertencia y retorna 0 sin lanzar, para no romper llamadores
   * (p.ej. INTEGRITY_SWEEP) que invoquen esta función antes de que el
   * ensamblador cierre esa costura de integración.
   */
  async pruneOlderThan(days: number): Promise<number> {
    const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;

    const svc = persistenceService as unknown as {
      deleteSpatialFactsBefore?: (timestampMs: number) => Promise<number>;
    };

    if (typeof svc.deleteSpatialFactsBefore === "function") {
      return svc.deleteSpatialFactsBefore(cutoffMs);
    }

    log(
      "AMARILLO",
      "TRACE_RECORDER",
      "WARN",
      "PersistenceService.deleteSpatialFactsBefore no está implementado aún; " +
        "pruneOlderThan no puede purgar y retorna 0 (ver notes/wave3.md)",
      { cutoffMs },
    );
    return 0;
  }
}

export const traceRecorderService = new TraceRecorderService();
