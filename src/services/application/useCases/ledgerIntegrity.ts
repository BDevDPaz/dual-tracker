/**
 * Casos de uso: integridad del ledger (spec FieldCryptoService v1.3 §5.5).
 * ============================================================================
 *  - checkLedgerIntegrity: detección (arranque incremental, integritySweep y
 *    antes de cada sello completa). Persiste el incidente (KV ledger.broken),
 *    degrada la jornada abierta a CONFLICT/LEDGER_CHAIN_BROKEN y refleja el
 *    estado en Store.health.ledger.
 *  - acknowledgeLedgerBreak: el administrador confirma con PIN; solo se acepta
 *    si el incidente coincide exactamente con el guardado. Abre un segmento.
 *  - exportLedgerIncident: informe JSON + SHA-256 por Sharing; deja el asiento
 *    LEDGER_BREAK_EXPORTED. Disponible antes y después del reconocimiento.
 * No existe "reparar cadena": nunca se recalculan ni reescriben hashes.
 */
import type { IntentResult, LedgerIncident, LedgerVerification } from "../../../core/contracts";
import { StoreActions } from "../../../core/store";
import { APP_VERSION } from "../../../constants/app";
import { IntegrityLedgerService } from "../../domain/IntegrityLedgerService";
import { SessionEngineService } from "../../domain/SessionEngineService";
import { ReportService } from "../../evidence/ReportService";
import { TimeAuthorityService } from "../../evidence/TimeAuthorityService";
import { LoggingService } from "../../persistence/LoggingService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { SecurityService } from "../../runtime/SecurityService";

export async function checkLedgerIntegrity(
  mode: "FULL" | "INCREMENTAL" = "FULL",
): Promise<{ verification: LedgerVerification; incident: LedgerIncident | null }> {
  const verification = mode === "FULL" ? await IntegrityLedgerService.verify() : await IntegrityLedgerService.verifyIncremental();
  const nowMs = TimeAuthorityService.now();
  let incident = await IntegrityLedgerService.getIncident();
  if (!verification.valid) {
    const before = incident;
    incident = await IntegrityLedgerService.recordIncident(verification, nowMs);
    if (!before || before.breakAtId !== incident?.breakAtId) {
      LoggingService.log("ROJO", "INTEGRIDAD_COMPROMETIDA", "ERROR", "Cadena del ledger rota: incidente abierto", {
        breakAtId: incident?.breakAtId ?? null,
      });
    }
    // La jornada abierta queda en CONFLICT (su evidencia en curso no es confiable).
    const open = await PersistenceService.getOpenSession();
    if (open && open.integrityClass !== "CONFLICT") {
      await SessionEngineService.dispatch({ type: "INTEGRITY_DEGRADE", cause: "LEDGER_CHAIN_BROKEN" }, "SYSTEM");
    }
  } else if (!incident) {
    await IntegrityLedgerService.markVerified();
  }
  StoreActions.healthUpdated({ ledger: { broken: incident, acknowledgedBreaks: verification.acknowledgedBreaks } });
  return { verification, incident };
}

export async function acknowledgeLedgerBreak(pin: string, claimed: LedgerIncident): Promise<IntentResult> {
  const auth = await SecurityService.unlock(pin);
  if (!auth.ok) return { ok: false, code: auth.code };
  const r = await IntegrityLedgerService.acknowledgeBreak(claimed, TimeAuthorityService.now());
  if (!r.ok) return { ok: false, code: r.code };
  const v = await IntegrityLedgerService.verify();
  StoreActions.healthUpdated({ ledger: { broken: await IntegrityLedgerService.getIncident(), acknowledgedBreaks: v.acknowledgedBreaks } });
  LoggingService.log("NARANJA", "INTEGRIDAD_COMPROMETIDA", "WARN", "Ruptura de ledger reconocida por el administrador", { ackId: r.entry.id });
  return { ok: true, data: r.entry };
}

export async function exportLedgerIncident(): Promise<IntentResult<{ uri: string; sha256: string }>> {
  const { json, sha256 } = await IntegrityLedgerService.buildIncidentReport(APP_VERSION);
  const nowMs = TimeAuthorityService.now();
  const file = ReportService.writeJson("incidents", `ledger_incident_${nowMs}`, json);
  await PersistenceService.transaction(async (db) => {
    await IntegrityLedgerService.append(
      {
        sessionId: null,
        actor: "USER",
        intent: "LEDGER_BREAK_EXPORTED",
        fromState: null,
        toState: null,
        reason: "INCIDENT_REPORT_EXPORTED",
        timestampMs: nowMs,
        integrityClass: null,
        data: { reportSha256: sha256 },
      },
      db,
    );
  });
  const shared = await ReportService.shareJson(file.uri);
  return shared ? { ok: true, data: { uri: file.uri, sha256 } } : { ok: false, code: "SHARE_UNAVAILABLE" };
}
