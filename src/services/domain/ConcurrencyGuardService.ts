/**
 * ConcurrencyGuardService — Dominio (Propuesta Técnica §5.12, nuevo)
 * ============================================================================
 * El microcopy heredado ya mencionaba "Mutex failed"; aquí existe como servicio.
 *  - Candado por clave (sessionId o "device") para check-in, check-out, patch
 *    manual y tarea de watchdog.
 *  - Rechazo explícito si dos orígenes (notificación + modal + geocerca)
 *    intentan operar a la vez: el segundo recibe MUTEX_BUSY.
 *
 * Dos niveles:
 *  1) En memoria (mismo runtime JS).
 *  2) Lease en SQLite (app_kv) con caducidad, para runtimes JS distintos
 *     (tarea headless de Android vs. app en primer plano).
 * Sustituye al `isTaskRunningMutex` suelto de BackgroundTasks.ts (GEOTrack).
 */
import type { IntentOrigin } from "../../core/contracts";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { PersistenceService } from "../persistence/PersistenceService";
import { KV_KEYS } from "../persistence/schema";

const LEASE_TTL_MS = 30 * 1000;
const RUNTIME_ID = `rt-${Math.random().toString(36).slice(2, 10)}`;

interface Lease {
  owner: string;
  origin: IntentOrigin;
  label: string;
  expiresAtMs: number;
}

const held = new Map<string, Lease>();

export class MutexBusyError extends Error {
  constructor(
    public readonly key: string,
    public readonly heldBy: IntentOrigin,
  ) {
    super(`MUTEX_BUSY:${key}:${heldBy}`);
  }
}

async function acquireLease(key: string, origin: IntentOrigin, label: string): Promise<void> {
  const kvKey = `${KV_KEYS.MUTEX_PREFIX}${key}`;
  await PersistenceService.transaction(async (db) => {
    const row = await db.getFirstAsync<{ value_json: string }>(`SELECT value_json FROM app_kv WHERE key = ?`, [kvKey]);
    const now = TimeAuthorityService.now();
    if (row) {
      const lease = JSON.parse(row.value_json) as Lease;
      if (lease.owner !== RUNTIME_ID && lease.expiresAtMs > now) throw new MutexBusyError(key, lease.origin);
    }
    const lease: Lease = { owner: RUNTIME_ID, origin, label, expiresAtMs: now + LEASE_TTL_MS };
    await PersistenceService.setKv(kvKey, lease, db);
  });
}

async function releaseLease(key: string): Promise<void> {
  try {
    await PersistenceService.deleteKv(`${KV_KEYS.MUTEX_PREFIX}${key}`);
  } catch {
    // El lease caduca solo.
  }
}

export const ConcurrencyGuardService = {
  /**
   * Ejecuta `work` con el candado `key`. Si otro origen lo tiene, lanza
   * MutexBusyError (rechazo explícito, nunca espera silenciosa).
   */
  async withLock<T>(key: string, origin: IntentOrigin, label: string, work: () => Promise<T>): Promise<T> {
    const current = held.get(key);
    if (current && current.expiresAtMs > TimeAuthorityService.now()) {
      throw new MutexBusyError(key, current.origin);
    }
    const lease: Lease = { owner: RUNTIME_ID, origin, label, expiresAtMs: TimeAuthorityService.now() + LEASE_TTL_MS };
    held.set(key, lease);
    let acquired = false;
    try {
      await acquireLease(key, origin, label);
      acquired = true;
      return await work();
    } finally {
      held.delete(key);
      // Nunca liberar un lease ajeno (si acquireLease lanzó MUTEX_BUSY).
      if (acquired) await releaseLease(key);
    }
  },

  isHeld(key: string): boolean {
    const l = held.get(key);
    return !!l && l.expiresAtMs > TimeAuthorityService.now();
  },
};
