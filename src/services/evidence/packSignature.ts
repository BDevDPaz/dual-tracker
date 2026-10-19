/**
 * Firma Ed25519 del manifiesto de un expediente (tanda 1).
 * ============================================================================
 * Librería pura @noble/ed25519 + SHA-512 de @noble/hashes (sin WebCrypto),
 * compatible con Hermes. La clave privada se genera una vez y vive en el
 * llavero (mismo KeyStore que FieldCrypto, otro slot). No entra en el pack.
 *
 * Mensaje firmado = canonicalJson({ ...cuerpoDePackHash, packHash }).
 * packHash y contentHash no cambian de significado: la firma no forma parte
 * de ninguno de los dos.
 *
 * Verificación por el empleador: docs/CONFIABILIDAD_TANDA1.md.
 */
import { getPublicKey, hashes, sign, verify } from "@noble/ed25519";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import * as Crypto from "expo-crypto";
import type { PackSignature } from "../../core/contracts";
import { canonicalJson } from "../../utils/canonicalJson";
import { b64urlDecode, b64urlEncode, utf8 } from "../persistence/cryptoCodec";
import { KeyStore } from "../persistence/keyStore";

hashes.sha512 = sha512;

export const PACK_SIGNATURE_ALGORITHM = "Ed25519" as const;
/** Slot del llavero. Distinto de la clave maestra de FieldCrypto. */
export const PACK_SIGNING_SLOT = "dt.packsig.ed25519.v1";

interface StoredKey {
  v: 1;
  seed: string;
}

let cached: { seed: Uint8Array; publicKey: Uint8Array; keyId: string } | null = null;

export function signedMessage(body: Record<string, unknown>, packHash: string): string {
  return canonicalJson({ ...body, packHash });
}

function keyIdOf(publicKey: Uint8Array): string {
  return `ed25519:${bytesToHex(sha256(publicKey)).slice(0, 16)}`;
}

function toSignature(seed: Uint8Array, publicKey: Uint8Array, message: string): PackSignature {
  const value = sign(utf8.encode(message), seed);
  return {
    algorithm: PACK_SIGNATURE_ALGORITHM,
    keyId: keyIdOf(publicKey),
    publicKey: b64urlEncode(publicKey),
    value: b64urlEncode(value),
  };
}

async function loadOrCreate(): Promise<{ seed: Uint8Array; publicKey: Uint8Array; keyId: string } | null> {
  if (cached) return cached;
  if (!KeyStore.platformSupported) return null;
  try {
    const raw = await KeyStore.get(PACK_SIGNING_SLOT);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredKey;
      if (parsed?.v !== 1 || typeof parsed.seed !== "string") return null;
      const seed = b64urlDecode(parsed.seed);
      if (seed.length !== 32) return null;
      const publicKey = getPublicKey(seed);
      cached = { seed, publicKey, keyId: keyIdOf(publicKey) };
      return cached;
    }
    const seed = Crypto.getRandomBytes(32);
    const publicKey = getPublicKey(seed);
    const stored = JSON.stringify({ v: 1, seed: b64urlEncode(seed) } satisfies StoredKey);
    await KeyStore.set(PACK_SIGNING_SLOT, stored);
    const back = await KeyStore.get(PACK_SIGNING_SLOT);
    if (back !== stored) return null;
    cached = { seed, publicKey, keyId: keyIdOf(publicKey) };
    return cached;
  } catch {
    return null;
  }
}

/** true si este dispositivo puede firmar (hay llavero y clave). */
export async function canSignPacks(): Promise<boolean> {
  return (await loadOrCreate()) !== null;
}

/**
 * Firma el cuerpo canónico que entra en packHash, más el propio packHash.
 * null = sin llavero: el sello sigue, marcado como unsigned-v1.
 */
export async function signCanonicalBody(body: Record<string, unknown>, packHash: string): Promise<PackSignature | null> {
  const key = await loadOrCreate();
  if (!key) return null;
  return toSignature(key.seed, key.publicKey, signedMessage(body, packHash));
}

/**
 * Verifica una firma con la clave pública que viaja en el pack.
 * No usa la clave privada del dispositivo: la puede correr el empleador.
 */
export function verifyCanonicalBody(body: Record<string, unknown>, packHash: string, signature: PackSignature): boolean {
  if (signature.algorithm !== "Ed25519") return false;
  try {
    const publicKey = b64urlDecode(signature.publicKey);
    const value = b64urlDecode(signature.value);
    if (publicKey.length !== 32 || value.length !== 64) return false;
    if (keyIdOf(publicKey) !== signature.keyId) return false;
    return verify(value, utf8.encode(signedMessage(body, packHash)), publicKey);
  } catch {
    return false;
  }
}

/** Solo tests: olvida la clave en memoria (el llavero no se borra). */
export function __resetPackSignatureForTests(): void {
  cached = null;
}
