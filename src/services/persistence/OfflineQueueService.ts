/**
 * OfflineQueueService — Persistencia (Propuesta Técnica §5.13, preparado para portal empleador)
 * ============================================================================
 * Guarda paquetes PENDING/SYNCED/FAILED sin bloquear el cierre local de jornada.
 * TODO: no existe aún destino empleador (portal/API). `flush()` queda como
 * punto de extensión y no envía nada.
 */
import type { OfflineQueueItem } from "../../core/contracts";
import { PersistenceService } from "./PersistenceService";
import { LoggingService } from "./LoggingService";

/** Transporte futuro hacia el portal del empleador. */
export type EmployerTransport = (packId: string) => Promise<void>;

let transport: EmployerTransport | null = null;

export const OfflineQueueService = {
  setTransport(t: EmployerTransport | null): void {
    transport = t;
  },

  async enqueue(packId: string): Promise<number> {
    return PersistenceService.enqueueOffline(packId);
  },

  async list(): Promise<OfflineQueueItem[]> {
    return PersistenceService.listOffline();
  },

  /** Intenta enviar los PENDING/FAILED. Sin transporte configurado no hace nada. */
  async flush(): Promise<{ attempted: number; synced: number }> {
    if (!transport) return { attempted: 0, synced: 0 };
    const items = [
      ...(await PersistenceService.listOffline("PENDING")),
      ...(await PersistenceService.listOffline("FAILED")),
    ];
    let synced = 0;
    for (const item of items) {
      try {
        await transport(item.packId);
        await PersistenceService.updateOffline(item.id, "SYNCED", null);
        synced++;
      } catch (e) {
        await PersistenceService.updateOffline(item.id, "FAILED", String(e));
        LoggingService.log("NARANJA", "SINCRONIZACION", "WARN", "Fallo enviando expediente", { packId: item.packId });
      }
    }
    return { attempted: items.length, synced };
  },
};
