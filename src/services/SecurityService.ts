import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import { timeAuthorityService } from "./TimeAuthorityService";

/**
 * ============================================================================
 * SecurityService — Propuesta 4.8 (reemplaza PIN demo y securityAdapter)
 * ----------------------------------------------------------------------------
 * Reemplaza por completo `src/core/runtime/securityAdapter.ts`, que validaba
 * contra un hash SHA-256 fijo de "1234" embebido en el binario ("PIN 1234 o
 * hash de demostración en un binario de producción" — Sección 10, lo que no
 * debe implementarse). Este servicio:
 *   - Nunca guarda el PIN/contraseña en texto plano.
 *   - Rechaza explícitamente credenciales triviales (1234, 0000, etc.).
 *   - Aplica retardo anti-fuerza bruta con backoff exponencial y bloqueo
 *     progresivo tras varios intentos fallidos.
 *   - Falla en modo seguro (fail-secure): cualquier error de criptografía o
 *     de almacenamiento se traduce en denegación, nunca en bypass.
 *   - El estado "desbloqueado" es de sesión de UI (en memoria, no persistido)
 *     — "El estado 'desbloqueado' es de sesión de UI, no del adaptador."
 * ============================================================================
 */

const SALT_KEY = "dualtracker.security.salt";
const HASH_KEY = "dualtracker.security.hash";
const ATTEMPTS_KEY = "dualtracker.security.failedAttempts";
const LAST_ATTEMPT_KEY = "dualtracker.security.lastAttemptAtMs";

/** Tras este número de fallos consecutivos, la credencial queda bloqueada. */
export const MAX_FAILED_ATTEMPTS = 5;

/** Techo del backoff exponencial: nunca esperamos más de 5 minutos. */
export const MAX_BACKOFF_MS = 5 * 60 * 1000;

/** Credenciales triviales explícitamente prohibidas en producción. */
export const TRIVIAL_CREDENTIALS = new Set<string>([
  "1234",
  "0000",
  "1111",
  "2222",
  "3333",
  "4444",
  "5555",
  "6666",
  "7777",
  "8888",
  "9999",
  "0123",
  "1212",
  "0001",
  "123456",
  "111111",
  "password",
  "admin",
]);

