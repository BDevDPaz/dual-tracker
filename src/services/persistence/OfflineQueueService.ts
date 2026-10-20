/**
 * OfflineQueueService — Persistencia (Propuesta Técnica §5.13)
 * ============================================================================
 * Cola de expedientes PENDING / SYNCED / FAILED. El envío es el adaptador
 * HTTPS del portal del empleador: desactivado y sin URL por defecto.
 * flush() no llama a fetch si la bandera está apagada o no hay una URL https.
 * Cada fallo deja el ítem en FAILED con espera exponencial. La clave de
 * idempotencia de cada POST es el packHash.
 */
import type * as SQLite from "expo-sqlite";
import { PORTAL_MAX_ATTEMPTS } from "../../config/provisional";
import type { OfflineQueueItem } from "../../core/contracts";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { LoggingService } from "./LoggingService";
import { PersistenceService } from "./PersistenceService";
import { SettingsService } from "./SettingsService";
import { portalBackoffMs, portalSendDecision, postSignedPack } from "./employerPortal";

export interface FlushResult {
  attempted: number;
  synced: number;
  /** null cuando el portal está activo y se recorrió la cola. */
  skipped: "NOT_CONFIGURED" | "DISABLED" | "NOT_HTTPS" | null;
}

export const OfflineQueueService = {
  async enqueue(packId: string, idempotencyKey: string | null = null, database?: SQLite.SQLiteDatabase): Promise<number> {
    return PersistenceService.enqueueOffline(packId, idempotencyKey, database);
  },

  async list(): Promise<OfflineQueueItem[]> {
    return PersistenceService.listOffline();
  },

  /**
   * Intenta los PENDING y FAILED que ya cumplieron la espera y no agotaron
   * los intentos. Sin URL https y bandera, no intenta nada y no llama a fetch.
   */
  async flush(): Promise<FlushResult> {
    const settings = await SettingsService.load();
    const decision = portalSendDecision(settings.company);
    if (!decision.send) return { attempted: 0, synced: 0, skipped: decision.reason };

    const now = TimeAuthorityService.now();
    const items = [...(await PersistenceService.listOffline("PENDING")), ...(await PersistenceService.listOffline("FAILED"))];
    let attempted = 0;
    let synced = 0;
    for (const item of items) {
      if (item.attempts >= PORTAL_MAX_ATTEMPTS) continue;
      if (item.nextAttemptAtMs !== null && item.nextAttemptAtMs > now) continue;
      attempted++;
      const pack = await PersistenceService.getPack(item.packId);
      if (!pack) {
        await PersistenceService.updateOffline(item.id, "FAILED", "PACK_MISSING", null);
        LoggingService.log("NARANJA", "SINCRONIZACION", "WARN", "Expediente ausente en la cola", { packId: item.packId });
        continue;
      }
      const result = await postSignedPack(decision.url, pack);
      if (result.ok) {
        await PersistenceService.updateOffline(item.id, "SYNCED", null, null);
        synced++;
        continue;
      }
      const attemptsAfter = item.attempts + 1;
      const stop = !result.retryable || attemptsAfter >= PORTAL_MAX_ATTEMPTS;
      const next = stop ? null : now + portalBackoffMs(attemptsAfter);
      await PersistenceService.updateOffline(item.id, "FAILED", result.error, next);
      LoggingService.log("NARANJA", "SINCRONIZACION", "WARN", "Fallo enviando expediente", {
        packId: item.packId,
        status: result.status,
        attempts: attemptsAfter,
      });
    }
    return { attempted, synced, skipped: null };
  },
};
