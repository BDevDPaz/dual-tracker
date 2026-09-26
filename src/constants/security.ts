/**
 * Parámetros del SecurityService (Propuesta Técnica §4.8).
 *
 * TODO(valores provisionales): la propuesta exige "retardo anti-fuerza bruta y
 * bloqueo progresivo" sin fijar cifras. Estos valores son un punto de partida
 * y deben validarse con el empleador.
 */

/** Retardo fijo por intento (heredado de securityAdapter de GEOTrack: 650 ms). */
export const PIN_ATTEMPT_DELAY_MS = 650;

/** Iteraciones de hash salado. TODO: migrar a un KDF nativo (scrypt/argon2). */
export const PIN_HASH_ITERATIONS = 1000;

/** Longitud mínima del PIN/clave de administración. */
export const PIN_MIN_LENGTH = 6;

/** Escalera de bloqueo: [intentos fallidos acumulados, duración del bloqueo]. */
export const PIN_LOCKOUT_STEPS: readonly (readonly [number, number])[] = [
  [3, 30 * 1000],
  [5, 5 * 60 * 1000],
  [8, 30 * 60 * 1000],
  [10, 24 * 60 * 60 * 1000],
];

/** Tiempo de desbloqueo de la zona admin (sesión de UI). */
export const ADMIN_UNLOCK_TTL_MS = 10 * 60 * 1000;
