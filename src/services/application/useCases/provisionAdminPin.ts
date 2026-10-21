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

export async function provisionAdminPin(code: string, fingerprint?: string): Promise<IntentResult<{ nonce: string }>> {
  const installed = await SecurityService.provisionFromCode(code, fingerprint);
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
          data: { nonce: installed.nonce, expiresAtMs: installed.expiresAtMs, keyId: installed.keyId },
        },
        db,
      );
      if (installed.keyAction === "PINNED") {
        await IntegrityLedgerService.append(
          {
            sessionId: null,
            actor: "USER",
            intent: "EMPLOYER_KEY_PINNED",
            fromState: null,
            toState: null,
            reason: installed.keyAuth === "ANCHOR" ? "ANCHOR" : "FINGERPRINT",
            timestampMs: nowMs,
            integrityClass: null,
            data: { keyId: installed.keyId },
          },
          db,
        );
      }
      if (installed.keyAction === "REPINNED") {
        await IntegrityLedgerService.append(
          {
            sessionId: null,
            actor: "USER",
            intent: "EMPLOYER_KEY_REPINNED",
            fromState: null,
            toState: null,
            reason: "ROTATION",
            timestampMs: nowMs,
            integrityClass: null,
            data: { keyId: installed.keyId, previousKeyId: installed.previousKeyId },
          },
          db,
        );
      }
    });
  } catch (error) {
    await SecurityService.rollbackProvision(installed.snapshot);
    LoggingService.log("ROJO", "SEGURIDAD", "ERROR", "Aprovisionamiento de PIN deshecho: el ledger no se escribió", serializeError(error));
    return { ok: false, code: "PERSISTENCE_ERROR" };
  }
  SecurityService.publishProvisionedPin();
  return { ok: true, data: { nonce: installed.nonce } };
}
