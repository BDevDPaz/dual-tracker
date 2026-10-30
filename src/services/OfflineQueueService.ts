import AsyncStorage from "@react-native-async-storage/async-storage";

import type { EvidencePack } from "../core/contracts";
import { timeAuthorityService } from "./TimeAuthorityService";

/**
 * ============================================================================
 * OfflineQueueService — Propuesta 5.13 (nuevo, preparado para portal
 * empleador)
 * ----------------------------------------------------------------------------
 * "Aunque el producto actual es on-device, Dual Tracker tiene sentido cuando
 * el empleador recibe el expediente. La cola guarda paquetes
 * PENDING/SYNCED/FAILED sin bloquear el cierre local de jornada."
 *
 * ⚠️ CONTRATO DE USO: TODOS los métodos de este servicio son fire-and-forget
 * desde la perspectiva del llamador. Devuelven Promise por higiene de tipos
 * (y para permitir manejo de errores si el llamador lo desea), pero NUNCA
 * deben ser `await`-ados dentro de la ruta crítica de cierre de jornada
 * (SESSION_CLOSED_MANUAL / auto-checkout / failsafe). Si este servicio es
 * lento o falla (ej. AsyncStorage corrupto), el cierre de jornada local
 * DEBE completarse igual — la cola es una capacidad futura hacia un portal
 * empleador que hoy no existe, no una dependencia dura del dominio.
 * ============================================================================
 */

export type OfflineQueueStatus = "PENDING" | "SYNCED" | "FAILED";

interface QueueEntry {
  pack: EvidencePack;
  status: OfflineQueueStatus;
  enqueuedAtMs: number;
  updatedAtMs: number;
  failureReason: string | null;
}

const STORAGE_KEY = "dualtracker.offlineQueue.v1";

class OfflineQueueService {
  private async readAll(): Promise<QueueEntry[]> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as QueueEntry[]) : [];
    } catch (error) {
      console.error("OfflineQueueService: fallo leyendo la cola:", error);
      return [];
    }
  }

  private async writeAll(entries: QueueEntry[]): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (error) {
      console.error("OfflineQueueService: fallo guardando la cola:", error);
    }
  }

  /**
   * Encola un EvidencePack en estado PENDING. Fire-and-forget: no bloquear
   * el cierre local de jornada esperando esta promesa.
   */
  async enqueue(pack: EvidencePack): Promise<void> {
    const entries = await this.readAll();
    const nowMs = timeAuthorityService.now();

    const existingIndex = entries.findIndex((e) => e.pack.id === pack.id);
    const entry: QueueEntry = {
      pack,
      status: "PENDING",
      enqueuedAtMs: nowMs,
      updatedAtMs: nowMs,
      failureReason: null,
    };

    if (existingIndex >= 0) {
      entries[existingIndex] = entry;
    } else {
      entries.push(entry);
    }

    await this.writeAll(entries);
  }

  /** Marca un paquete como sincronizado exitosamente con el portal empleador. */
  async markSynced(packId: string): Promise<void> {
    const entries = await this.readAll();
    const index = entries.findIndex((e) => e.pack.id === packId);
    if (index < 0) return;

    entries[index] = {
      ...entries[index],
      status: "SYNCED",
      failureReason: null,
      updatedAtMs: timeAuthorityService.now(),
    };

    await this.writeAll(entries);
  }

  /** Marca un paquete como fallido, con un motivo legible para diagnóstico. */
  async markFailed(packId: string, reason: string): Promise<void> {
    const entries = await this.readAll();
    const index = entries.findIndex((e) => e.pack.id === packId);
    if (index < 0) return;

    entries[index] = {
      ...entries[index],
      status: "FAILED",
      failureReason: reason,
      updatedAtMs: timeAuthorityService.now(),
    };

    await this.writeAll(entries);
  }

  /** Lista los EvidencePack aún en estado PENDING. */
  async listPending(): Promise<EvidencePack[]> {
    const entries = await this.readAll();
    return entries.filter((e) => e.status === "PENDING").map((e) => e.pack);
  }

  /** Lista todos los paquetes en cola, con su estado, para diagnóstico/UI. */
  async listAll(): Promise<
    { pack: EvidencePack; status: OfflineQueueStatus; failureReason: string | null }[]
  > {
    const entries = await this.readAll();
    return entries.map((e) => ({
      pack: e.pack,
      status: e.status,
      failureReason: e.failureReason,
    }));
  }
}

export const offlineQueueService = new OfflineQueueService();
