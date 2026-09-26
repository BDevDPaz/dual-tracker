/**
 * EvidencePackService — Evidencia (Propuesta Técnica §5.10, garantía dual)
 * ============================================================================
 * Empaqueta el periodo de nómina en un expediente reproducible para ambas
 * partes: PayrollStatement + asientos del ledger + resumen de traza (no todos
 * los puntos crudos) + hashes + policyId.
 *  - Manifiesto SHA-256 (packHash): empleado y empleador comparan el mismo hash.
 *  - Exportación PDF (ReportService) + manifiesto JSON; el JSON queda en
 *    OfflineQueue para un futuro portal empleador.
 *  - Un pack sellado es INMUTABLE: volver a generar crea otro packId
 *    (Propuesta de Producto §5.13, "no hay regenerar con otras reglas").
 *  - PAYROLL_EXPORT no recalcula con reglas distintas a las del cierre: usa
 *    el policyId vigente del periodo.
 */
import * as Crypto from "expo-crypto";
import type { EvidencePack, IntentResult, PackManifest, SessionRecord } from "../../core/contracts";
import { StoreActions } from "../../core/store";
import { canonicalJson } from "../../utils/canonicalJson";
import { weekPeriodId, getWeekStart } from "../../utils/dateUtils";
import { serializeError } from "../../utils/serializeError";
import { IntegrityLedgerService } from "../domain/IntegrityLedgerService";
import { PayrollEngineService } from "../domain/PayrollEngineService";
import { LoggingService } from "../persistence/LoggingService";
import { OfflineQueueService } from "../persistence/OfflineQueueService";
import { PersistenceService } from "../persistence/PersistenceService";
import { SettingsService } from "../persistence/SettingsService";
import { sha256Hex } from "./HashChain";
import { ReportService } from "./ReportService";
import { TimeAuthorityService } from "./TimeAuthorityService";
import { TraceRecorderService } from "./TraceRecorderService";

export type SealRejection = "EMPTY_PERIOD" | "PERIOD_HAS_CONFLICT" | "PERSISTENCE_ERROR";

