/**
 * Casos de uso: salud del cifrado de campos (spec FieldCryptoService v1.3 §14).
 * ============================================================================
 *  - refreshFieldCryptoHealth: recalcula el estado (lostKids, sesiones
 *    afectadas) y lo refleja en Store.health.fieldCrypto. Si la jornada ABIERTA
 *    tiene notas o rastro de un kid perdido (posible tras restaurar), recibe
 *    INTEGRITY_DEGRADE con FIELD_CRYPTO_KEY_LOST: su evidencia en curso está
 *    incompleta. Las sesiones cerradas NO se tocan (conservan clase y
 *    certificación).
 */
import type { FieldCryptoHealth } from "../../../core/contracts";
import { StoreActions } from "../../../core/store";
import { SessionEngineService } from "../../domain/SessionEngineService";
import { cryptoHealthSnapshot } from "../../persistence/cryptoMigrations";
import { LoggingService } from "../../persistence/LoggingService";
import { PersistenceService } from "../../persistence/PersistenceService";

export async function refreshFieldCryptoHealth(): Promise<FieldCryptoHealth> {
  const health = await cryptoHealthSnapshot();
  StoreActions.cryptoHealth(health);
  if (health.affectedSessionIds.length) {
    const open = await PersistenceService.getOpenSession();
    if (open && open.integrityClass !== "CONFLICT" && health.affectedSessionIds.includes(open.id)) {
      LoggingService.log("NARANJA", "INTEGRIDAD_COMPROMETIDA", "WARN", "Jornada abierta con datos de una clave perdida", {
        sessionId: open.id,
        lostKids: health.lostKids,
      });
      await SessionEngineService.dispatch({ type: "INTEGRITY_DEGRADE", cause: "FIELD_CRYPTO_KEY_LOST" }, "SYSTEM");
    }
  }
  return health;
}
