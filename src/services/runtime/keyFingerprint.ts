/**
 * Huella corta de una clave pública Ed25519, para compararla fuera de banda.
 * Son los primeros 16 hex del SHA-256 de los 32 bytes (64 bits), en cuatro grupos.
 * El id del pack (`ed25519:` + esos 16 hex en minúsculas) usa los mismos bits.
 * No autentica sola: quien verifica tiene que haber recibido esta huella, o la
 * clave, por un canal distinto del código o del expediente.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { b64urlDecode } from "../persistence/cryptoCodec";
import { timingSafeEqual } from "./pinHash";

export const KEY_FINGERPRINT_HEX_LEN = 16;

export function publicKeyFingerprint(publicKey: Uint8Array): string | null {
  if (publicKey.length !== 32) return null;
  const hex = bytesToHex(sha256(publicKey)).slice(0, KEY_FINGERPRINT_HEX_LEN).toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
}

export function fingerprintFromB64url(pubB64url: string): string | null {
  try {
    return publicKeyFingerprint(b64urlDecode(pubB64url));
  } catch {
    return null;
  }
}

/** Huella de la clave del empleador. Lanza si la clave pública no es Ed25519. */
export function employerKeyFingerprint(pubB64url: string): string {
  const fingerprint = fingerprintFromB64url(pubB64url);
  if (!fingerprint) throw new Error("CLAVE_INVALIDA");
  return fingerprint;
}

export function normalizeFingerprint(input: string): string {
  return (input ?? "").replace(/[^0-9a-fA-F]/g, "").toUpperCase();
}

/** Compara lo tecleado con la huella canónica. Mayúsculas, espacios y guiones no importan. */
export function fingerprintsMatch(typed: string, expected: string): boolean {
  const left = normalizeFingerprint(typed);
  const right = normalizeFingerprint(expected);
  if (left.length !== KEY_FINGERPRINT_HEX_LEN || right.length !== KEY_FINGERPRINT_HEX_LEN) return false;
  return timingSafeEqual(left, right);
}
