/**
 * SecurityService — Runtime (Propuesta Técnica §4.8)
 * Reemplaza el PIN demo y el securityAdapter aislado.
 * ============================================================================
 *  - PIN/clave de administración con HASH EN DISPOSITIVO (SHA-256 salado e
 *    iterado, guardado en SecureStore/Keystore).
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
import { ADMIN_UNLOCK_TTL_MS, PIN_ATTEMPT_DELAY_MS, PIN_HASH_ITERATIONS, PIN_LOCKOUT_STEPS, PIN_MIN_LENGTH } from "../../config/provisional";
import { Store, StoreActions } from "../../core/store";
import { serializeError } from "../../utils/serializeError";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { LoggingService } from "../persistence/LoggingService";
import { derivePinHash } from "./pinHash";
import { assessProvisionCode } from "./pinProvision";

const PIN_KEY = "dualtracker.admin.pin.v1";
const LOCKOUT_KEY = "dualtracker.admin.lockout.v1";
const USED_NONCES_KEY = "dualtracker.admin.provision.used.v1";

export type PinOrigin = "UNSET" | "LOCAL" | "EMPLOYER";

interface StoredPin {
  salt: string;
  hash: string;
  iterations: number;
  /** Ausente en registros anteriores a la tanda 2: se leen como LOCAL. */
  provision?: "LOCAL" | "EMPLOYER";
  provisionNonce?: string;
  provisionedAtMs?: number;
}

interface LockoutState {
  failures: number;
  lockedUntilMs: number | null;
}

export type UnlockResult =
  | { ok: true; unlockedUntilMs: number }
  | { ok: false; code: "PIN_NOT_SET" | "ADMIN_DENIED" | "ADMIN_LOCKOUT" | "ERROR"; lockedUntilMs?: number | null };

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Comparación en tiempo constante. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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

export const SecurityService = {
  minLength: PIN_MIN_LENGTH,

  async hasPin(): Promise<boolean> {
    try {
      return !!(await SecureStore.getItemAsync(PIN_KEY));
    } catch {
      return false;
    }
  },

  /** Quién dejó el verificador que hay ahora. Sin PIN: UNSET. Registros viejos: LOCAL. */
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
    if (clean.length < PIN_MIN_LENGTH) return { ok: false, code: "PIN_INVALID" };
    if ((await SecurityService.hasPin()) && !SecurityService.isUnlocked()) return { ok: false, code: "ADMIN_LOCKED" };
    try {
      const salt = toHex(Crypto.getRandomBytes(16));
      const hash = derivePinHash(clean, salt, PIN_HASH_ITERATIONS);
      const stored: StoredPin = { salt, hash, iterations: PIN_HASH_ITERATIONS, provision: "LOCAL" };
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
   * aprovisionado el empleador.
   */
  async provisionFromCode(
    code: string,
  ): Promise<
    | { ok: true; nonce: string; expiresAtMs: number }
    | { ok: false; code: "CODE_INVALID" | "CODE_EXPIRED" | "CODE_USED" | "ALREADY_PROVISIONED" | "ERROR" }
  > {
    const assessed = assessProvisionCode(code, TimeAuthorityService.now());
    if (!assessed.ok) return { ok: false, code: assessed.code === "PIN_INVALID" ? "CODE_INVALID" : assessed.code };
    try {
      const used = await readUsedNonces();
      if (used.includes(assessed.payload.nonce)) return { ok: false, code: "CODE_USED" };
      const current = await readStoredPin();
      if (current?.provision === "EMPLOYER" && !SecurityService.isUnlocked()) return { ok: false, code: "ALREADY_PROVISIONED" };
      const stored: StoredPin = {
        salt: assessed.payload.salt,
        hash: assessed.payload.hash,
        iterations: assessed.payload.iterations,
        provision: "EMPLOYER",
        provisionNonce: assessed.payload.nonce,
        provisionedAtMs: TimeAuthorityService.now(),
      };
      await SecureStore.setItemAsync(PIN_KEY, JSON.stringify(stored));
      await SecureStore.setItemAsync(USED_NONCES_KEY, JSON.stringify([...used, assessed.payload.nonce]));
      await SecureStore.deleteItemAsync(LOCKOUT_KEY);
      StoreActions.adminUpdated({ hasPin: true, pinOrigin: "EMPLOYER", isUnlocked: false, unlockedUntilMs: null, status: "IDLE" });
      LoggingService.audit({ sessionId: null, actionType: "ADMIN_PIN_SET", details: "PIN aprovisionado por el empleador" }).catch(() => {});
      return { ok: true, nonce: assessed.payload.nonce, expiresAtMs: assessed.payload.exp };
    } catch (error) {
      LoggingService.log("ROJO", "SEGURIDAD", "ERROR", "Fallo aprovisionando PIN", serializeError(error));
      return { ok: false, code: "ERROR" };
    }
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
      const hash = derivePinHash((candidate ?? "").trim(), stored.salt, stored.iterations);
      if (safeEqual(hash, stored.hash)) {
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
