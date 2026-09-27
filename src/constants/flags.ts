/**
 * Banderas de compilación.
 *
 * DEMO_MODE: reservado para atajos de demostración. En esta versión NO hay
 * ningún atajo activo: el PIN "1234" y la regla demo "00:00 = solape" de
 * W Tracker fueron REEMPLAZADOS (no ocultados) por SecurityService y por
 * PersistenceService.checkOverlap, como exige la propuesta (§4.2, §4.8, §10).
 * Si en el futuro se añade un atajo, debe quedar detrás de esta bandera y
 * documentarse en el README.
 */
export const DEMO_MODE = false as const;

// FieldCrypto v1.3: sin interruptor (se eliminó FIELD_CRYPTO_AVAILABLE; §10 y §12).
