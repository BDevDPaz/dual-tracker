/**
 * Política de aceptación de ENTER/EXIT (pura, sin SO).
 *
 * El radio lógico del sitio no cambia: es el que decide si el operario está
 * dentro. En Android el radio registrado en Play Services es al menos
 * ANDROID_MIN_OS_RADIUS_M, porque por debajo de ~100 m la geocerca parpadea
 * (ENTER y EXIT en el mismo minuto: el cierre de 0.00 h del 18 oct 2026).
 */
import { IMPOSSIBLE_SPEED_KMH } from "../../constants/geolocation";

/** Mínimo que Play Services recomienda para no perder o duplicar transiciones. */
export const ANDROID_MIN_OS_RADIUS_M = 100;
/** Hay que superar el radio por este margen para dar la salida por buena. */
export const EXIT_HYSTERESIS_M = 50;
/** Salida inequívoca: se acepta aunque la llegada sea de hace unos segundos. */
export const FAR_DEPARTURE_M = 150;
/**
 * Los primeros 90 s tras la llegada se ignoran las salidas que no son
 * inequívocas. Android dispara EXIT justo después de ENTER al registrar la
 * geocerca estando ya dentro.
 */
export const MIN_DWELL_BEFORE_EXIT_MS = 90_000;
/** Tres lecturas fuera confirman la salida. No hay atajo por tiempo (D-01). */
export const EXIT_CONFIRM_STRIKES = 3;
/** Separación entre las lecturas de salida (D-01: cada 15 s). */
export const EXIT_READING_INTERVAL_MS = 15_000;
/** Una lectura con precisión peor que esto no suma ni reinicia la cuenta (D-01). */
export const EXIT_ACCURACY_MAX_M = 50;
export const DIAG_LIMIT = 30;
/** Una muestra más vieja que esto no ficha (fix cacheado del sistema). */
export const SAMPLE_MAX_AGE_MS = 5 * 60_000;
/**
 * Por debajo de 5 s no hay intervalo para juzgar un salto: dos tareas
 * (geocerca y miga) pueden caer en el mismo instante y el piso de 0.001 s
 * convertía unos metros de ruido en miles de km/h.
 */
export const JUMP_MIN_JUDGMENT_MS = 5_000;
/** Por encima de esto el fix anterior ya no sirve de referencia. */
export const JUMP_MAX_JUDGMENT_MS = 30 * 60_000;

/**
 * El reloj del fix (expo-location) puede ir por delante de TimeAuthority.
 * Cerrar un tramo con ese timestamp alarga el tránsito: en la prueba del
 * 20 oct 2026 un adelanto de 5 min convirtió un trayecto de 5 en 10.
 * Nunca se usa un instante posterior a `nowMs`.
 */
export function clampSampleTimestamp(atMs: number, nowMs: number): number {
  if (!Number.isFinite(atMs)) return nowMs;
  return Math.min(atMs, nowMs);
}
/** Tope propio, muy por debajo del límite de 100 geocercas de Android. */
export const MAX_MONITORED_REGIONS = 20;

export type PresenceZone = "inside" | "outside" | "unknown";

export function osGeofenceRadius(logicalRadiusM: number, platform: string): number {
  const logical = logicalRadiusM > 0 ? logicalRadiusM : ANDROID_MIN_OS_RADIUS_M;
  if (platform === "android") return Math.max(logical, ANDROID_MIN_OS_RADIUS_M);
  return logical;
}

/**
 * inside: el punto cae en el radio y la precisión no es peor que el radio
 *   (si no, no se puede saber).
 * outside: el círculo de error queda más allá del radio + histéresis.
 * unknown: banda muerta, o precisión inútil.
 */
export function presenceZone(distM: number, radiusM: number, accuracyM: number | null): PresenceZone {
  if (!Number.isFinite(distM) || radiusM <= 0) return "unknown";
  if (accuracyM === null || !Number.isFinite(accuracyM) || accuracyM < 0) return "unknown";
  if (accuracyM > radiusM) return "unknown";
  if (distM <= radiusM) return "inside";
  if (distM - accuracyM >= radiusM + EXIT_HYSTERESIS_M) return "outside";
  return "unknown";
}

/**
 * Lectura de salida (D-01).
 * outside: precisión ≤ 50 m y distancia ≥ radio + 50 m. Suma un strike.
 * inside: precisión ≤ 50 m y dentro del radio. Reinicia la cuenta.
 * ignore: precisión > 50 m, o la banda entre el radio y el radio + 50 m.
 */
export type ExitReading = "outside" | "inside" | "ignore";

