/**
 * INTEGRITY_SWEEP (Propuesta Técnica §7.2) — diario.
 *  - Verifica la cadena de hashes del ledger por segmentos (spec v1.3 §5.5).
 *  - Expurga miga de pan vencida según retención.
 *  - Reintenta la cola offline (sin transporte configurado no envía nada).
 * Idempotente: se ejecuta como mucho una vez por día (KV LAST_SWEEP_DAY).
 */
import { refreshFieldCryptoHealth } from "../../application/useCases/fieldCryptoHealth";
import { checkLedgerIntegrity } from "../../application/useCases/ledgerIntegrity";
import { TimeAuthorityService } from "../../evidence/TimeAuthorityService";
import { TraceRecorderService } from "../../evidence/TraceRecorderService";
import { LoggingService } from "../../persistence/LoggingService";
import { OfflineQueueService } from "../../persistence/OfflineQueueService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { KV_KEYS } from "../../persistence/schema";
import { detectKeyLoss, sweepPlaintext } from "../../persistence/cryptoMigrations";
import { SettingsService } from "../../persistence/SettingsService";

export async function runIntegritySweep(force = false): Promise<{ chainValid: boolean; purged: number } | null> {
  const today = TimeAuthorityService.todayDateString();
  if (!force && (await PersistenceService.getKv<string>(KV_KEYS.LAST_SWEEP_DAY)) === today) return null;
  // Verificación completa por segmentos (spec v1.3 §5.5): una ruptura abre un
  // incidente persistente, bloquea el sello y degrada la jornada abierta.
  const { verification: chain } = await checkLedgerIntegrity("FULL");
  if (!chain.valid) {
    LoggingService.log("ROJO", "INTEGRIDAD_COMPROMETIDA", "ERROR", "Cadena del ledger rota", { brokenAtId: chain.brokenAtId });
  }
  // FieldCrypto v1.3 §11/§14: continúa el barrido plain → enc y detecta kids perdidos.
  await sweepPlaintext(500).catch((e) => LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "Barrido de cifrado falló", { error: String(e) }));
  await detectKeyLoss().catch(() => undefined);
  await refreshFieldCryptoHealth().catch(() => undefined);
  const settings = await SettingsService.load();
  const purged = await TraceRecorderService.purgeExpired(settings.company.traceRetentionDays);
  await OfflineQueueService.flush();
  await PersistenceService.setKv(KV_KEYS.LAST_SWEEP_DAY, today);
  return { chainValid: chain.valid, purged };
}
