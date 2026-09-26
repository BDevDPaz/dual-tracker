/**
 * FieldCryptoService — Persistencia (Propuesta Técnica §5.14, nuevo)
 * ============================================================================
 * Cifrado de coordenadas históricas, notas y correo con clave en SecureStore
 * (Keychain / Keystore). "Un backup de SQLite sin esta capa expone la ruta
 * diaria del trabajador."
 *
 * ESTADO ACTUAL (Fase 5 pendiente):
 *  - La gestión de clave es real: se genera una clave de 256 bits con
 *    expo-crypto y se guarda en expo-secure-store.
 *  - expo-crypto (SDK 54) NO expone AES, por lo que seal()/open() funcionan en
 *    modo "pass-through" con prefijo `plain:v1:` mientras
 *    FIELD_CRYPTO_AVAILABLE = false. El formato ya está versionado para que,
 *    al activar el cifrado real (`aesgcm:v1:`), open() siga leyendo lo antiguo.
 *  TODO(Fase 5): elegir primitiva AES-GCM (p. ej. react-native-quick-crypto o
 *  módulo nativo propio) e implementar encryptAesGcm/decryptAesGcm.
 */
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { FIELD_CRYPTO_AVAILABLE } from "../../constants/flags";

const KEY_ALIAS = "dualtracker.fieldcrypto.key.v1";
const PLAIN_PREFIX = "plain:v1:";
const AES_PREFIX = "aesgcm:v1:";

let cachedKeyHex: string | null = null;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function getOrCreateKey(): Promise<string> {
  if (cachedKeyHex) return cachedKeyHex;
  let key = await SecureStore.getItemAsync(KEY_ALIAS);
  if (!key) {
    key = bytesToHex(await Crypto.getRandomBytesAsync(32));
    await SecureStore.setItemAsync(KEY_ALIAS, key, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
  }
  cachedKeyHex = key;
  return key;
}

export const FieldCryptoService = {
  /** Prepara la clave al arranque (no bloquea si SecureStore falla). */
  async init(): Promise<boolean> {
    try {
      await getOrCreateKey();
      return true;
    } catch {
      return false;
    }
  },

  /** true si los campos se guardan realmente cifrados. */
  isEncryptionActive(): boolean {
    return FIELD_CRYPTO_AVAILABLE;
  },

  /** Sella un valor sensible para guardarlo en SQLite. */
  async seal(plain: string | null): Promise<string | null> {
    if (plain === null || plain === undefined) return null;
    if (!FIELD_CRYPTO_AVAILABLE) return `${PLAIN_PREFIX}${plain}`;
    await getOrCreateKey();
    // TODO(Fase 5): return AES_PREFIX + encryptAesGcm(key, plain)
    throw new Error("FieldCrypto: AES-GCM no implementado");
  },

  /** Abre un valor sellado. Acepta valores heredados sin prefijo. */
  async open(sealed: string | null): Promise<string | null> {
    if (sealed === null || sealed === undefined) return null;
    if (sealed.startsWith(PLAIN_PREFIX)) return sealed.slice(PLAIN_PREFIX.length);
    if (sealed.startsWith(AES_PREFIX)) {
      await getOrCreateKey();
      // TODO(Fase 5): return decryptAesGcm(key, sealed.slice(AES_PREFIX.length))
      throw new Error("FieldCrypto: AES-GCM no implementado");
    }
    return sealed;
  },

  async sealJson(value: unknown): Promise<string | null> {
    return value === null || value === undefined ? null : FieldCryptoService.seal(JSON.stringify(value));
  },

  async openJson<T>(sealed: string | null): Promise<T | null> {
    const raw = await FieldCryptoService.open(sealed);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
};
