/**
 * Código de un solo uso con el que el empleador deja el PIN de administración
 * en el teléfono. No hace falta un servidor.
 *
 * El código lleva el hash scrypt (nunca el PIN en claro), una caducidad, un
 * nonce y una firma Ed25519 del cuerpo canónico. La clave pública viaja en el
 * código. El primer código que se aplica deja esa clave fijada en el teléfono
 * (TOFU). Después solo vale una firma de esa misma clave, salvo que la zona
 * admin esté desbloqueada y se rote a propósito.
 *
 * Formato: `DTPIN1.` + base64url(JSON). El mismo texto es el contenido del QR.
 * v1 (legado, SHA-256 iterado) sigue aceptándose y se migra al verificar.
 * v2 lleva el hash `scrypt1$…`.
 * Cómo generarlo: scripts/provision-admin-pin.ts y docs/PIN_APROVISIONAMIENTO.md.
 */
import { getPublicKey, hashes, sign, verify } from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { PIN_HASH_ITERATIONS, PIN_MIN_LENGTH, PIN_SCRYPT_DK_LEN, PIN_SCRYPT_N, PIN_SCRYPT_P, PIN_SCRYPT_R } from "../../config/provisional";
import { canonicalJson } from "../../utils/canonicalJson";
import { b64urlDecode, b64urlEncode, utf8 } from "../persistence/cryptoCodec";
import { derivePinHash, parseScryptPinHash, scryptCostAllowed, scryptPinHash, sha256HexBytes, type ScryptPinParams } from "./pinHash";

hashes.sha512 = sha512;

export const PIN_CODE_PREFIX = "DTPIN1.";

export interface PinProvisionBodyV1 {
  v: 1;
  salt: string;
  hash: string;
  iterations: number;
  exp: number;
  nonce: string;
}

export interface PinProvisionBodyV2 {
  v: 2;
  kdf: "scrypt";
  salt: string;
  hash: string;
  exp: number;
  nonce: string;
}

export type PinProvisionBody = PinProvisionBodyV1 | PinProvisionBodyV2;

export type PinProvisionPayload = PinProvisionBody & { pub: string; sig: string };

export type PinCodeError = "CODE_INVALID" | "CODE_EXPIRED" | "PIN_INVALID";

const currentScrypt = (): ScryptPinParams => ({ N: PIN_SCRYPT_N, r: PIN_SCRYPT_R, p: PIN_SCRYPT_P, dkLen: PIN_SCRYPT_DK_LEN });

