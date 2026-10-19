/**
 * KDF del PIN de administración. Puro (sin Expo) para que el script del
 * empleador y el teléfono calculen el mismo hash.
 *
 * El formato vigente es scrypt (RFC 7914), con sal aleatoria por PIN y la
 * versión escrita dentro del propio hash: `scrypt1$N$r$p$dkLen$sal$hash`.
 * Los PIN anteriores siguen siendo SHA-256 iterado (`sal:pin`, luego cada
 * ronda es SHA-256 hex de `sal + hash anterior`). Un acierto con ese formato
 * se reescribe a scrypt; hasta entonces el formato viejo sigue verificando.
 */
import { scrypt } from "@noble/hashes/scrypt.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { b64urlDecode, b64urlEncode } from "../persistence/cryptoCodec";

/** Ventana fija de la comparación. Los hashes de PIN caben aquí. */
const COMPARE_WIDTH = 256;

const SCRYPT_RE = /^scrypt1\$(\d+)\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9_-]+)\$([0-9a-f]+)$/i;

export interface ScryptPinParams {
  N: number;
  r: number;
  p: number;
  dkLen: number;
}

export interface ParsedScryptPinHash extends ScryptPinParams {
  salt: Uint8Array;
  saltB64: string;
  hashHex: string;
  canonical: string;
}

export function sha256HexUtf8(text: string): string {
  return bytesToHex(sha256(utf8ToBytes(text)));
}

export function sha256HexBytes(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes));
}

/**
 * Compara dos cadenas sin salir en el primer byte distinto.
 * Recorre siempre COMPARE_WIDTH posiciones (el resto, si lo hay, también
 * entra en la diferencia, para no aceptar un sufijo ignorado).
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const left = a ?? "";
  const right = b ?? "";
  let diff = left.length ^ right.length;
  const tail = Math.max(left.length, right.length, COMPARE_WIDTH);
  for (let i = 0; i < tail; i++) {
    const ca = i < left.length ? left.charCodeAt(i) : 0;
    const cb = i < right.length ? right.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

/** Formato legado. No usar para PIN nuevos. */
export function derivePinHash(pin: string, salt: string, iterations: number): string {
  let h = `${salt}:${pin}`;
  for (let i = 0; i < iterations; i++) h = sha256HexUtf8(`${salt}${h}`);
  return h;
}

export function scryptPinHash(pin: string, salt: Uint8Array, params: ScryptPinParams): string {
  const dk = scrypt(utf8ToBytes(pin), salt, { N: params.N, r: params.r, p: params.p, dkLen: params.dkLen });
  const saltB64 = b64urlEncode(salt);
  const hashHex = bytesToHex(dk);
  return `scrypt1$${params.N}$${params.r}$${params.p}$${params.dkLen}$${saltB64}$${hashHex}`;
}

export function parseScryptPinHash(value: string): ParsedScryptPinHash | null {
  const m = SCRYPT_RE.exec((value ?? "").trim());
  if (!m) return null;
  const N = Number(m[1]);
  const r = Number(m[2]);
  const p = Number(m[3]);
  const dkLen = Number(m[4]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p) || !Number.isInteger(dkLen)) return null;
  let salt: Uint8Array;
  try {
    salt = b64urlDecode(m[5]);
  } catch {
    return null;
  }
  if (salt.length < 16) return null;
  const hashHex = m[6].toLowerCase();
  if (hashHex.length !== dkLen * 2) return null;
  const canonical = `scrypt1$${N}$${r}$${p}$${dkLen}$${m[5]}$${hashHex}`;
  return { N, r, p, dkLen, salt, saltB64: m[5], hashHex, canonical };
}

/** El N del hash no puede pasar del máximo vigente. r, p y dkLen tienen que coincidir. */
export function scryptCostAllowed(parsed: ScryptPinParams, max: ScryptPinParams): boolean {
  const pow2 = parsed.N >= 1024 && (parsed.N & (parsed.N - 1)) === 0;
  return pow2 && parsed.N <= max.N && parsed.r === max.r && parsed.p === max.p && parsed.dkLen === max.dkLen;
}

export function scryptPinMatches(pin: string, stored: string, max: ScryptPinParams): boolean {
  const parsed = parseScryptPinHash(stored);
  if (!parsed || !scryptCostAllowed(parsed, max)) return false;
  const again = scryptPinHash(pin, parsed.salt, parsed);
  return timingSafeEqual(again, parsed.canonical);
}
