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
import type { EvidencePack, EvidenceSummary, IntentResult, PackManifest, PayrollStatement, SessionRecord } from "../../core/contracts";
import { PACK_MANIFEST_VERSION } from "../../core/contracts";
import { StoreActions } from "../../core/store";
import { canonicalJson } from "../../utils/canonicalJson";
import { companyCalendar } from "../../utils/companyPolicy";
import { isValidRange, periodIdAt } from "../../utils/dateUtils";
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

export type SealRejection =
  | "INVALID_PERIOD"
  | "EMPTY_PERIOD"
  | "PERIOD_ONLY_OPEN"
  | "PERIOD_HAS_CONFLICT"
  /** Sin CONFLICT pero no certificable (bloqueos de certificación o periodo tocado por una ruptura, spec v1.3 §5.5/§12). */
  | "PERIOD_NOT_CERTIFIABLE"
  /** Cadena del ledger rota sin reconocer (spec v1.3 §5.5); también con allowUncertified. */
  | "LEDGER_BROKEN"
  | "PERSISTENCE_ERROR";

/** Resultado de seal: `reused` = se devolvió el pack existente con el mismo contentHash. */
export type SealResult = { ok: true; data: EvidencePack; reused: boolean } | { ok: false; code: SealRejection | string; detail?: string };

export interface PackVerification {
  valid: boolean;
  /** Pack v1 sin contentHash: se verifica con el formato antiguo y no se comprueba contenido. */
  legacy: boolean;
  /** Comprobaciones que fallaron (STATEMENT_HASH, EVIDENCE_HASH, CONTENT_HASH, PACK_HASH, STATEMENT_PACK_HASH). */
  failures: string[];
}

/**
 * Normalización canónica del contenido: claves ordenadas (canonicalJson),
 * sin undefined, fechas como epoch ms enteros (Date → getTime()), números no
 * finitos → null. Los números finitos se serializan con Number#toString de
 * ECMAScript (forma más corta de ida y vuelta), idéntico en Node y Hermes.
 */
function normalizeContent(value: unknown): unknown {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? (Object.is(value, -0) ? 0 : value) : null;
  if (Array.isArray(value)) return value.map(normalizeContent);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = normalizeContent(v);
    }
    return out;
  }
  return value;
}

/**
 * Contenido sellable del periodo, sin campos volátiles por sello:
 *  - statement sin `packHash` (lo asigna cada sello);
 *  - evidencia sin `ledgerHeadHash` ni `ledgerChainValid` (estado GLOBAL de la
 *    cadena en el instante del sello) y solo con asientos de sesiones: los
 *    asientos sin sesión (PAYROLL_SEALED de sellos previos) no son contenido.
 */
export function contentOf(statement: PayrollStatement, evidence: EvidenceSummary): unknown {
  const ledger = evidence.ledgerHashes.filter((e) => e.sessionId !== null);
  return normalizeContent({
    statement: { ...statement, packHash: null },
    evidence: {
      ledgerEntryCount: ledger.length,
      ledgerHashes: ledger,
      traces: evidence.traces,
      conflicts: evidence.conflicts,
    },
  });
}

export async function computeContentHash(statement: PayrollStatement, evidence: EvidenceSummary): Promise<string> {
  return sha256Hex(canonicalJson(contentOf(statement, evidence)));
}

/** packHash = SHA-256 del manifiesto canónico (sin packHash ni files). v1 no lleva versión ni contentHash. */
async function computePackHash(m: Omit<PackManifest, "packHash" | "files">): Promise<string> {
  const base = {
    packId: m.packId,
    periodStart: m.periodStart,
    periodEnd: m.periodEnd,
    sealedAtMs: m.sealedAtMs,
    policyId: m.policyId,
    sessionIds: m.sessionIds,
    statementHash: m.statementHash,
    evidenceHash: m.evidenceHash,
    certified: m.certified,
  };
  const body = m.manifestVersion === undefined ? base : { ...base, manifestVersion: m.manifestVersion, contentHash: m.contentHash ?? null };
  return sha256Hex(canonicalJson(body));
}

async function latestPackForPeriod(periodStart: number, periodEnd: number): Promise<EvidencePack | null> {
  // TODO(propuesta): no existe revocación de packs en el modelo actual; todos
  // cuentan como "no revocados". Si se añade, filtrar aquí.
  const packs = (await PersistenceService.listPacks())
    .filter((p) => p.manifest.periodStart === periodStart && p.manifest.periodEnd === periodEnd)
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
  return packs[0] ?? null;
}

