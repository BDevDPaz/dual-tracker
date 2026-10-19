/**
 * Código de un solo uso con el que el empleador deja el PIN de administración
 * en el teléfono. No hace falta un servidor.
 *
 * El código lleva el hash salado (nunca el PIN en claro), una caducidad, un
 * nonce y una firma Ed25519 del cuerpo canónico. La clave pública viaja en el
 * código: sirve para detectar un código truncado o alterado. No hay una clave
 * del empleador preinstalada; quien tenga el código antes de que caduque puede
 * usarlo una vez. El PIN se comunica por otro canal.
 *
 * Formato: `DTPIN1.` + base64url(JSON). El mismo texto es el contenido del QR.
 * Cómo generarlo: scripts/provision-admin-pin.ts y docs/PIN_APROVISIONAMIENTO.md.
 */
import { getPublicKey, hashes, sign, verify } from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { PIN_HASH_ITERATIONS, PIN_MIN_LENGTH } from "../../config/provisional";
import { canonicalJson } from "../../utils/canonicalJson";
import { b64urlDecode, b64urlEncode, utf8 } from "../persistence/cryptoCodec";
import { derivePinHash } from "./pinHash";

hashes.sha512 = sha512;

export const PIN_CODE_PREFIX = "DTPIN1.";

export interface PinProvisionBody {
  v: 1;
  salt: string;
  hash: string;
  iterations: number;
  exp: number;
  nonce: string;
}

export interface PinProvisionPayload extends PinProvisionBody {
  pub: string;
  sig: string;
}

export type PinCodeError = "CODE_INVALID" | "CODE_EXPIRED" | "PIN_INVALID";

function isBody(value: unknown): value is PinProvisionBody {
  if (!value || typeof value !== "object") return false;
  const v = value as PinProvisionBody;
  return (
    v.v === 1 &&
    typeof v.salt === "string" &&
    v.salt.length > 0 &&
    typeof v.hash === "string" &&
    /^[0-9a-f]{64}$/i.test(v.hash) &&
    v.iterations === PIN_HASH_ITERATIONS &&
    typeof v.exp === "number" &&
    Number.isFinite(v.exp) &&
    typeof v.nonce === "string" &&
    /^[0-9a-f]{32}$/i.test(v.nonce)
  );
}

export function provisionMessage(body: PinProvisionBody): string {
  return canonicalJson({ v: body.v, salt: body.salt, hash: body.hash, iterations: body.iterations, exp: body.exp, nonce: body.nonce });
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
    if (!isBody(parsed)) return null;
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
  const salt = b64urlEncode(input.salt.subarray(0, 16));
  const nonce = Array.from(input.nonce.subarray(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
  const body: PinProvisionBody = {
    v: 1,
    salt,
    hash: derivePinHash(pin, salt, PIN_HASH_ITERATIONS),
    iterations: PIN_HASH_ITERATIONS,
    exp: input.expiresAtMs,
    nonce,
  };
  const pub = getPublicKey(input.seed);
  const sig = sign(utf8.encode(provisionMessage(body)), input.seed);
  const code = encodeProvisionCode({ ...body, pub: b64urlEncode(pub), sig: b64urlEncode(sig) });
  return { ok: true, code, nonce, expiresAtMs: input.expiresAtMs };
}

/** Rechaza un código caducado. La firma ya se comprobó en decode. */
export function assessProvisionCode(code: string, nowMs: number): { ok: true; payload: PinProvisionPayload } | { ok: false; code: PinCodeError } {
  const payload = decodeProvisionCode(code);
  if (!payload) return { ok: false, code: "CODE_INVALID" };
  if (payload.exp <= nowMs) return { ok: false, code: "CODE_EXPIRED" };
  return { ok: true, payload };
}
