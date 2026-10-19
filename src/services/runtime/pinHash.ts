/**
 * KDF del PIN de administración. Puro (sin Expo) para que el script del
 * empleador y el teléfono calculen el mismo hash.
 *
 * Cada ronda es SHA-256 hex de `sal + hash anterior`. La primera entrada es
 * `sal:pin`. Es el mismo esquema que usaba expo-crypto; SHA-256 de UTF-8
 * coincide, así que un PIN ya guardado sigue abriendo.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

export function sha256HexUtf8(text: string): string {
  return bytesToHex(sha256(utf8ToBytes(text)));
}

export function derivePinHash(pin: string, salt: string, iterations: number): string {
  let h = `${salt}:${pin}`;
  for (let i = 0; i < iterations; i++) h = sha256HexUtf8(`${salt}${h}`);
  return h;
}
