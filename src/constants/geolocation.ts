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
/**
 * Un ENTER de la misma región dentro de esta ventana no se vuelve a anotar.
 * La ventana es absoluta: el libro no inserta los hechos en orden de timestamp.
 * El ledger sigue siendo append-only: el duplicado no se escribe.
 * Prueba de campo 19 oct: 2–3 ENTER en el mismo minuto (90 s).
 * Prueba de campo 20 oct: ráfagas fiables a ~2 min y timestamps fuera de orden.
 */
export const GEOFENCE_ENTER_COALESCE_MS = 150_000;
/**
 * Un ENTER no fiable a los pocos segundos de un EXIT de la misma región es el
 * borde (el teléfono aún no salió), no una reentrada. 2 ms y 764 ms en la
 * prueba del 20 oct. Un ENTER fiable sí se anota: la evidencia mejora.
 */
export const GEOFENCE_ENTER_AFTER_EXIT_MS = 5_000;
/** Salto instantáneo sospechoso entre dos fixes (GEOTrack). */
export const MAX_INSTANT_LOCATION_JUMP_METERS = 500;
/** Velocidad físicamente imposible para un operario (GEOTrack). */
export const IMPOSSIBLE_SPEED_KMH = 200;

/**
 * Debounce de salida por defecto. La cifra está en src/config/provisional.ts.
 */
export { DEFAULT_EXIT_DEBOUNCE_MS } from "../config/provisional";

/** Radio por defecto si el sitio no declara el suyo (GEOTrack: 200 m). */
export const DEFAULT_SITE_RADIUS_METERS = 200;

/** Nombres de tareas nativas de ubicación. */
export const GEOFENCE_TASK_NAME = "DUALTRACKER_GEOFENCE_TASK";
export const BREADCRUMB_TASK_NAME = "DUALTRACKER_BREADCRUMB_TASK";

/**
 * Perfiles de muestreo adaptativo. Las cifras están en src/config/provisional.ts.
 */
export { BREADCRUMB_PROFILES } from "../config/provisional";
