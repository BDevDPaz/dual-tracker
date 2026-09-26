/**
 * INTEGRITY_SWEEP (Propuesta Técnica §7.2) — diario.
 *  - Verifica la cadena de hashes del ledger (una rotura es incidente crítico).
 *  - Expurga miga de pan vencida según retención.
 *  - Reintenta la cola offline (sin transporte configurado no envía nada).
 * Idempotente: se ejecuta como mucho una vez por día (KV LAST_SWEEP_DAY).
 */
import { IntegrityLedgerService } from "../../domain/IntegrityLedgerService";
import { TimeAuthorityService } from "../../evidence/TimeAuthorityService";
import { TraceRecorderService } from "../../evidence/TraceRecorderService";
import { LoggingService } from "../../persistence/LoggingService";
import { OfflineQueueService } from "../../persistence/OfflineQueueService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { KV_KEYS } from "../../persistence/schema";
import { SettingsService } from "../../persistence/SettingsService";

export async function runIntegritySweep(force = false): Promise<{ chainValid: boolean; purged: number } | null> {
  const today = TimeAuthorityService.todayDateString();
  if (!force && (await PersistenceService.getKv<string>(KV_KEYS.LAST_SWEEP_DAY)) === today) return null;
  const chain = await IntegrityLedgerService.verify();
  if (!chain.valid) {
    LoggingService.log("ROJO", "INTEGRIDAD_COMPROMETIDA", "ERROR", "Cadena del ledger rota", { brokenAtId: chain.brokenAtId });
    // TODO(propuesta): acción ante ledger roto (bloquear exportación, avisar al empleador) no definida.
  }
  const settings = await SettingsService.load();
  const purged = await TraceRecorderService.purgeExpired(settings.company.traceRetentionDays);
  await OfflineQueueService.flush();
  await PersistenceService.setKv(KV_KEYS.LAST_SWEEP_DAY, today);
  return { chainValid: chain.valid, purged };
}