/** Resultado de una validación de credencial administrativa. */
export interface AdminValidationResult {
  ok: boolean;
  /** Presente cuando la validación fue rechazada por backoff/bloqueo activo. */
  retryAfterMs?: number;
  /** Presente cuando el bloqueo progresivo ya se alcanzó (>= MAX_FAILED_ATTEMPTS). */
  lockedOut?: boolean;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function isTrivialCredential(candidate: string): boolean {
  const trimmed = candidate.trim();
  if (trimmed.length === 0) return true;
  if (TRIVIAL_CREDENTIALS.has(trimmed.toLowerCase())) return true;

  // Rechaza cualquier secuencia de un solo dígito repetido (ej. "77777").
  if (/^(\d)\1+$/.test(trimmed)) return true;

  return false;
}

async function hashWithSalt(saltHex: string, value: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${saltHex}:${value.trim()}`,
  );
}

class SecurityService {
  /**
   * Estado de "desbloqueado" de la UI. Vive únicamente en memoria del
   * proceso: al matar/reabrir la app, siempre vuelve a false. No se
   * persiste en SecureStore ni en SQLite.
   */
  private unlocked = false;

  /**
   * Define (o reemplaza) la credencial administrativa. Genera una sal
   * aleatoria de 16 bytes, calcula SHA-256(sal + credencial) y guarda solo
   * sal + hash en SecureStore. Rechaza credenciales triviales.
   */
  async setAdminCredential(pinOrPassword: string): Promise<void> {
    if (isTrivialCredential(pinOrPassword)) {
      throw new Error(
        "Credencial administrativa rechazada: es un valor trivial " +
          "(ej. '1234', '0000') no permitido en producción.",
      );
    }

    const saltBytes = await Crypto.getRandomBytesAsync(16);
    const saltHex = bytesToHex(saltBytes);
    const hash = await hashWithSalt(saltHex, pinOrPassword);

    await SecureStore.setItemAsync(SALT_KEY, saltHex);
    await SecureStore.setItemAsync(HASH_KEY, hash);

    // Nueva credencial: reinicia contadores de fuerza bruta.
    await SecureStore.deleteItemAsync(ATTEMPTS_KEY);
    await SecureStore.deleteItemAsync(LAST_ATTEMPT_KEY);
  }

  /**
   * Indica si ya existe una credencial administrativa configurada.
   */
  async hasAdminCredential(): Promise<boolean> {
    try {
      const hash = await SecureStore.getItemAsync(HASH_KEY);
      return typeof hash === "string" && hash.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * true si el número de fallos consecutivos alcanzó MAX_FAILED_ATTEMPTS.
   * El bloqueo se libera automáticamente una vez que setAdminCredential
   * vuelve a ejecutarse (nueva credencial) — nunca "por las buenas" desde
   * dentro de validateAdminCredential mientras siga fallando.
   */
  async isLockedOut(): Promise<boolean> {
    try {
      const attempts = await this.getFailedAttempts();
      return attempts >= MAX_FAILED_ATTEMPTS;
    } catch {
      // Fail-secure: si no podemos leer el contador, asumimos bloqueo.
      return true;
    }
  }

  /**
   * Valida una credencial candidata contra el hash almacenado.
   * Fail-secure: cualquier excepción de criptografía o almacenamiento
   * devuelve { ok: false }, nunca deja pasar por error.
   */
  async validateAdminCredential(candidate: string): Promise<AdminValidationResult> {
    try {
      const lockedOut = await this.isLockedOut();
      if (lockedOut) {
        return { ok: false, lockedOut: true };
      }

      const retryAfterMs = await this.computeBackoffRemainingMs();
      if (retryAfterMs > 0) {
        return { ok: false, retryAfterMs };
      }

      const saltHex = await SecureStore.getItemAsync(SALT_KEY);
      const storedHash = await SecureStore.getItemAsync(HASH_KEY);

      if (!saltHex || !storedHash) {
        // No hay credencial configurada: fail-secure, nunca "true por defecto".
        await this.registerFailedAttempt();
        return { ok: false };
      }

      const candidateHash = await hashWithSalt(saltHex, candidate);

      if (candidateHash === storedHash) {
        await this.resetFailedAttempts();
        return { ok: true };
      }

      await this.registerFailedAttempt();
      const lockedOutNow = await this.isLockedOut();
      return { ok: false, lockedOut: lockedOutNow };
    } catch (error) {
      // Fail-secure ante error criptográfico o de almacenamiento.
      console.error("SecurityService: fallo de validación, denegando.", error);
      return { ok: false };
    }
  }

  /** Estado de sesión de UI: true si el usuario ya validó su credencial. */
  isUnlocked(): boolean {
    return this.unlocked;
  }

  /** Marca la sesión de UI como desbloqueada tras una validación exitosa. */
  unlock(): void {
    this.unlocked = true;
  }

  /** Cierra la sesión de UI (vuelve a exigir credencial). */
  lock(): void {
    this.unlocked = false;
  }

  private async getFailedAttempts(): Promise<number> {
    const raw = await SecureStore.getItemAsync(ATTEMPTS_KEY);
    const parsed = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private async getLastAttemptAtMs(): Promise<number | null> {
    const raw = await SecureStore.getItemAsync(LAST_ATTEMPT_KEY);
    if (!raw) return null;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private async registerFailedAttempt(): Promise<void> {
    const attempts = (await this.getFailedAttempts()) + 1;
    await SecureStore.setItemAsync(ATTEMPTS_KEY, String(attempts));
    await SecureStore.setItemAsync(LAST_ATTEMPT_KEY, String(timeAuthorityService.now()));
  }

  private async resetFailedAttempts(): Promise<void> {
    await SecureStore.deleteItemAsync(ATTEMPTS_KEY);
    await SecureStore.deleteItemAsync(LAST_ATTEMPT_KEY);
  }

  /**
   * Backoff exponencial: 2^attempts segundos, con techo MAX_BACKOFF_MS.
   * Devuelve cuántos ms faltan (0 si ya se puede reintentar).
   */
  private async computeBackoffRemainingMs(): Promise<number> {
    const attempts = await this.getFailedAttempts();
    if (attempts <= 0) return 0;

    const lastAttemptAtMs = await this.getLastAttemptAtMs();
    if (lastAttemptAtMs === null) return 0;

    const backoffMs = Math.min(Math.pow(2, attempts) * 1000, MAX_BACKOFF_MS);
    const elapsedMs = timeAuthorityService.now() - lastAttemptAtMs;
    const remainingMs = backoffMs - elapsedMs;

    return remainingMs > 0 ? remainingMs : 0;
  }
}

export const securityService = new SecurityService();
