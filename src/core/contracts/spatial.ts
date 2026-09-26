/**
 * ============================================================================
 * CONTRATO: SpatialFact (Propuesta Técnica §9)
 * ============================================================================
 * sessionId, type (ENTER|EXIT|DWELL|BREADCRUMB|ACCURACY_DROP), lat, lon,
 * accuracyM, timestampMs, source, reliable.
 *
 * Desviación documentada: se añade PROVIDER_LOSS al tipo porque §4.3 lo lista
 * como hecho que GeofenceRuntimeService debe emitir. En PROVIDER_LOSS lat/lon
 * pueden ser null (no hay fix).
 */
export type SpatialFactType =
  | "ENTER"
  | "EXIT"
  | "DWELL"
  | "BREADCRUMB"
  | "ACCURACY_DROP"
  | "PROVIDER_LOSS";

export type SpatialSource = "gps" | "network" | "unknown";

export interface SpatialFact {
  id?: number;
  sessionId: number;
  type: SpatialFactType;
  lat: number | null;
  lon: number | null;
  accuracyM: number | null;
  timestampMs: number;
  source: SpatialSource;
  /** false = UNRELIABLE: no puede producir VALID por sí solo (§4.3). */
  reliable: boolean;
  /** Motivo de no fiabilidad (ACCURACY_OVER_RADIUS, LOCATION_JUMP, …). */
  reason?: string | null;
  siteId?: number | null;
}

/**
 * Punto de traza (TraceRecorder, §5.4). Es un SpatialFact de tipo BREADCRUMB
 * con los campos extra que exige la propuesta.
 */
export interface TracePoint extends SpatialFact {
  type: "BREADCRUMB";
  speedMps: number | null;
  altitudeM: number | null;
  battery: number | null;
}

/** Modo del rastro (§5.4 y §5.11 DualDisclosure). */
export type TraceMode = "PERIMETER" | "BREADCRUMB";

/** Modo visible en UI (DualDisclosure §5.11). */
export type VisibleTrackingMode = "RASTRO_ACTIVO" | "SOLO_GEOCERCA" | "SIN_UBICACION";

/** Resumen de traza para el EvidencePack (no necesariamente todos los puntos). */
export interface TraceSummary {
  sessionId: number;
  pointCount: number;
  firstAtMs: number | null;
  lastAtMs: number | null;
  unreliableCount: number;
  dwellBySite: { siteId: number | null; minutes: number }[];
  enterExit: { type: "ENTER" | "EXIT"; timestampMs: number; reliable: boolean }[];
}
