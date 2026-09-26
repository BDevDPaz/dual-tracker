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

/**
 * FieldCrypto: expo-crypto (SDK 54) no expone AES. Mientras no haya una
 * primitiva simétrica disponible, FieldCryptoService opera en modo
 * "pass-through" marcado. Ver README → TODO Fase 5.
 */
export const FIELD_CRYPTO_AVAILABLE = false as const;
