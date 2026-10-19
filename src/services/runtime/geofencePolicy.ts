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
/** Muestras fuera de radio para confirmar antes de que venza el debounce. */
export const EXIT_CONFIRM_STRIKES = 3;
export const DIAG_LIMIT = 30;
/** Una muestra más vieja que esto no ficha (fix cacheado del sistema). */
export const SAMPLE_MAX_AGE_MS = 5 * 60_000;
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

export function isFarOutside(distM: number, radiusM: number, accuracyM: number | null): boolean {
  if (!Number.isFinite(distM) || radiusM <= 0) return false;
  if (accuracyM === null || !Number.isFinite(accuracyM) || accuracyM < 0) return false;
  if (accuracyM > radiusM) return false;
  return distM - accuracyM >= radiusM + FAR_DEPARTURE_M;
}

export type ExitGate = "clear" | "wait" | "confirm";

/**
 * Qué hacer con una salida pendiente.
 *  - Dentro, o rebote recién llegado: se tira.
 *  - Aún no vence el debounce ni hay strikes: se espera.
 *  - Fuera con histéresis: se confirma.
 *  - GPS incierto pero el EXIT original era fiable y ya venció el debounce:
 *    se confirma para que el operario vea el aviso (la clase AUTO exige un
 *    fix posterior fuera de verdad; un rebote no cierra solo).
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
  if (opts.zone === "inside") return "clear";
  if (opts.dwellMs < MIN_DWELL_BEFORE_EXIT_MS && !opts.far) return "clear";
  const due = opts.elapsedMs >= opts.debounceMs || opts.strikes >= EXIT_CONFIRM_STRIKES;
  if (!due) return "wait";
  if (opts.zone === "outside") return "confirm";
  if (opts.pendingReliable) return "confirm";
  return "wait";
}

/** ¿Se guarda la primera salida, a la espera del debounce? */
export function shouldArmExit(opts: { zone: PresenceZone; far: boolean; dwellMs: number }): boolean {
  if (opts.zone === "inside") return false;
  if (opts.dwellMs < MIN_DWELL_BEFORE_EXIT_MS && !opts.far) return false;
  return true;
}

/**
 * Velocidad o salto que no puede ser un operario. Un traslado en coche
 * (aunque supere los 15 km/h heredados de GEOTrack) NO es un rechazo:
 * el umbral antiguo bloqueaba el check-in real al llegar en la van.
 */
export function movementIssue(opts: { speedMps: number | null; jumpM: number | null; jumpDtMs: number | null }): string | null {
  const speedKmh = opts.speedMps !== null && opts.speedMps > 0 ? opts.speedMps * 3.6 : 0;
  if (speedKmh > IMPOSSIBLE_SPEED_KMH) return "IMPOSSIBLE_SPEED";
  if (opts.jumpM !== null && opts.jumpDtMs !== null && opts.jumpDtMs >= 0 && opts.jumpDtMs < 30 * 60_000) {
    const dtS = Math.max(opts.jumpDtMs / 1000, 0.001);
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
