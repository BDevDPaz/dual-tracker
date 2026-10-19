/**
 * Constantes de geolocalización.
 *
 * Portado de GEOTrack (src/constants/geolocation.ts). Los validadores
 * anti-spoof originales se conservan, pero en Dual Tracker ya NO rechazan
 * el hecho espacial: lo marcan como no fiable (reliable = false), según
 * la Propuesta Técnica §4.3 ("el hecho se marca UNRELIABLE").
 */

/**
 * Precisión a partir de la cual un fix se etiqueta como red (no como veto).
 * Fichar exige precisión ≤ radio del sitio: en ciudad el GPS del S22+ pasa
 * de 50 m con facilidad y eso no puede impedir el check-in.
 */
export const MAX_ACCEPTABLE_ACCURACY_METERS = 50;
/**
 * Umbrales heredados de GEOTrack. Ya NO rechazan la llegada ni la salida:
 * el operario llega en vehículo. El único veto de velocidad es
 * IMPOSSIBLE_SPEED_KMH (ver geofencePolicy.movementIssue).
 */
export const MAX_ENTRY_SPEED_KMH = 15;
export const MAX_EXIT_SPEED_KMH = 25;
/** Ventana anti-rebote entre eventos nativos idénticos (GEOTrack). */
export const GEOFENCE_ANTI_REBOUNCE_MS = 5_000;
/** Salto instantáneo sospechoso entre dos fixes (GEOTrack). */
export const MAX_INSTANT_LOCATION_JUMP_METERS = 500;
/** Velocidad físicamente imposible para un operario (GEOTrack). */
export const IMPOSSIBLE_SPEED_KMH = 200;

/**
 * Debounce de salida. La propuesta indica "hoy ~2 min" y que debe ser
 * configurable: este es solo el valor por defecto de CompanyPolicy.
 */
export const DEFAULT_EXIT_DEBOUNCE_MS = 2 * 60 * 1000;

/** Radio por defecto si el sitio no declara el suyo (GEOTrack: 200 m). */
export const DEFAULT_SITE_RADIUS_METERS = 200;

/** Nombres de tareas nativas de ubicación. */
export const GEOFENCE_TASK_NAME = "DUALTRACKER_GEOFENCE_TASK";
export const BREADCRUMB_TASK_NAME = "DUALTRACKER_BREADCRUMB_TASK";

/**
 * Perfiles de muestreo adaptativo del TraceRecorder / ForegroundWork.
 * TODO(valores provisionales): la propuesta pide "intervalo largo dentro,
 * más frecuente en tránsito" sin cifras. Ajustar tras pruebas de batería.
 */
export const BREADCRUMB_PROFILES = {
  ON_SITE: { timeIntervalMs: 5 * 60 * 1000, distanceIntervalM: 50 },
  IN_TRANSIT: { timeIntervalMs: 30 * 1000, distanceIntervalM: 25 },
  WAITING: { timeIntervalMs: 2 * 60 * 1000, distanceIntervalM: 100 },
} as const;