export const EvidencePackService = {
  /**
   * Sella el periodo. Con CONFLICT en el periodo exige `allowUncertified`
   * (la vista antes debe pasar por /system/conflict o aceptar el sello
   * "no certificado" visible).
   */
  /**
   * Idempotencia: si el contentHash coincide con el del pack más reciente del
   * mismo periodo, se devuelve ese pack (`reused: true`) sin packId ni asiento
   * nuevos. `reissue: true` fuerza un pack nuevo con el mismo contenido
   * (reemisión explícita, p. ej. PDF perdido o reenvío formal); queda en el
   * ledger como PACK_REISSUED con referencia al pack anterior.
   */
  async seal(input: { periodStart: number; periodEnd: number; allowUncertified?: boolean; reissue?: boolean }): Promise<SealResult> {
    // Periodo no finito (antes: NaN por dayjs tz en Hermes) → mensaje claro, no "No encontrado".
    if (!isValidRange(input.periodStart, input.periodEnd) || !periodIdAt(input.periodStart)) {
      return { ok: false, code: "INVALID_PERIOD" };
    }
    try {
      const settings = await SettingsService.load();
      const nowMs = TimeAuthorityService.now();
      // Verificación completa antes de cada sello (spec v1.3 §5.5).
      const chain = await IntegrityLedgerService.verify();
      if (!chain.valid) await IntegrityLedgerService.recordIncident(chain, nowMs);
      const ledgerIncident = await IntegrityLedgerService.getIncident();
      const segmentedLedgerTimestamps = await IntegrityLedgerService.segmentedTimestamps();
      const sessions = await PersistenceService.listSessions({ from: input.periodStart, to: input.periodEnd, overlapping: true });
      // Política por periodo (spec v1.3 §5.2 N3): un resello/reemisión de un periodo
      // sellado con v1 recalcula con v1; los no sellados usan la vigente.
      const policyId = (await PersistenceService.packPolicyForPeriod(input.periodStart, input.periodEnd)) ?? settings.company.overtimePolicyId;
      const statement = PayrollEngineService.buildStatement({
        segmentedLedgerTimestamps,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        sessions,
        rates: { hourlyRate: settings.profile.hourlyRate, overtimeMultiplier: settings.company.overtimeMultiplier },
        company: settings.company,
        policyId,
        nowMs,
      });
      if (statement.sessionIds.length === 0) {
        // Solo cuentan jornadas CERRADAS: distinguir "hay una abierta" de "no hay nada".
        return { ok: false, code: statement.warnings.includes("OPEN_SESSION_EXCLUDED") ? "PERIOD_ONLY_OPEN" : "EMPTY_PERIOD" };
      }
      if (statement.integrityRollup.hasConflict && !input.allowUncertified) return { ok: false, code: "PERIOD_HAS_CONFLICT" };
      if (!statement.integrityRollup.certified && !input.allowUncertified) return { ok: false, code: "PERIOD_NOT_CERTIFIABLE" };

      const included = sessions.filter((s) => statement.sessionIds.includes(s.id));
      const traces = await Promise.all(included.map((s) => TraceRecorderService.summarize(s)));
      const evidence = await IntegrityLedgerService.summarize(included, input.periodStart, input.periodEnd, traces);

      const contentHash = await computeContentHash(statement, evidence);
      const previous = await latestPackForPeriod(input.periodStart, input.periodEnd);
      if (previous && previous.manifest.contentHash === contentHash && !input.reissue) {
        LoggingService.log("AZUL", "PAYROLL", "INFO", "Expediente reutilizado: mismo contenido", { packId: previous.id, contentHash });
        return { ok: true, data: previous, reused: true };
      }
      // Ruptura sin reconocer: ningún sello nuevo, ni siquiera no certificado.
      if (ledgerIncident) return { ok: false, code: "LEDGER_BROKEN", detail: `breakAtId=${ledgerIncident.breakAtId}` };

      const packId = `${periodIdAt(input.periodStart, companyCalendar(settings.company))}-${Crypto.randomUUID().slice(0, 8)}`;
      const statementHash = await sha256Hex(canonicalJson({ ...statement, packHash: null }));
      const evidenceHash = await sha256Hex(canonicalJson(evidence));
      const certified = statement.integrityRollup.certified;
      const unsigned = {
        manifestVersion: PACK_MANIFEST_VERSION,
        packId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        sealedAtMs: nowMs,
        policyId: statement.policyId,
        sessionIds: statement.sessionIds,
        statementHash,
        evidenceHash,
        contentHash,
        certified,
      };
      const packHash = await computePackHash(unsigned);

      const manifest: PackManifest = {
        manifestVersion: PACK_MANIFEST_VERSION,
        contentHash,
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
            reason: input.reissue && previous ? "PACK_REISSUED" : certified ? "PACK_SEALED" : "PACK_SEALED_UNCERTIFIED",
            timestampMs: nowMs,
            integrityClass: null,
            data: { packId, packHash, contentHash, certified, reissueOf: input.reissue && previous ? previous.id : null },
          },
          db,
        );
      });
      await PersistenceService.insertPack(pack);
      await OfflineQueueService.enqueue(packId);
      StoreActions.packUpserted(pack);
      return { ok: true, data: pack, reused: false };
    } catch (error) {
      LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "Fallo sellando expediente", serializeError(error));
      return { ok: false, code: "PERSISTENCE_ERROR", detail: serializeError(error) };
    }
  },

  /**
   * Verifica un pack recomputando todos sus hashes desde el contenido guardado.
   * v2: statementHash, evidenceHash, contentHash y packHash (que incluye contentHash).
   * v1 (legado, sin contentHash): mismas comprobaciones salvo contentHash,
   * con el formato de packHash antiguo; se informa `legacy: true`.
   */
  async verify(pack: EvidencePack): Promise<PackVerification> {
    const m = pack.manifest;
    const legacy = m.manifestVersion === undefined && m.contentHash === undefined;
    const failures: string[] = [];
    if ((await sha256Hex(canonicalJson({ ...pack.statement, packHash: null }))) !== m.statementHash) failures.push("STATEMENT_HASH");
    if ((await sha256Hex(canonicalJson(pack.evidence))) !== m.evidenceHash) failures.push("EVIDENCE_HASH");
    if (!legacy && (await computeContentHash(pack.statement, pack.evidence)) !== m.contentHash) failures.push("CONTENT_HASH");
    const { packHash, files: _files, ...rest } = m;
    if ((await computePackHash(rest)) !== packHash) failures.push("PACK_HASH");
    if (pack.statement.packHash !== packHash) failures.push("STATEMENT_PACK_HASH");
    return { valid: failures.length === 0, legacy, failures };
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
    const all = await PersistenceService.listSessions({ from: pack.manifest.periodStart, to: pack.manifest.periodEnd, includeDeleted: true, overlapping: true });
    return all.filter((s) => pack.manifest.sessionIds.includes(s.id));
  },
};
