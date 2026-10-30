import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

/**
 * ============================================================================
 * FieldCryptoService — Propuesta 5.14 (nuevo)
 * ----------------------------------------------------------------------------
 * "Cifrado de coordenadas históricas, notas y correo con clave en SecureStore
 * o Keystore. Un backup de SQLite sin esta capa expone la ruta diaria del
 * trabajador."
 *
 * ⚠️ LIMITACIÓN DOCUMENTADA DEL CIFRADO ⚠️
 * Este archivo usa ÚNICAMENTE `expo-crypto` + `expo-secure-store` porque no
 * hay instalado ningún paquete de cifrado simétrico autenticado (por ejemplo
 * una librería AES-GCM real). `expo-crypto` expone hashing/HMAC/random, pero
 * NO expone un cifrador simétrico. Por lo tanto, el "cifrado" implementado
 * aquí es un stream cipher construido a mano (keystream = SHA-256 en cadena,
 * XOR contra el texto plano) con un HMAC-SHA256 de integridad sobre el
 * ciphertext. Esto NO es equivalente en garantías a un cifrado autenticado
 * como AES-GCM/ChaCha20-Poly1305 revisado por pares: es una capa de
 * ofuscación con integridad verificable, suficiente para que un volcado
 * (backup) de SQLite no exponga coordenadas/notas/correo en texto plano,
 * pero NO se debe presentar como cifrado de nivel productivo definitivo.
 *
 * Para producción: agregar una librería de cifrado simétrico autenticado
 * vetada (ej. react-native-quick-crypto, o el soporte AES-GCM que
 * expo-crypto pueda incorporar a futuro) y reemplazar únicamente las
 * funciones `xorKeystream` / `computeHmac` de este archivo. La API pública
 * (`encryptField` / `decryptField` / `rotateKey`) es el contrato estable del
 * que deben depender otros servicios — no debe cambiar cuando se reemplace
 * el primitivo de cifrado.
 * ============================================================================
 */

const KEY_MATERIAL_KEY = "dualtracker.fieldcrypto.keyMaterial";
const KEY_VERSION_KEY = "dualtracker.fieldcrypto.keyVersion";

/** Prefijo de versión de formato del ciphertext serializado. */
const CIPHERTEXT_FORMAT_VERSION = "v1";

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.length % 2 === 0 ? hex : `0${hex}`;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Codificación/decodificación UTF-8 manual, implementada a mano sobre
 * puntos de código JS estándar (sin TextEncoder/TextDecoder ni las
 * funciones heredadas escape/unescape, cuya disponibilidad de tipos no está
 * garantizada en todos los targets de compilación de la app).
 */
function utf8ToBytes(value: string): Uint8Array {
  const bytes: number[] = [];

  for (let i = 0; i < value.length; i += 1) {
    let codePoint = value.codePointAt(i) as number;

    // Par subrogado: codePointAt ya combina ambas unidades UTF-16; avanzamos
    // un índice extra para no reprocesar la segunda mitad del par.
    if (codePoint > 0xffff) {
      i += 1;
    }

    if (codePoint < 0x80) {
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint < 0x10000) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }

  return new Uint8Array(bytes);
}

function bytesToUtf8(bytes: Uint8Array): string {
  let result = "";
  let i = 0;

  while (i < bytes.length) {
    const b0 = bytes[i];
    let codePoint: number;
    let extraBytes: number;

    if (b0 < 0x80) {
      codePoint = b0;
      extraBytes = 0;
    } else if ((b0 & 0xe0) === 0xc0) {
      codePoint = b0 & 0x1f;
      extraBytes = 1;
    } else if ((b0 & 0xf0) === 0xe0) {
      codePoint = b0 & 0x0f;
      extraBytes = 2;
    } else if ((b0 & 0xf8) === 0xf0) {
      codePoint = b0 & 0x07;
      extraBytes = 3;
    } else {
      // Byte de continuación inesperado como líder: lo tratamos como
      // Latin-1 para no perder datos ni lanzar en un flujo fail-secure.
      codePoint = b0;
      extraBytes = 0;
    }

    for (let k = 1; k <= extraBytes && i + k < bytes.length; k += 1) {
      codePoint = (codePoint << 6) | (bytes[i + k] & 0x3f);
    }

    result += String.fromCodePoint(codePoint);
    i += extraBytes + 1;
  }

  return result;
}

async function ensureKeyMaterial(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_MATERIAL_KEY);
  if (existing) return existing;

  const randomBytes = await Crypto.getRandomBytesAsync(32);
  const keyHex = bytesToHex(randomBytes);
  await SecureStore.setItemAsync(KEY_MATERIAL_KEY, keyHex);
  await SecureStore.setItemAsync(KEY_VERSION_KEY, "1");
  return keyHex;
}

/**
 * Genera un keystream determinístico de `lengthBytes` a partir de la clave y
 * un nonce, encadenando SHA-256(clave || nonce || contador). No es un cifrado
 * de bloque estándar; ver limitación documentada arriba.
 */