function hexNonce(bytes: Uint8Array): string {
  return Array.from(bytes.subarray(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

function isV1(value: PinProvisionBody): value is PinProvisionBodyV1 {
  return (
    value.v === 1 &&
    typeof (value as PinProvisionBodyV1).salt === "string" &&
    (value as PinProvisionBodyV1).salt.length > 0 &&
    typeof (value as PinProvisionBodyV1).hash === "string" &&
    /^[0-9a-f]{64}$/i.test((value as PinProvisionBodyV1).hash) &&
    (value as PinProvisionBodyV1).iterations === PIN_HASH_ITERATIONS &&
    typeof value.exp === "number" &&
    Number.isFinite(value.exp) &&
    typeof value.nonce === "string" &&
    /^[0-9a-f]{32}$/i.test(value.nonce)
  );
}

function isV2(value: PinProvisionBody): value is PinProvisionBodyV2 {
  if (value.v !== 2 || value.kdf !== "scrypt") return false;
  const v = value as PinProvisionBodyV2;
  if (typeof v.salt !== "string" || typeof v.hash !== "string" || typeof v.exp !== "number" || !Number.isFinite(v.exp)) return false;
  if (!/^[0-9a-f]{32}$/i.test(v.nonce)) return false;
  const parsed = parseScryptPinHash(v.hash);
  if (!parsed || !scryptCostAllowed(parsed, currentScrypt())) return false;
  if (parsed.N !== PIN_SCRYPT_N) return false;
  return parsed.saltB64 === v.salt;
}

export function provisionMessage(body: PinProvisionBody): string {
  if (body.v === 1) {
    return canonicalJson({ v: body.v, salt: body.salt, hash: body.hash, iterations: body.iterations, exp: body.exp, nonce: body.nonce });
  }
  return canonicalJson({ v: body.v, kdf: body.kdf, salt: body.salt, hash: body.hash, exp: body.exp, nonce: body.nonce });
}

export function employerKeyId(pubB64url: string): string {
  return sha256HexBytes(b64urlDecode(pubB64url));
}

export function encodeProvisionCode(payload: PinProvisionPayload): string {
  return PIN_CODE_PREFIX + b64urlEncode(utf8.encode(JSON.stringify(payload)));
}

export function decodeProvisionCode(code: string): PinProvisionPayload | null {
  const raw = (code ?? "").trim();
  if (!raw.startsWith(PIN_CODE_PREFIX)) return null;
  try {
    const json = utf8.decode(b64urlDecode(raw.slice(PIN_CODE_PREFIX.length)));
    const parsed = JSON.parse(json) as PinProvisionPayload;
    const bodyOk = parsed.v === 2 ? isV2(parsed) : parsed.v === 1 ? isV1(parsed) : false;
    if (!bodyOk) return null;
    if (typeof parsed.pub !== "string" || typeof parsed.sig !== "string") return null;
    const pub = b64urlDecode(parsed.pub);
    const sig = b64urlDecode(parsed.sig);
    if (pub.length !== 32 || sig.length !== 64) return null;
    const ok = verify(sig, utf8.encode(provisionMessage(parsed)), pub);
    return ok ? parsed : null;
  } catch {
    return null;
  }
}

function signBody(body: PinProvisionBody, seed: Uint8Array): PinProvisionPayload {
  const pub = getPublicKey(seed);
  const sig = sign(utf8.encode(provisionMessage(body)), seed);
  return { ...body, pub: b64urlEncode(pub), sig: b64urlEncode(sig) };
}

export function createProvisionCode(input: {
  pin: string;
  expiresAtMs: number;
  salt: Uint8Array;
  nonce: Uint8Array;
  seed: Uint8Array;
}): { ok: true; code: string; nonce: string; expiresAtMs: number } | { ok: false; code: PinCodeError } {
  const pin = (input.pin ?? "").trim();
  if (pin.length < PIN_MIN_LENGTH) return { ok: false, code: "PIN_INVALID" };
  if (!Number.isFinite(input.expiresAtMs)) return { ok: false, code: "CODE_INVALID" };
  if (input.salt.length < 16 || input.nonce.length < 16 || input.seed.length !== 32) return { ok: false, code: "CODE_INVALID" };
  const saltBytes = input.salt.subarray(0, 16);
  const hash = scryptPinHash(pin, saltBytes, currentScrypt());
  const parsed = parseScryptPinHash(hash);
  if (!parsed) return { ok: false, code: "CODE_INVALID" };
  const body: PinProvisionBodyV2 = {
    v: 2,
    kdf: "scrypt",
    salt: parsed.saltB64,
    hash,
    exp: input.expiresAtMs,
    nonce: hexNonce(input.nonce),
  };
  const code = encodeProvisionCode(signBody(body, input.seed));
  return { ok: true, code, nonce: body.nonce, expiresAtMs: input.expiresAtMs };
}

/** Código v1. Lo acepta el teléfono y, al verificar el PIN, lo pasa a scrypt. */
export function createLegacyProvisionCode(input: {
  pin: string;
  expiresAtMs: number;
  salt: Uint8Array;
  nonce: Uint8Array;
  seed: Uint8Array;
}): { ok: true; code: string; nonce: string; expiresAtMs: number } | { ok: false; code: PinCodeError } {
  const pin = (input.pin ?? "").trim();
  if (pin.length < PIN_MIN_LENGTH) return { ok: false, code: "PIN_INVALID" };
  if (!Number.isFinite(input.expiresAtMs) || input.salt.length < 16 || input.nonce.length < 16 || input.seed.length !== 32) {
    return { ok: false, code: "CODE_INVALID" };
  }
  const salt = b64urlEncode(input.salt.subarray(0, 16));
  const body: PinProvisionBodyV1 = {
    v: 1,
    salt,
    hash: derivePinHash(pin, salt, PIN_HASH_ITERATIONS),
    iterations: PIN_HASH_ITERATIONS,
    exp: input.expiresAtMs,
    nonce: hexNonce(input.nonce),
  };
  return { ok: true, code: encodeProvisionCode(signBody(body, input.seed)), nonce: body.nonce, expiresAtMs: input.expiresAtMs };
}

/** Rechaza un código caducado. La firma ya se comprobó en decode. */
export function assessProvisionCode(code: string, nowMs: number): { ok: true; payload: PinProvisionPayload } | { ok: false; code: PinCodeError } {
  const payload = decodeProvisionCode(code);
  if (!payload) return { ok: false, code: "CODE_INVALID" };
  if (payload.exp <= nowMs) return { ok: false, code: "CODE_EXPIRED" };
  return { ok: true, payload };
}