export const EvidencePackService = {
  /**
   * Sella el periodo. Con CONFLICT en el periodo exige `allowUncertified`
   * (la vista antes debe pasar por /system/conflict o aceptar el sello
   * "no certificado" visible).
   */
  async seal(input: { periodStart: number; periodEnd: number; allowUncertified?: boolean }): Promise<IntentResult<EvidencePack>> {
    try {
      const settings = await SettingsService.load();
      const nowMs = TimeAuthorityService.now();
      const sessions = await PersistenceService.listSessions({ from: input.periodStart, to: input.periodEnd });
      const statement = PayrollEngineService.buildStatement({
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        sessions,
        rates: { hourlyRate: settings.profile.hourlyRate, overtimeMultiplier: settings.company.overtimeMultiplier },
        company: settings.company,
        policyId: settings.company.overtimePolicyId,
        nowMs,
      });
      if (statement.sessionIds.length === 0) return { ok: false, code: "EMPTY_PERIOD" };
      if (statement.integrityRollup.hasConflict && !input.allowUncertified) return { ok: false, code: "PERIOD_HAS_CONFLICT" };

      const included = sessions.filter((s) => statement.sessionIds.includes(s.id));
      const traces = await Promise.all(included.map((s) => TraceRecorderService.summarize(s)));
      const evidence = await IntegrityLedgerService.summarize(included, input.periodStart, input.periodEnd, traces);

      const packId = `${weekPeriodId(getWeekStart(input.periodStart))}-${Crypto.randomUUID().slice(0, 8)}`;
      const statementHash = await sha256Hex(canonicalJson({ ...statement, packHash: null }));
      const evidenceHash = await sha256Hex(canonicalJson(evidence));
      const certified = statement.integrityRollup.certified;
      const packHash = await sha256Hex(
        canonicalJson({
          packId,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          sealedAtMs: nowMs,
          policyId: statement.policyId,
          sessionIds: statement.sessionIds,
          statementHash,
          evidenceHash,
          certified,
        }),
      );

      const manifest: PackManifest = {
        packId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        sealedAtMs: nowMs,
        policyId: statement.policyId,
        sessionIds: statement.sessionIds,
        statementHash,
        evidenceHash,
        packHash,
        certified,
        files: [],
      };
      const sealedStatement = { ...statement, packHash };
      const reportInput = {
        statement: sealedStatement,
        evidence,
        manifest,
        sessions: included,
        sites: await PersistenceService.listSites({ includeArchived: true }),
        profile: settings.profile,
        company: settings.company,
      };

      const employee = await ReportService.renderPdf("EMPLOYEE_RECEIPT", reportInput);
      const employer = await ReportService.renderPdf("EMPLOYER_DOSSIER", reportInput);
      manifest.files = [
        { role: "EMPLOYEE_RECEIPT", name: employee.name },
        { role: "EMPLOYER_DOSSIER", name: employer.name },
        { role: "MANIFEST_JSON", name: `manifest_${packId}.json` },
      ];
      // TODO(propuesta): "JSON firmado" — hoy el manifiesto no lleva firma
      // asimétrica (no hay clave de dispositivo provisionada por el empleador).
      const manifestFile = ReportService.writeJson(packId, `manifest_${packId}`, canonicalJson({ manifest, statement: sealedStatement, evidence }));

      const pack: EvidencePack = {
        id: packId,
        manifest,
        statement: sealedStatement,
        evidence,
        employeePdfUri: employee.uri,
        employerPdfUri: employer.uri,
        manifestUri: manifestFile.uri,
        createdAtMs: nowMs,
      };

      await PersistenceService.transaction(async (db) => {
        await IntegrityLedgerService.append(
          {
            sessionId: null,
            actor: "USER",
            intent: "PAYROLL_SEALED",
            fromState: null,
            toState: null,
            reason: certified ? "PACK_SEALED" : "PACK_SEALED_UNCERTIFIED",
            timestampMs: nowMs,
            integrityClass: null,
            data: { packId, packHash },
          },
          db,
        );
      });
      await PersistenceService.insertPack(pack);
      await OfflineQueueService.enqueue(packId);
      StoreActions.packUpserted(pack);
      return { ok: true, data: pack };
    } catch (error) {
      LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "Fallo sellando expediente", serializeError(error));
      return { ok: false, code: "PERSISTENCE_ERROR", detail: serializeError(error) };
    }
  },

  async get(packId: string): Promise<EvidencePack | null> {
    return PersistenceService.getPack(packId);
  },

  async list(): Promise<EvidencePack[]> {
    return PersistenceService.listPacks();
  },

  async shareEmployee(packId: string): Promise<IntentResult> {
    const pack = await PersistenceService.getPack(packId);
    if (!pack?.employeePdfUri) return { ok: false, code: "PACK_NOT_FOUND" };
    return (await ReportService.share(pack.employeePdfUri)) ? { ok: true } : { ok: false, code: "SHARE_UNAVAILABLE" };
  },

  async shareEmployer(packId: string): Promise<IntentResult> {
    const pack = await PersistenceService.getPack(packId);
    if (!pack?.employerPdfUri) return { ok: false, code: "PACK_NOT_FOUND" };
    const settings = await SettingsService.load();
    const uris = [pack.employerPdfUri, pack.manifestUri].filter((u): u is string => !!u);
    const sent = await ReportService.email(uris, settings.company.companyEmail, settings.profile.employeeName, packId);
    return sent ? { ok: true } : { ok: false, code: "SHARE_UNAVAILABLE" };
  },

  /** ¿Algún pack ya cubre exactamente este periodo? (idempotencia de PAYROLL_EXPORT). */
  async findForPeriod(periodStart: number, periodEnd: number): Promise<EvidencePack | null> {
    const packs = await PersistenceService.listPacks();
    return packs.find((p) => p.manifest.periodStart === periodStart && p.manifest.periodEnd === periodEnd) ?? null;
  },

  /** Sesiones de un pack (para report/pack/[packId]). */
  async sessionsOf(pack: EvidencePack): Promise<SessionRecord[]> {
    const all = await PersistenceService.listSessions({ from: pack.manifest.periodStart, to: pack.manifest.periodEnd, includeDeleted: true });
    return all.filter((s) => pack.manifest.sessionIds.includes(s.id));
  },
};
