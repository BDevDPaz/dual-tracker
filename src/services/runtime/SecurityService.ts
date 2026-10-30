/**
 * SecurityService — Runtime (Propuesta Técnica §4.8)
 * Reemplaza el PIN demo y el securityAdapter aislado.
 * ============================================================================
 *  - PIN/clave de administración con HASH EN DISPOSITIVO (scrypt con sal
 *    aleatoria, guardado en SecureStore/Keystore). Un hash legado SHA-256
 *    iterado se acepta una vez y se reescribe a scrypt.
 *  - Retardo anti-fuerza bruta (650 ms heredados de GEOTrack) y bloqueo
 *    progresivo (PIN_LOCKOUT_STEPS).
 *  - Fail-secure: cualquier error criptográfico o de almacenamiento DENIEGA.
 *  - El estado "desbloqueado" es de sesión de UI (store.admin), con caducidad;
 *    no vive en el servicio.
 *
 * NO se portan: validatePIN() === "1234" (W Tracker, securityEngine.ts) ni el
 * hash fijo DEMO_ADMIN_PIN_SHA256 (= SHA-256("1234")) de GEOTrack. Tampoco se
 * dejan detrás de un flag: la propuesta los reemplaza explícitamente.
 *
 * El primer PIN lo fija quien configura el dispositivo (SETUP_ADMIN_PIN),
 * etiquetado como local. El empleador puede sustituirlo con un código de un
 * solo uso (PROVISION_ADMIN_PIN) que trae el hash salado, no el PIN en claro.
 * Los escalones de bloqueo no cambian.
 */
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { ADMIN_UNLOCK_TTL_MS, PIN_ATTEMPT_DELAY_MS, PIN_HASH_ITERATIONS, PIN_LOCKOUT_STEPS, PIN_MAX_LENGTH, PIN_MIN_LENGTH, PIN_SCRYPT_DK_LEN, PIN_SCRYPT_N, PIN_SCRYPT_P, PIN_SCRYPT_R } from "../../config/provisional";
import { Store, StoreActions } from "../../core/store";
import { serializeError } from "../../utils/serializeError";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { LoggingService } from "../persistence/LoggingService";
import { derivePinHash, parseScryptPinHash, scryptPinHash, scryptPinMatches, timingSafeEqual, type ScryptPinParams } from "./pinHash";
import { employerKeyAnchorPub } from "../../config/employerKeyAnchor";
import { employerKeyFingerprint, fingerprintsMatch } from "./keyFingerprint";
import { assessProvisionCode, employerKeyId, type PinProvisionPayload } from "./pinProvision";

export const ADMIN_PIN_STORE_KEY = "dualtracker.admin.pin.v1";
export const EMPLOYER_KEY_STORE_KEY = "dualtracker.admin.employer.key.v1";
const PIN_KEY = ADMIN_PIN_STORE_KEY;
const LOCKOUT_KEY = "dualtracker.admin.lockout.v1";
const USED_NONCES_KEY = "dualtracker.admin.provision.used.v1";

export type PinOrigin = "UNSET" | "LOCAL" | "EMPLOYER";

interface StoredPin {
  salt: string;
  hash: string;
  /** Ausente o distinto de scrypt: formato legado (SHA-256 iterado). */
  kdf?: "scrypt";
  iterations?: number;
  /** Ausente en registros anteriores a la tanda 2: se leen como LOCAL. */
  provision?: "LOCAL" | "EMPLOYER";
  provisionNonce?: string;
  provisionedAtMs?: number;
}

interface PinnedEmployerKey {
  pub: string;
  keyId: string;
}

export type EmployerKeyAction = "PINNED" | "REPINNED" | "UNCHANGED";
/** Cómo se autenticó la primera clave. No hay fijación a ciegas. */
export type EmployerKeyAuth = "FINGERPRINT" | "ANCHOR";

interface LockoutState {
  failures: number;
  lockedUntilMs: number | null;
}

export type UnlockResult =
  | { ok: true; unlockedUntilMs: number }
  | { ok: false; code: "PIN_NOT_SET" | "ADMIN_DENIED" | "ADMIN_LOCKOUT" | "ERROR"; lockedUntilMs?: number | null };

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function scryptParams(): ScryptPinParams {
  return { N: PIN_SCRYPT_N, r: PIN_SCRYPT_R, p: PIN_SCRYPT_P, dkLen: PIN_SCRYPT_DK_LEN };
}

function freshScryptRecord(pin: string, salt: Uint8Array, extra: Pick<StoredPin, "provision" | "provisionNonce" | "provisionedAtMs">): StoredPin {
  const hash = scryptPinHash(pin, salt, scryptParams());
  const parsed = parseScryptPinHash(hash);
  if (!parsed) throw new Error("hash scrypt inválido");
  return { salt: parsed.saltB64, hash: parsed.canonical, kdf: "scrypt", ...extra };
}