export function classifyExitReading(distM: number, radiusM: number, accuracyM: number | null): ExitReading {
  if (!Number.isFinite(distM) || radiusM <= 0) return "ignore";
  if (accuracyM === null || !Number.isFinite(accuracyM) || accuracyM < 0 || accuracyM > EXIT_ACCURACY_MAX_M) return "ignore";
  if (distM <= radiusM) return "inside";
  if (distM >= radiusM + EXIT_HYSTERESIS_M) return "outside";
  return "ignore";
}

export function isFarOutside(distM: number, radiusM: number, accuracyM: number | null): boolean {
  if (!Number.isFinite(distM) || radiusM <= 0) return false;
  if (accuracyM === null || !Number.isFinite(accuracyM) || accuracyM < 0) return false;
  if (accuracyM > radiusM) return false;
  return distM - accuracyM >= radiusM + FAR_DEPARTURE_M;
}

export type ExitGate = "clear" | "wait" | "confirm";

/**
 * Qué hacer con una salida pendiente (D-01, D-26).
 * Dentro del radio, o rebote en los primeros 90 s: se tira.
 * Tres lecturas fuera confirman. El tiempo transcurrido no confirma.
 * `debounceMs` se conserva en la firma y ya no abre la salida.
 */
export function confirmExitDecision(opts: {
  zone: PresenceZone;
  far: boolean;
  dwellMs: number;
  elapsedMs: number;
  debounceMs: number;
  strikes: number;
  pendingReliable: boolean;
}): ExitGate {
  void opts.debounceMs;
  void opts.pendingReliable;
  void opts.elapsedMs;
  if (opts.zone === "inside") return "clear";
  if (opts.dwellMs < MIN_DWELL_BEFORE_EXIT_MS && !opts.far) return "clear";
  if (opts.strikes >= EXIT_CONFIRM_STRIKES && opts.zone === "outside") return "confirm";
  return "wait";
}

/**
 * ¿Se guarda la primera salida, a la espera del debounce?
 * La banda de histéresis no arma: rozar el borde no es una salida.
 */
export function shouldArmExit(opts: { zone: PresenceZone; far: boolean; dwellMs: number }): boolean {
  if (opts.zone === "inside") return false;
  if (opts.zone !== "outside" && !opts.far) return false;
  if (opts.dwellMs < MIN_DWELL_BEFORE_EXIT_MS && !opts.far) return false;
  return true;
}

function nonNegativeMeters(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  return value;
}

/**
 * Distancia que no cabe dentro del error de los dos fixes. Un last fix
 * antiguo sin `accuracyM` cuenta como 0. El suelo es 0.
 */
export function effectiveJumpMeters(distanceM: number, accuracyM: number | null | undefined, previousAccuracyM: number | null | undefined): number {
  if (!Number.isFinite(distanceM) || distanceM < 0) return 0;
  return Math.max(0, distanceM - nonNegativeMeters(accuracyM) - nonNegativeMeters(previousAccuracyM));
}

/**
 * Velocidad o salto que no puede ser un operario. Un traslado en coche
 * (aunque supere los 15 km/h heredados de GEOTrack) NO es un rechazo:
 * el umbral antiguo bloqueaba el check-in real al llegar en la van.
 *
 * `jumpM` es el salto ya descontado (effectiveJumpMeters). Intervalos
 * menores de 5 s, negativos o de más de 30 min no se juzgan.
 */
export function movementIssue(opts: { speedMps: number | null; jumpM: number | null; jumpDtMs: number | null }): string | null {
  const speedKmh = opts.speedMps !== null && opts.speedMps > 0 ? opts.speedMps * 3.6 : 0;
  if (speedKmh > IMPOSSIBLE_SPEED_KMH) return "IMPOSSIBLE_SPEED";
  if (opts.jumpM !== null && opts.jumpDtMs !== null && opts.jumpDtMs >= JUMP_MIN_JUDGMENT_MS && opts.jumpDtMs < JUMP_MAX_JUDGMENT_MS) {
    const dtS = opts.jumpDtMs / 1000;
    const kmh = (opts.jumpM / dtS) * 3.6;
    if (kmh > IMPOSSIBLE_SPEED_KMH) return "LOCATION_JUMP_DETECTED";
  }
  return null;
}

export function parseGeofenceIdentifier(id: string): { sessionId: number; siteId: number } | null {
  const m = /^SESSION_(\d+)_SITE_(\d+)$/.exec(id);
  if (!m) return null;
  const sessionId = Number(m[1]);
  const siteId = Number(m[2]);
  if (!Number.isInteger(sessionId) || !Number.isInteger(siteId)) return null;
  return { sessionId, siteId };
}
