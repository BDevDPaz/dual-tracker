import type { AuditLogRecord, SystemLogRecord } from "../core/contracts";
import { timeAuthorityService } from "./TimeAuthorityService";
import { persistenceService } from "./PersistenceService";

/**
 * ============================================================================
 * LoggingService — Propuesta 4.9 (fusiona logger.ts + loggingAdapter.ts +
 * audit_logs)
 * ----------------------------------------------------------------------------
 * "Dos streams explícitos: SYSTEM (diagnóstico operativo) y AUDIT (hechos
 * con efecto de nómina o integridad). Cola de arranque si SQLite aún no está
 * lista."
 *
 * Este servicio es el punto único de escritura de logs de dominio y
 * reemplaza `src/utils/logger.ts` y `src/core/runtime/loggingAdapter.ts`
 * (ambos hacían lo mismo dos veces: cola en memoria + INSERT directo). No
 * llama a Expo/UI directamente: si la UI necesita traducir un log a
 * feedback visible, ese puente vive en FeedbackService (Propuesta 4.7), no
 * aquí.
 *
 * ----------------------------------------------------------------------------
 * SEAM DE INTEGRACIÓN (ver notes/wave5.md):
 * PersistenceService (wave 1) todavía no expone `appendAuditLog` /
 * `appendSystemLog`. Este servicio los invoca con feature-detection (`in`)
 * para no romper la compilación mientras el ensamblador reconcilia ambas
 * ondas: si el método no existe todavía, la entrada se conserva en la cola
 * de arranque (no se pierde, y se reintenta en el próximo `markReady()` /
 * flush) y se registra una advertencia por consola en modo DEV.
 * ----------------------------------------------------------------------------
 * ============================================================================
 */

/** Persistencia mínima que LoggingService necesita de PersistenceService. */
interface LogPersistenceCapable {
  appendAuditLog?(entry: AuditLogRecord): Promise<void>;
  appendSystemLog?(entry: SystemLogRecord): Promise<void>;
}

function nextId(): number {
  // Los ids reales los asigna SQLite (AUTOINCREMENT); mientras la entrada
  // vive solo en la cola en memoria, un id negativo la distingue como
  // "aún no persistida" sin colisionar con ids de DB (siempre positivos).
  return -Math.floor(timeAuthorityService.now());
}

function toSystemLogRecord(entry: Partial<SystemLogRecord>): SystemLogRecord {
  const nowMs = timeAuthorityService.now();
  return {
    id: entry.id ?? nextId(),
    timestampMs: entry.timestampMs ?? nowMs,
    timestampIso: entry.timestampIso ?? timeAuthorityService.nowIso(),
    color: entry.color ?? "AZUL",
    category: entry.category ?? "ESTADO_SISTEMA",
    severity: entry.severity ?? "INFO",
    message: entry.message ?? "",
    metadataJson: entry.metadataJson ?? null,
    user_id: entry.user_id ?? null,
    session_id: entry.session_id ?? null,
    from_state: entry.from_state ?? null,
    to_state: entry.to_state ?? null,
    event_type: entry.event_type ?? null,
    location: entry.location ?? null,
    device_state: entry.device_state ?? null,
    trigger_source: entry.trigger_source ?? null,
    reason: entry.reason ?? null,
    signature: entry.signature ?? null,
    event_state: entry.event_state ?? null,
    sync_status: entry.sync_status ?? "PENDING",
  };
}

function toAuditLogRecord(entry: Partial<AuditLogRecord>): AuditLogRecord {
  const nowMs = timeAuthorityService.now();
  return {
    id: entry.id ?? nextId(),
    sessionId: entry.sessionId ?? null,
    actionType: entry.actionType ?? "UNKNOWN",
    details: entry.details ?? "",
    timestampMs: entry.timestampMs ?? nowMs,
  };
}

class LoggingService {
  private ready = false;

  private readonly systemQueue: SystemLogRecord[] = [];
  private readonly auditQueue: AuditLogRecord[] = [];

  /** true una vez que SQLite/PersistenceService están listos para recibir escrituras. */
  isReady(): boolean {
    return this.ready;
  }

  /**
   * Marca el servicio como listo para persistir y vacía la cola de
   * arranque acumulada mientras la DB no estaba disponible.
   */
  markReady(): void {
    this.ready = true;
    void this.flush();
  }

  /** Stream SYSTEM: diagnóstico operativo (no tiene efecto de nómina/integridad). */
  logSystem(entry: Partial<SystemLogRecord>): void {
    const record = toSystemLogRecord(entry);

    if (__DEV__) {
      const c = console;
      const line = `[${record.timestampIso}] [SYSTEM:${record.category}] ${record.message}`;
      if (record.severity === "ERROR") c["error"](line);
      else if (record.severity === "WARN") c["warn"](line);
      else c["log"](line);
    }

    const capable = persistenceService as unknown as LogPersistenceCapable;

    if (!this.ready || typeof capable.appendSystemLog !== "function") {
      this.systemQueue.push(record);
      return;
    }

    void this.persistSystem(record);
  }

  /** Stream AUDIT: hechos con efecto de nómina o de integridad. */
  logAudit(entry: Partial<AuditLogRecord>): void {
    const record = toAuditLogRecord(entry);
    const capable = persistenceService as unknown as LogPersistenceCapable;

    if (!this.ready || typeof capable.appendAuditLog !== "function") {
      this.auditQueue.push(record);
      return;
    }

    void this.persistAudit(record);
  }

  private async flush(): Promise<void> {
    if (!this.ready) return;

    const capable = persistenceService as unknown as LogPersistenceCapable;

    if (typeof capable.appendSystemLog === "function") {
      while (this.systemQueue.length > 0) {
        const entry = this.systemQueue.shift();
        if (entry) await this.persistSystem(entry);
      }
    } else if (__DEV__ && this.systemQueue.length > 0) {
      console.warn(
        "LoggingService: persistenceService.appendSystemLog no existe " +
          "todavía; entradas SYSTEM retenidas en cola de arranque (ver " +
          "notes/wave5.md).",
      );
    }

    if (typeof capable.appendAuditLog === "function") {
      while (this.auditQueue.length > 0) {
        const entry = this.auditQueue.shift();
        if (entry) await this.persistAudit(entry);
      }
    } else if (__DEV__ && this.auditQueue.length > 0) {
      console.warn(
        "LoggingService: persistenceService.appendAuditLog no existe " +
          "todavía; entradas AUDIT retenidas en cola de arranque (ver " +
          "notes/wave5.md).",
      );
    }
  }

  /**
   * Persiste una entrada SYSTEM ya sabiendo que `appendSystemLog` existe
   * (verificado por el llamador en `flush`). Si la llamada falla en
   * tiempo de ejecución, se registra el error pero no se reencola de
   * forma infinita.
   */
  private async persistSystem(entry: SystemLogRecord): Promise<void> {
    try {
      const capable = persistenceService as unknown as LogPersistenceCapable;
      await capable.appendSystemLog?.(entry);
    } catch (error) {
      console.error("LoggingService: fallo persistiendo SystemLog:", error);
    }
  }

  /**
   * Persiste una entrada AUDIT ya sabiendo que `appendAuditLog` existe
   * (verificado por el llamador en `flush`).
   */
  private async persistAudit(entry: AuditLogRecord): Promise<void> {
    try {
      const capable = persistenceService as unknown as LogPersistenceCapable;
      await capable.appendAuditLog?.(entry);
    } catch (error) {
      console.error("LoggingService: fallo persistiendo AuditLog:", error);
    }
  }
}

export const loggingService = new LoggingService();