async function readLockout(): Promise<LockoutState> {
  const raw = await SecureStore.getItemAsync(LOCKOUT_KEY);
  return raw ? (JSON.parse(raw) as LockoutState) : { failures: 0, lockedUntilMs: null };
}

function lockDurationFor(failures: number): number {
  let ms = 0;
  for (const [threshold, duration] of PIN_LOCKOUT_STEPS) if (failures >= threshold) ms = duration;
  return ms;
}

async function readUsedNonces(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(USED_NONCES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

async function readStoredPin(): Promise<StoredPin | null> {
  const raw = await SecureStore.getItemAsync(PIN_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as StoredPin;
}

async function readPinnedKey(): Promise<PinnedEmployerKey | null> {
  const raw = await SecureStore.getItemAsync(EMPLOYER_KEY_STORE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as PinnedEmployerKey;
  if (!parsed || typeof parsed.pub !== "string" || typeof parsed.keyId !== "string") return null;
  return parsed;
}

export interface ProvisionSnapshot {
  pin: string | null;
  employerKey: string | null;
  nonces: string | null;
  lockout: string | null;
}

async function readRaw(key: string): Promise<string | null> {
  return SecureStore.getItemAsync(key);
}

async function writeRaw(key: string, value: string | null): Promise<void> {
  if (value === null) await SecureStore.deleteItemAsync(key);
  else await SecureStore.setItemAsync(key, value);
}

async function captureProvisionSnapshot(): Promise<ProvisionSnapshot> {
  return {
    pin: await readRaw(PIN_KEY),
    employerKey: await readRaw(EMPLOYER_KEY_STORE_KEY),
    nonces: await readRaw(USED_NONCES_KEY),
    lockout: await readRaw(LOCKOUT_KEY),
  };
}

async function restoreProvisionSnapshot(snapshot: ProvisionSnapshot): Promise<void> {
  await writeRaw(PIN_KEY, snapshot.pin);
  await writeRaw(EMPLOYER_KEY_STORE_KEY, snapshot.employerKey);
  await writeRaw(USED_NONCES_KEY, snapshot.nonces);
  await writeRaw(LOCKOUT_KEY, snapshot.lockout);
}

function storedFromPayload(payload: PinProvisionPayload, nowMs: number): StoredPin {
  if (payload.v === 2) {
    return { salt: payload.salt, hash: payload.hash, kdf: "scrypt", provision: "EMPLOYER", provisionNonce: payload.nonce, provisionedAtMs: nowMs };
  }
  return {
    salt: payload.salt,
    hash: payload.hash,
    iterations: payload.iterations,
    provision: "EMPLOYER",
    provisionNonce: payload.nonce,
    provisionedAtMs: nowMs,
  };
}

/** PIN de administración: 4 a 8 dígitos. */
export function isAdminPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_MIN_LENGTH},${PIN_MAX_LENGTH}}$`).test(pin);
}

export const SecurityService = {
  minLength: PIN_MIN_LENGTH,
  maxLength: PIN_MAX_LENGTH,

  async hasPin(): Promise<boolean> {
    try {
      return !!(await SecureStore.getItemAsync(PIN_KEY));
    } catch {
      return false;
    }
  },

  /** Quién dejó el verificador que hay ahora. Sin PIN: UNSET. Registros viejos: LOCAL. */
  /** true si este teléfono ya fijó la clave pública del empleador. */
  async hasPinnedEmployerKey(): Promise<boolean> {
    try {
      return (await readPinnedKey()) !== null;
    } catch {
      return false;
    }
  },

  async pinOrigin(): Promise<PinOrigin> {
    try {
      const stored = await readStoredPin();
      if (!stored) return "UNSET";
      return stored.provision === "EMPLOYER" ? "EMPLOYER" : "LOCAL";
    } catch {
      return "UNSET";
    }
  },

  /**
   * Fija el PIN en el teléfono. Permitido si aún no existe o si la zona admin
   * está desbloqueada. El resultado queda como PIN local: no lo aprovisionó
   * el empleador.
   */
  async setPin(pin: string): Promise<{ ok: true } | { ok: false; code: "PIN_INVALID" | "ADMIN_LOCKED" | "ERROR" }> {
    const clean = (pin ?? "").trim();
    if (!isAdminPin(clean)) return { ok: false, code: "PIN_INVALID" };
    if ((await SecurityService.hasPin()) && !SecurityService.isUnlocked()) return { ok: false, code: "ADMIN_LOCKED" };
    try {
      const stored = freshScryptRecord(clean, Crypto.getRandomBytes(16), { provision: "LOCAL" });
      await SecureStore.setItemAsync(PIN_KEY, JSON.stringify(stored));
      await SecureStore.deleteItemAsync(LOCKOUT_KEY);
      StoreActions.adminUpdated({ hasPin: true, pinOrigin: "LOCAL" });
      LoggingService.audit({ sessionId: null, actionType: "ADMIN_PIN_SET", details: "PIN de administración configurado" }).catch(() => {});
      return { ok: true };
    } catch (error) {
      LoggingService.log("ROJO", "SEGURIDAD", "ERROR", "Fallo guardando PIN", serializeError(error));
      return { ok: false, code: "ERROR" };
    }
  },

  /**
   * Instala el verificador que trae el código del empleador. Un nonce solo
   * vale una vez. Si ya hay un PIN de empleador y la zona está cerrada, se
   * rechaza. Un PIN local sí se puede sustituir: todavía no lo había
   * aprovisionado el empleador. La primera clave no se fija a ciegas: hace
   * falta la huella tecleada o la clave anclada en el build. Un rechazo de
   * huella no gasta el nonce.
   */
  async provisionFromCode(
    code: string,
    fingerprint?: string,
  ): Promise<
    | {
        ok: true;
        nonce: string;
        expiresAtMs: number;
        keyId: string;
        previousKeyId: string | null;
        keyAction: EmployerKeyAction;
        keyAuth: EmployerKeyAuth | null;
        snapshot: ProvisionSnapshot;
      }
    | {
        ok: false;
        code:
          | "CODE_INVALID"
          | "CODE_EXPIRED"
          | "CODE_USED"
          | "ALREADY_PROVISIONED"
          | "EMPLOYER_KEY_MISMATCH"
          | "FINGERPRINT_REQUIRED"
          | "FINGERPRINT_MISMATCH"
          | "ANCHOR_MISMATCH"
          | "ERROR";
      }
  > {
    const assessed = assessProvisionCode(code, TimeAuthorityService.now());
    if (!assessed.ok) return { ok: false, code: assessed.code === "PIN_INVALID" ? "CODE_INVALID" : assessed.code };
    try {
      const keyId = employerKeyId(assessed.payload.pub);
      const pinned = await readPinnedKey();
      let keyAction: EmployerKeyAction = "UNCHANGED";
      let keyAuth: EmployerKeyAuth | null = null;
      let previousKeyId: string | null = null;
      if (!pinned) {
        const anchor = employerKeyAnchorPub();
        if (anchor) {
          if (!timingSafeEqual(anchor, assessed.payload.pub)) return { ok: false, code: "ANCHOR_MISMATCH" };
          keyAuth = "ANCHOR";
        } else {
          const given = (fingerprint ?? "").trim();
          if (!given) return { ok: false, code: "FINGERPRINT_REQUIRED" };
          if (!fingerprintsMatch(given, employerKeyFingerprint(assessed.payload.pub))) return { ok: false, code: "FINGERPRINT_MISMATCH" };
          keyAuth = "FINGERPRINT";
        }
        keyAction = "PINNED";
      } else if (!timingSafeEqual(pinned.pub, assessed.payload.pub)) {
        if (!SecurityService.isUnlocked()) return { ok: false, code: "EMPLOYER_KEY_MISMATCH" };
        keyAction = "REPINNED";
        previousKeyId = pinned.keyId;
      }
      const used = await readUsedNonces();
      if (used.includes(assessed.payload.nonce)) return { ok: false, code: "CODE_USED" };
      const current = await readStoredPin();
      if (current?.provision === "EMPLOYER" && !SecurityService.isUnlocked()) return { ok: false, code: "ALREADY_PROVISIONED" };
      const nowMs = TimeAuthorityService.now();
      const snapshot = await captureProvisionSnapshot();
      try {
        await SecureStore.setItemAsync(PIN_KEY, JSON.stringify(storedFromPayload(assessed.payload, nowMs)));
        if (keyAction !== "UNCHANGED") {
          await SecureStore.setItemAsync(EMPLOYER_KEY_STORE_KEY, JSON.stringify({ pub: assessed.payload.pub, keyId } satisfies PinnedEmployerKey));
        }
        await SecureStore.setItemAsync(USED_NONCES_KEY, JSON.stringify([...used, assessed.payload.nonce]));
        await SecureStore.deleteItemAsync(LOCKOUT_KEY);
      } catch (error) {
        await restoreProvisionSnapshot(snapshot).catch(() => undefined);
        throw error;
      }
      return { ok: true, nonce: assessed.payload.nonce, expiresAtMs: assessed.payload.exp, keyId, previousKeyId, keyAction, keyAuth, snapshot };
    } catch (error) {
      LoggingService.log("ROJO", "SEGURIDAD", "ERROR", "Fallo aprovisionando PIN", serializeError(error));
      return { ok: false, code: "ERROR" };
    }
  },

  /** Deshace beginProvision si el asiento de ledger no se pudo escribir. */
  async rollbackProvision(snapshot: ProvisionSnapshot): Promise<void> {
    await restoreProvisionSnapshot(snapshot);
  },

  /** El PIN y el ledger ya coinciden: ahora sí se publica en la UI. */
  publishProvisionedPin(): void {
    StoreActions.adminUpdated({ hasPin: true, pinOrigin: "EMPLOYER", isUnlocked: false, unlockedUntilMs: null, status: "IDLE" });
    LoggingService.audit({ sessionId: null, actionType: "ADMIN_PIN_SET", details: "PIN aprovisionado por el empleador" }).catch(() => {});
  },

  /** Valida el PIN y, si procede, abre la sesión admin con caducidad. */
  async unlock(candidate: string): Promise<UnlockResult> {
    StoreActions.adminUpdated({ status: "validating" });
    await delay(PIN_ATTEMPT_DELAY_MS);
    try {
      const raw = await SecureStore.getItemAsync(PIN_KEY);
      if (!raw) {
        StoreActions.adminUpdated({ status: "IDLE", hasPin: false });
        return { ok: false, code: "PIN_NOT_SET" };
      }
      const now = TimeAuthorityService.now();
      const lock = await readLockout();
      if (lock.lockedUntilMs && lock.lockedUntilMs > now) {
        StoreActions.adminUpdated({ status: "locked_out", lockedUntilMs: lock.lockedUntilMs });
        return { ok: false, code: "ADMIN_LOCKOUT", lockedUntilMs: lock.lockedUntilMs };
      }
      const stored = JSON.parse(raw) as StoredPin;
      const clean = (candidate ?? "").trim();
      const scryptRecord = stored.kdf === "scrypt" || stored.hash.startsWith("scrypt1$");
      const matches = scryptRecord
        ? scryptPinMatches(clean, stored.hash, scryptParams())
        : timingSafeEqual(derivePinHash(clean, stored.salt, stored.iterations ?? PIN_HASH_ITERATIONS), stored.hash);
      if (!matches && !scryptRecord) {
        // Iguala el coste de un fallo legado con scrypt, para no delatar el formato por el tiempo.
        scryptPinHash(clean, Crypto.getRandomBytes(16), scryptParams());
      }
      if (matches) {
        if (!scryptRecord) {
          try {
            const migrated = freshScryptRecord(clean, Crypto.getRandomBytes(16), {
              provision: stored.provision,
              provisionNonce: stored.provisionNonce,
              provisionedAtMs: stored.provisionedAtMs,
            });
            await SecureStore.setItemAsync(PIN_KEY, JSON.stringify(migrated));
          } catch (error) {
            LoggingService.log("NARANJA", "SEGURIDAD", "WARN", "PIN legado verificado sin poder migrar a scrypt", serializeError(error));
          }
        }
        await SecureStore.deleteItemAsync(LOCKOUT_KEY);
        const until = now + ADMIN_UNLOCK_TTL_MS;
        StoreActions.adminUpdated({ status: "granted", isUnlocked: true, unlockedUntilMs: until, lockedUntilMs: null });
        return { ok: true, unlockedUntilMs: until };
      }
      const failures = lock.failures + 1;
      const duration = lockDurationFor(failures);
      const lockedUntilMs = duration > 0 ? now + duration : null;
      await SecureStore.setItemAsync(LOCKOUT_KEY, JSON.stringify({ failures, lockedUntilMs } satisfies LockoutState));
      LoggingService.audit({ sessionId: null, actionType: "ADMIN_DENIED", details: `Intento fallido #${failures}` }).catch(() => {});
      StoreActions.adminUpdated({ status: lockedUntilMs ? "locked_out" : "denied", lockedUntilMs });
      return lockedUntilMs ? { ok: false, code: "ADMIN_LOCKOUT", lockedUntilMs } : { ok: false, code: "ADMIN_DENIED" };
    } catch (error) {
      // Fail-secure.
      LoggingService.log("ROJO", "SEGURIDAD", "ERROR", "Fallo criptográfico validando PIN", serializeError(error));
      StoreActions.adminUpdated({ status: "error", isUnlocked: false, unlockedUntilMs: null });
      return { ok: false, code: "ERROR" };
    }
  },

  lock(): void {
    StoreActions.adminUpdated({ isUnlocked: false, unlockedUntilMs: null, status: "IDLE" });
  },

  /** Desbloqueo vigente (caduca por TTL). */
  isUnlocked(): boolean {
    const a = Store.getState().admin;
    const ok = a.isUnlocked && !!a.unlockedUntilMs && a.unlockedUntilMs > TimeAuthorityService.now();
    if (a.isUnlocked && !ok) SecurityService.lock();
    return ok;
  },
};