async function deriveKeystream(
  keyHex: string,
  nonceHex: string,
  lengthBytes: number,
): Promise<Uint8Array> {
  const keystream = new Uint8Array(lengthBytes);
  let offset = 0;
  let counter = 0;

  while (offset < lengthBytes) {
    const blockHex = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `${keyHex}:${nonceHex}:${counter}`,
    );
    const blockBytes = hexToBytes(blockHex);
    const toCopy = Math.min(blockBytes.length, lengthBytes - offset);
    keystream.set(blockBytes.subarray(0, toCopy), offset);
    offset += toCopy;
    counter += 1;
  }

  return keystream;
}

function xorBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i += 1) {
    out[i] = a[i] ^ b[i];
  }
  return out;
}

async function computeHmac(keyHex: string, dataHex: string): Promise<string> {
  // expo-crypto no expone HMAC nativo multiplataforma estable; construimos
  // un HMAC simplificado tipo "H(key || H(key || data))" (doble hash con
  // clave), suficiente para detectar manipulación del ciphertext bajo el
  // modelo de amenaza documentado (backup local, no adversario activo de
  // canal). Ver limitación de cifrado arriba.
  const inner = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${keyHex}:${dataHex}`,
  );
  const outer = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${keyHex}:${inner}`,
  );
  return outer;
}

class FieldCryptoService {
  /**
   * Cifra un valor de campo (coordenada, nota, correo) para almacenamiento
   * en SQLite. Devuelve una cadena serializada auto-contenida:
   * `v1:<keyVersion>:<nonceHex>:<ciphertextHex>:<hmacHex>`.
   */
  async encryptField(plaintext: string): Promise<string> {
    const keyHex = await ensureKeyMaterial();
    const keyVersionRaw = await SecureStore.getItemAsync(KEY_VERSION_KEY);
    const keyVersion = keyVersionRaw ?? "1";

    const nonceBytes = await Crypto.getRandomBytesAsync(16);
    const nonceHex = bytesToHex(nonceBytes);

    const plaintextBytes = utf8ToBytes(plaintext);
    const keystream = await deriveKeystream(keyHex, nonceHex, plaintextBytes.length);
    const ciphertextBytes = xorBytes(plaintextBytes, keystream);
    const ciphertextHex = bytesToHex(ciphertextBytes);

    const hmacHex = await computeHmac(keyHex, `${nonceHex}:${ciphertextHex}`);

    return [CIPHERTEXT_FORMAT_VERSION, keyVersion, nonceHex, ciphertextHex, hmacHex].join(":");
  }

  /**
   * Descifra un valor serializado por encryptField. Verifica el HMAC antes
   * de descifrar; rechaza (lanza) ante cualquier discrepancia de integridad
   * o formato — fail-secure, nunca devuelve texto plano no verificado.
   */
  async decryptField(ciphertext: string): Promise<string> {
    const parts = ciphertext.split(":");
    if (parts.length !== 5 || parts[0] !== CIPHERTEXT_FORMAT_VERSION) {
      throw new Error("FieldCryptoService: formato de ciphertext desconocido o inválido.");
    }

    const [, , nonceHex, ciphertextHex, hmacHex] = parts;

    const keyHex = await SecureStore.getItemAsync(KEY_MATERIAL_KEY);
    if (!keyHex) {
      throw new Error("FieldCryptoService: no hay clave de cifrado disponible en SecureStore.");
    }

    const expectedHmac = await computeHmac(keyHex, `${nonceHex}:${ciphertextHex}`);

    if (expectedHmac !== hmacHex) {
      throw new Error(
        "FieldCryptoService: fallo de integridad (HMAC no coincide); " +
          "se rechaza el descifrado.",
      );
    }

    const ciphertextBytes = hexToBytes(ciphertextHex);
    const keystream = await deriveKeystream(keyHex, nonceHex, ciphertextBytes.length);
    const plaintextBytes = xorBytes(ciphertextBytes, keystream);

    return bytesToUtf8(plaintextBytes);
  }

  /**
   * Rota la clave de cifrado: genera nuevo material aleatorio y bump de
   * versión. Re-cifrar valores existentes con la clave anterior queda fuera
   * de alcance de este servicio (responsabilidad del llamador, que debe
   * descifrar con la clave previa antes de invocar rotateKey, o mantener
   * ambas versiones disponibles temporalmente).
   */
  async rotateKey(): Promise<void> {
    const currentVersionRaw = await SecureStore.getItemAsync(KEY_VERSION_KEY);
    const currentVersion = currentVersionRaw ? parseInt(currentVersionRaw, 10) : 0;
    const nextVersion = Number.isFinite(currentVersion) ? currentVersion + 1 : 1;

    const randomBytes = await Crypto.getRandomBytesAsync(32);
    const keyHex = bytesToHex(randomBytes);

    await SecureStore.setItemAsync(KEY_MATERIAL_KEY, keyHex);
    await SecureStore.setItemAsync(KEY_VERSION_KEY, String(nextVersion));
  }

  /** Versión actual de la clave activa, o null si aún no se generó ninguna. */
  async getKeyVersion(): Promise<number | null> {
    const raw = await SecureStore.getItemAsync(KEY_VERSION_KEY);
    if (!raw) return null;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
}

export const fieldCryptoService = new FieldCryptoService();
