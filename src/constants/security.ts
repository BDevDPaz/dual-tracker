/**
 * Parámetros del PIN. Los números viven en src/config/provisional.ts
 * (docs/VALORES_PROVISIONALES.md). Aquí solo se reexportan para el código
 * que ya importaba este módulo.
 */
export {
  ADMIN_UNLOCK_TTL_MS,
  PIN_ATTEMPT_DELAY_MS,
  PIN_HASH_ITERATIONS,
  PIN_LOCKOUT_STEPS,
  PIN_MIN_LENGTH,
} from "../config/provisional";
