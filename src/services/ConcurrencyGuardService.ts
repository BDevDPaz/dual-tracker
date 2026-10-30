import { timeAuthorityService } from "./TimeAuthorityService";

/**
 * ============================================================================
 * ConcurrencyGuardService — Propuesta 5.12 (nuevo)
 * ----------------------------------------------------------------------------
 * "El microcopy actual ya menciona 'Mutex failed'. Debe existir como
 * servicio, no como cadena de error." Candado en memoria por sessionId, usado
 * por SessionEngineService para serializar check-in, check-out, patch manual
 * y la tarea de watchdog. Si dos orígenes (notificación + modal + geocerca)
 * intentan mutar la misma sesión a la vez, el segundo es rechazado de forma
 * explícita en vez de correr una condición de carrera silenciosa.
 * ============================================================================
 */

/** Auto-liberación de un candado huérfano (holder murió/crasheó) tras 60s. */
export const STALE_LOCK_TIMEOUT_MS = 60000;

interface LockEntry {
  locked: boolean;
  holder: string;
  acquiredAtMs: number;
}

/** Error tipado lanzado cuando dos orígenes compiten por el mismo sessionId. */
export class ConcurrencyRejectedError extends Error {
  readonly reasonCode = "MUTEX_REJECTED" as const;
  readonly sessionId: string;
  readonly heldBy: string;

  constructor(sessionId: string, heldBy: string) {
    super(`ConcurrencyGuard: sessionId=${sessionId} ya está bloqueado por "${heldBy}".`);
    this.name = "ConcurrencyRejectedError";
    this.sessionId = sessionId;
    this.heldBy = heldBy;
  }
}

class ConcurrencyGuardService {
  private readonly locks = new Map<string, LockEntry>();

  /**
   * Libera candados que hayan excedido STALE_LOCK_TIMEOUT_MS. Se invoca de
   * forma perezosa en cada acquire/isLocked para no requerir un timer
   * separado en segundo plano.
   */
  private reapStaleLock(sessionId: string): void {
    const entry = this.locks.get(sessionId);

    if (!entry || !entry.locked) {
      return;
    }

    const elapsedMs = timeAuthorityService.now() - entry.acquiredAtMs;

    if (elapsedMs > STALE_LOCK_TIMEOUT_MS) {
      this.locks.delete(sessionId);
    }
  }

  /**
   * Intenta adquirir el candado de `sessionId` para `holder`. Retorna true
   * si se adquirió (o si `holder` ya lo tenía — reentrante para el mismo
   * holder), false si otro holder lo tiene vigente.
   */
  acquire(sessionId: string, holder: string): boolean {
    this.reapStaleLock(sessionId);

    const existing = this.locks.get(sessionId);

    if (existing && existing.locked) {
      if (existing.holder === holder) {
        return true;
      }
      return false;
    }

    this.locks.set(sessionId, {
      locked: true,
      holder,
      acquiredAtMs: timeAuthorityService.now(),
    });

    return true;
  }

  /** Libera el candado de `sessionId` solo si `holder` es quien lo sostiene. */
  release(sessionId: string, holder: string): void {
    const existing = this.locks.get(sessionId);

    if (!existing || !existing.locked) {
      return;
    }

    if (existing.holder !== holder) {
      return;
    }

    this.locks.delete(sessionId);
  }

  /** true si `sessionId` está actualmente bloqueado por cualquier holder. */
  isLocked(sessionId: string): boolean {
    this.reapStaleLock(sessionId);

    const existing = this.locks.get(sessionId);
    return Boolean(existing && existing.locked);
  }

  /**
   * Ejecuta `fn` bajo el candado exclusivo de `sessionId`. Lanza
   * ConcurrencyRejectedError si otro holder ya sostiene el candado. Libera
   * el candado al finalizar (éxito o error) siempre que este holder lo haya
   * adquirido en esta llamada.
   */
  async withLock<T>(sessionId: string, holder: string, fn: () => Promise<T>): Promise<T> {
    this.reapStaleLock(sessionId);

    const existing = this.locks.get(sessionId);

    if (existing && existing.locked && existing.holder !== holder) {
      throw new ConcurrencyRejectedError(sessionId, existing.holder);
    }

    const acquired = this.acquire(sessionId, holder);

    if (!acquired) {
      const currentHolder = this.locks.get(sessionId)?.holder ?? "unknown";
      throw new ConcurrencyRejectedError(sessionId, currentHolder);
    }

    try {
      return await fn();
    } finally {
      this.release(sessionId, holder);
    }
  }
}

/** Instancia única — un solo mapa de candados por proceso. */
export const concurrencyGuardService = new ConcurrencyGuardService();
