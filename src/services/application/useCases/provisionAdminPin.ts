/**
 * Aprovisiona el PIN de administración con el código de un solo uso del empleador.
 * El ledger anota el nonce y la caducidad. No anota el PIN, la sal ni el hash.
 */
import type { IntentResult } from "../../../core/contracts";
import { IntegrityLedgerService } from "../../domain/IntegrityLedgerService";
import { TimeAuthorityService } from "../../evidence/TimeAuthorityService";
import { LoggingService } from "../../persistence/LoggingService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { SecurityService } from "../../runtime/SecurityService";
import { serializeError } from "../../../utils/serializeError";

export async function provisionAdminPin(code: string): Promise<IntentResult<{ nonce: string }>> {
  const installed = await SecurityService.provisionFromCode(code);
  if (!installed.ok) return { ok: false, code: installed.code };
  const nowMs = TimeAuthorityService.now();
  try {
    await PersistenceService.transaction(async (db) => {
      await IntegrityLedgerService.append(
        {
          sessionId: null,
          actor: "USER",
          intent: "ADMIN_PIN_PROVISIONED",
          fromState: null,
          toState: null,
          reason: "EMPLOYER_CODE",
          timestampMs: nowMs,
          integrityClass: null,
          data: { nonce: installed.nonce, expiresAtMs: installed.expiresAtMs },
        },
        db,
      );
    });
  } catch (error) {
    LoggingService.log("ROJO", "SEGURIDAD", "ERROR", "PIN aprovisionado sin asiento de ledger", serializeError(error));
    return { ok: false, code: "PERSISTENCE_ERROR" };
  }
  return { ok: true, data: { nonce: installed.nonce } };
}
