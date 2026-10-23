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
import type { EvidencePack, EvidenceSummary, IntentResult, PackManifest, PayrollStatement, SealWarning, SessionRecord } from "../../core/contracts";
import type { ReportAnnexOptions } from "./reportTemplates";
import { APP_VERSION } from "../../constants/app";
import { DOCUMENT_VERSION, PACK_MANIFEST_VERSION } from "../../core/contracts";
import { readGitCommit, readVersionCode } from "../../support/buildLabel";
import { cryptoHealthSnapshot } from "../persistence/cryptoMigrations";
import { StoreActions } from "../../core/store";
import { canonicalJson } from "../../utils/canonicalJson";
import { companyCalendar, companyTimezone } from "../../utils/companyPolicy";
import { isValidRange, periodIdAt } from "../../utils/dateUtils";
import { serializeError } from "../../utils/serializeError";
import { coverageForSession } from "../../core/monitoringCoverage";
import { IntegrityLedgerService } from "../domain/IntegrityLedgerService";
import { compareSessionsToLedger } from "../domain/sessionReplay";
import { PayrollEngineService } from "../domain/PayrollEngineService";
import { exportSessionTransits } from "../domain/transitExport";
import { LoggingService } from "../persistence/LoggingService";
import { OfflineQueueService } from "../persistence/OfflineQueueService";
import { PersistenceService } from "../persistence/PersistenceService";
import { SettingsService } from "../persistence/SettingsService";
import { powerOffsFromLedger } from "./deviceOffGap";
import { siteMovesFromLedger } from "./siteMoves";
import { chainHash, sha256Hex } from "./HashChain";
import { sessionSealFailure, sessionSealsFromExport } from "./sessionSeal";
import { powerOffSentence } from "./reportPremium";
import { MICROCOPY_REJECTIONS } from "../../i18n/microcopy";
import { loadDeviceIntegrity } from "../runtime/deviceIntegrity";
import { locationTrustForSession, rootedFromSession } from "../runtime/monitoringSnapshot";
import { fingerprintFromB64url, fingerprintsMatch } from "../runtime/keyFingerprint";
import { canSignPacks, readPinnedPackSigningKey, signCanonicalBody, verifyCanonicalBody } from "./packSignature";
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
  /** Una jornada del periodo termina después de la hora de confianza del sello. */
  | "SESSION_ENDS_AFTER_SEAL"
  | "PERSISTENCE_ERROR";

/** Resultado de seal: `reused` = se devolvió el pack existente con el mismo contentHash. */
export type SealResult = { ok: true; data: EvidencePack; reused: boolean } | { ok: false; code: SealRejection | string; detail?: string };

/**
 * Ancla independiente para verificar un pack fuera del teléfono que lo firmó.
 * La clave pública que viaja en la firma no basta: quien verifica aporta la
 * clave o la huella que recibió por otro canal.
 */
export interface PackTrustAnchor {
  /** Clave pública Ed25519 en base64url, la misma que va en la firma. */
  publicKey?: string;
  /** Huella corta (AB12-CD34-EF56-7890). Basta una de las dos; si van las dos, las dos tienen que cuadrar. */
  fingerprint?: string;
}

export interface PackIdentityNote {
  es: string;
  en: string;
}

export interface PackVerification {
  valid: boolean;
  /** Pack v1 sin contentHash: se verifica con el formato antiguo y no se comprueba contenido. */
  legacy: boolean;
  /**
   * "Ed25519" si la firma cuadra criptográficamente con la clave que trae el pack.
   * Eso no identifica al firmante. "unsigned-v1" si no hay firma válida:
   * packs v1–v3 y un sello v4+ con PACK_UNSIGNED. Un v4+ que nació firmado
   * y llega sin firma no es unsigned válido.
   */
  scheme: "Ed25519" | "unsigned-v1";
  /**
   * device: la clave del llavero de este teléfono coincide.
   * anchor: la clave o huella pasada en `trust` coincide.
   * unverified: la firma cuadra y no hay ancla. No es una verificación de identidad.
   * mismatch: el ancla (dispositivo o `trust`) no coincide.
   * unsigned: no hay firma que atribuir.
   */
  identity: "device" | "anchor" | "unverified" | "mismatch" | "unsigned";
  /** Presente solo cuando identity es unverified. */
  identityNote: PackIdentityNote | null;
  /** Comprobaciones que fallaron (STATEMENT_HASH, EVIDENCE_HASH, CONTENT_HASH, PACK_HASH, STATEMENT_PACK_HASH, SIGNATURE, SIGNATURE_KEY, SIGNATURE_MISSING, IDENTITY_UNVERIFIED, LEDGER_*, SESSION_REPLAY). */
  failures: string[];
}

function trustDecision(publicKey: string, trust: PackTrustAnchor): "match" | "mismatch" | "absent" {
  const pub = (trust.publicKey ?? "").trim();
  const typed = (trust.fingerprint ?? "").trim();
  if (!pub && !typed) return "absent";
  if (pub && pub !== publicKey) return "mismatch";
  if (typed) {
    const expected = fingerprintFromB64url(publicKey);
    if (!expected || !fingerprintsMatch(typed, expected)) return "mismatch";
  }
  return "match";
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
/**
 * Statement que entra en statementHash y contentHash. `sessionClasses` es
 * solo del preview (no contar dos veces una jornada partida): no cambia el
 * hash de un pack ya sellado, que no trae el campo.
 */
export function statementForHash(statement: PayrollStatement): Omit<PayrollStatement, "sessionClasses"> {
  const { sessionClasses: _sessionClasses, ...rest } = statement;
  return rest;
}

export function contentOf(statement: PayrollStatement, evidence: EvidenceSummary): unknown {
  const ledger = evidence.ledgerHashes.filter((e) => e.sessionId !== null);
  const body: Record<string, unknown> = {
    ledgerEntryCount: ledger.length,
    ledgerHashes: ledger,
    traces: evidence.traces,
    conflicts: evidence.conflicts,
  };
  // Ausente en packs anteriores: no entra en su contentHash.
  if ("transitSegments" in evidence) body.transitSegments = evidence.transitSegments ?? [];
  if ("sessionSeals" in evidence) body.sessionSeals = evidence.sessionSeals ?? [];
  if ("locationTrust" in evidence) body.locationTrust = evidence.locationTrust ?? [];
  if ("deviceIntegrity" in evidence) body.deviceIntegrity = evidence.deviceIntegrity ?? null;
  if ("monitoringCoverage" in evidence) body.monitoringCoverage = evidence.monitoringCoverage ?? [];
  if ("sessionReplay" in evidence) body.sessionReplay = evidence.sessionReplay ?? [];
  return normalizeContent({
    statement: { ...statementForHash(statement), packHash: null },
    evidence: body,
  });
}

export async function computeContentHash(statement: PayrollStatement, evidence: EvidenceSummary): Promise<string> {
  return sha256Hex(canonicalJson(contentOf(statement, evidence)));
}

/**
 * Cuerpo que entra en packHash. La firma y `files` quedan fuera: packHash no
 * cambia de significado al firmar. v1 sin versión ni contentHash; v2 añade
 * ambos; v3+ añade sealWarnings. `documentVersion`, `documentTheme` y
 * `documentLocale` no entran: son la plantilla del PDF, no el sello.
 */
export function packHashBody(m: Omit<PackManifest, "packHash" | "files" | "signature">): Record<string, unknown> {
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
  if (m.manifestVersion === undefined) return base;
  const v2 = { ...base, manifestVersion: m.manifestVersion, contentHash: m.contentHash ?? null };
  if ((m.manifestVersion ?? 0) < 3) return v2;
  const v3 = { ...v2, sealWarnings: m.sealWarnings ?? [] };
  if ((m.manifestVersion ?? 0) < 5) return v3;
  return {
    ...v3,
    appVersion: m.appVersion ?? null,
    versionCode: m.versionCode ?? null,
    gitCommit: m.gitCommit ?? null,
    sessionTimeZones: m.sessionTimeZones ?? [],
  };
}

/** packHash = SHA-256 del cuerpo canónico. */
async function computePackHash(m: Omit<PackManifest, "packHash" | "files" | "signature">): Promise<string> {
  return sha256Hex(canonicalJson(packHashBody(m)));
}

/**
 * FieldCrypto §14/§15: jornadas del periodo con notas o rastro de un kid perdido.
 * Se calcula al sellar (contexto del dispositivo); no cambia el contenido.
 */
async function sealWarningsFor(sessionIds: number[]): Promise<SealWarning[]> {
  const health = await cryptoHealthSnapshot();
  const affected = health.affectedSessionIds.filter((id) => sessionIds.includes(id));
  return affected.length ? [{ code: "FIELD_CRYPTO_KEY_LOST", sessionIds: affected }] : [];
}

/**
 * FieldCrypto v1.3 §16: shareEmployee/shareEmployer dejan rastro (PACK_SHARED)
 * y actualizan Store.packs.sharedIds. Un fallo del asiento no deshace el
 * envío ya hecho: se registra en el log.
 */
async function recordShared(packId: string, target: "EMPLOYEE" | "EMPLOYER"): Promise<void> {
  try {
    const nowMs = TimeAuthorityService.now();
    await PersistenceService.transaction(async (db) => {
      await IntegrityLedgerService.append(
        { sessionId: null, actor: "USER", intent: "PACK_SHARED", fromState: null, toState: null, reason: `PACK_SHARED_${target}`, timestampMs: nowMs, integrityClass: null, data: { packId, target } },
        db,
      );
    });
    StoreActions.packShared(packId);
  } catch (error) {
    LoggingService.log("NARANJA", "PAYROLL", "WARN", "No se pudo registrar PACK_SHARED", { packId, error: serializeError(error) });
  }
}

/** Pack más reciente del periodo (o null). */
export async function latestPackFor(periodStart: number, periodEnd: number): Promise<EvidencePack | null> {
  return latestPackForPeriod(periodStart, periodEnd);
}

async function latestPackForPeriod(periodStart: number, periodEnd: number): Promise<EvidencePack | null> {
  // TODO(propuesta): no existe revocación de packs en el modelo actual; todos
  // cuentan como "no revocados". Si se añade, filtrar aquí.
  const packs = (await PersistenceService.listPacks())
    .filter((p) => p.manifest.periodStart === periodStart && p.manifest.periodEnd === periodEnd)
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
  return packs[0] ?? null;
}

/** Contenido que sellaría el periodo ahora, sin escribir ni generar PDF. */
async function assemblePeriod(input: { periodStart: number; periodEnd: number }): Promise<
  | { ok: false; code: SealRejection | string; detail?: string }
  | { ok: true; statement: PayrollStatement; evidence: EvidenceSummary; contentHash: string; included: SessionRecord[] }
> {
  const settings = await SettingsService.load();
  const nowMs = TimeAuthorityService.now();
  const segmentedLedgerTimestamps = await IntegrityLedgerService.segmentedTimestamps();
  const sessions = await PersistenceService.listSessions({ from: input.periodStart, to: input.periodEnd, overlapping: true });
  const policyId = (await PersistenceService.packPolicyForPeriod(input.periodStart, input.periodEnd)) ?? settings.company.overtimePolicyId;
  const statement = PayrollEngineService.buildStatement({
    segmentedLedgerTimestamps,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    sessions,
    // Tarifa actual = respaldo: el motor usa la congelada en cada jornada (hourlyRateSnapshot, v8).
    rates: { hourlyRate: settings.profile.hourlyRate, overtimeMultiplier: settings.company.overtimeMultiplier },
    company: settings.company,
    policyId,
    nowMs,
  });
  if (statement.sessionIds.length === 0) {
    return { ok: false, code: statement.warnings.includes("OPEN_SESSION_EXCLUDED") ? "PERIOD_ONLY_OPEN" : "EMPTY_PERIOD" };
  }
  const included = sessions.filter((s) => statement.sessionIds.includes(s.id));
  const traces = await Promise.all(included.map((s) => TraceRecorderService.summarize(s)));
  const evidence = await IntegrityLedgerService.summarize(included, input.periodStart, input.periodEnd, traces);
  evidence.transitSegments = included.flatMap((s) => exportSessionTransits(s, settings.company));
  evidence.sessionSeals = sessionSealsFromExport(evidence.ledgerHashes, new Set(statement.sessionIds));
  const device = await loadDeviceIntegrity();
  evidence.deviceIntegrity = device
    ? {
        developerOptionsEnabled: device.developerOptionsEnabled,
        emulator: device.emulator,
        emulatorHits: device.emulatorHits,
        rooted: device.rooted,
        rootHits: device.rootHits,
        isDevice: device.isDevice,
        platform: device.platform,
      }
    : null;
  evidence.locationTrust = [];
  for (const session of included) {
    const trust = await locationTrustForSession(session.id, await rootedFromSession(session.id, device));
    evidence.locationTrust.push({ sessionId: trust.sessionId, score: trust.score, label: trust.label, penalties: trust.penalties });
  }
  const ledgerRows = await PersistenceService.listLedger();
  evidence.monitoringCoverage = included.map((session) => {
    const coverage = coverageForSession(session, ledgerRows, nowMs);
    return { sessionId: session.id, ...coverage };
  });
  evidence.sessionReplay = compareSessionsToLedger(included, ledgerRows, settings.company, nowMs).map((finding) => ({
    sessionId: finding.sessionId,
    status: finding.status,
    stored: finding.stored,
    ledger: finding.ledger,
  }));
  const contentHash = await computeContentHash(statement, evidence);
  return { ok: true, statement, evidence, contentHash, included };
}

export interface SealFreshness {
  latestPackId: string | null;
  /** null si hoy no hay jornadas cerradas que sellar. */
  liveContentHash: string | null;
  /** true si no hay pack, o el último tiene el mismo contentHash que el cálculo actual. */
  matches: boolean;
  /** El último pack se selló antes de que terminara el periodo (no es el cierre). */
  sealedBeforePeriodEnd: boolean;
}

/** Anexos al compartir, desde la plantilla premium (documentVersion 2). El tránsito va en el sello (v3). */
const SHARE_ANNEX_DOCUMENT_VERSION = 2;

function wantsAnnex(pack: EvidencePack, annex?: ReportAnnexOptions): boolean {
  return (pack.manifest.documentVersion ?? 1) >= SHARE_ANNEX_DOCUMENT_VERSION && !!(annex?.ledger || annex?.enterExit);
}

/**
 * URI que se comparte. Con anexos y documento v2 se pinta una copia en caché.
 * El PDF sellado en documents/packs no se reescribe. Un pack anterior (sin
 * documentVersion, o menor que v2) se comparte tal cual, aunque pidan anexos.
 */
async function exportPdf(pack: EvidencePack, role: "EMPLOYEE_RECEIPT" | "EMPLOYER_DOSSIER", annex?: ReportAnnexOptions): Promise<string | null> {
  const stored = role === "EMPLOYEE_RECEIPT" ? pack.employeePdfUri : pack.employerPdfUri;
  if (!wantsAnnex(pack, annex)) return stored;
  const settings = await SettingsService.load();
  const sessions = await EvidencePackService.sessionsOf(pack);
  const sites = await PersistenceService.listSites({ includeArchived: true });
  const ids = new Set(pack.evidence.ledgerHashes.map((h) => h.id));
  const ledgerRows = (await PersistenceService.listLedger()).filter((e) => ids.has(e.id)).sort((a, b) => a.id - b.id);
  const powerOffs = powerOffsFromLedger(ledgerRows);
  const siteMoves = siteMovesFromLedger(ledgerRows);
  const lang = pack.manifest.documentLocale === "en" ? "en" : "es";
  const ledger = annex?.ledger || annex?.enterExit
    ? ledgerRows.map((row) => {
        const note = row.intent === "OS_KILL" ? powerOffsFromLedger([row])[0] : undefined;
        return {
          id: row.id,
          sessionId: row.sessionId,
          timestampMs: row.timestampMs,
          actor: row.actor,
          intent: row.intent,
          fromState: row.fromState,
          toState: row.toState,
          reason: row.reason,
          integrityClass: row.integrityClass,
          hash: row.hash,
          prevHash: row.prevHash,
          ...(note ? { detail: powerOffSentence(note, lang) } : {}),
        };
      })
    : undefined;
  const rendered = await ReportService.renderPdf(
    role,
    {
      statement: pack.statement,
      evidence: pack.evidence,
      manifest: pack.manifest,
      sessions,
      sites,
      profile: settings.profile,
      company: settings.company,
      annex,
      ledger,
      ...(powerOffs.length ? { powerOffs } : {}),
      ...(siteMoves.length ? { siteMoves } : {}),
    },
    { destination: "cache" },
  );
  return rendered.uri;
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
  /**
   * Compara el último pack del periodo con el cálculo de ahora. No escribe.
   * Un pack sellado antes de que cierre la semana sigue siendo válido, pero
   * no es el cierre: si la jornada que cruza el límite se edita, el contentHash
   * cambia y hace falta otro sello (el anterior no se regenera).
   */
  async describeFreshness(periodStart: number, periodEnd: number): Promise<SealFreshness> {
    const latest = await latestPackForPeriod(periodStart, periodEnd);
    const sealedBeforePeriodEnd = !!latest && latest.manifest.sealedAtMs <= periodEnd;
    const base = { latestPackId: latest?.id ?? null, sealedBeforePeriodEnd };
    if (!isValidRange(periodStart, periodEnd)) return { ...base, liveContentHash: null, matches: !latest };
    try {
      const assembled = await assemblePeriod({ periodStart, periodEnd });
      if (!assembled.ok) return { ...base, liveContentHash: null, matches: !latest };
      const live = assembled.contentHash;
      const incident = await IntegrityLedgerService.getIncident();
      const matches = !incident && (!latest || (latest.manifest.contentHash != null && latest.manifest.contentHash === live));
      return { ...base, liveContentHash: live, matches };
    } catch (error) {
      LoggingService.log("NARANJA", "PAYROLL", "WARN", "No se pudo comparar el expediente", serializeError(error));
      return { ...base, liveContentHash: null, matches: false };
    }
  },

  async seal(input: { periodStart: number; periodEnd: number; allowUncertified?: boolean; reissue?: boolean }): Promise<SealResult> {
    // Periodo no finito (antes: NaN por dayjs tz en Hermes) → mensaje claro, no "No encontrado".
    if (!isValidRange(input.periodStart, input.periodEnd) || !periodIdAt(input.periodStart)) {
      return { ok: false, code: "INVALID_PERIOD" };
    }
    let attemptId: string | null = null;
    let committed = false;
    try {
      const settings = await SettingsService.load();
      const nowMs = TimeAuthorityService.now();
      // Verificación completa antes de cada sello (spec v1.3 §5.5).
      const chain = await IntegrityLedgerService.verify();
      if (!chain.valid) await IntegrityLedgerService.recordIncident(chain, nowMs);
      const ledgerIncident = await IntegrityLedgerService.getIncident();
      // Política por periodo (spec v1.3 §5.2 N3): un resello/reemisión de un periodo
      // sellado con v1 recalcula con v1; los no sellados usan la vigente.
      const assembled = await assemblePeriod(input);
      if (!assembled.ok) return assembled;
      const { statement, evidence, contentHash, included } = assembled;
      // No sellar tiempo que todavía no ha pasado. El techo es el mismo que
      // el de la escritura (hora de confianza + tolerancia), así que un cierre
      // en el minuto actual sigue pudiendo sellarse. No cambia el hash.
      const ceiling = TimeAuthorityService.futureCeiling();
      const endsAfterSeal = included.filter((s) => s.endAtMs !== null && s.endAtMs > ceiling).map((s) => s.id);
      if (endsAfterSeal.length) {
        return { ok: false, code: "SESSION_ENDS_AFTER_SEAL", detail: endsAfterSeal.join(",") };
      }
      if (statement.integrityRollup.hasConflict && !input.allowUncertified) return { ok: false, code: "PERIOD_HAS_CONFLICT" };
      if (!statement.integrityRollup.certified && !input.allowUncertified) return { ok: false, code: "PERIOD_NOT_CERTIFIABLE" };
      // Antes de reutilizar: un contentHash igual no absuelve una cadena rota.
      // contentHash no ata payload_json, así que el incidente manda.
      if (!chain.valid || ledgerIncident) {
        const breakAtId = ledgerIncident?.breakAtId ?? chain.brokenAtId;
        return { ok: false, code: "LEDGER_BROKEN", detail: `breakAtId=${breakAtId}` };
      }
      const previous = await latestPackForPeriod(input.periodStart, input.periodEnd);
      if (previous && previous.manifest.contentHash === contentHash && !input.reissue) {
        LoggingService.log("AZUL", "PAYROLL", "INFO", "Expediente reutilizado: mismo contenido", { packId: previous.id, contentHash });
        return { ok: true, data: previous, reused: true };
      }

      const packId = `${periodIdAt(input.periodStart, companyCalendar(settings.company))}-${Crypto.randomUUID().slice(0, 8)}`;
      const statementHash = await sha256Hex(canonicalJson({ ...statementForHash(statement), packHash: null }));
      const evidenceHash = await sha256Hex(canonicalJson(evidence));
      const certified = statement.integrityRollup.certified;
      const baseWarnings = await sealWarningsFor(statement.sessionIds);
      // La firma se decide antes del hash: si no hay llavero, PACK_UNSIGNED entra en packHash.
      const signingKeyReady = await canSignPacks();
      const sealWarnings = signingKeyReady ? baseWarnings : [...baseWarnings, { code: "PACK_UNSIGNED" as const, sessionIds: [] }];
      const sessionTimeZones = included.map((s) => ({
        sessionId: s.id,
        timeZone: s.bookkeeping.recordedTimeZone ?? companyTimezone(settings.company),
      }));
      const appVersion = APP_VERSION;
      const versionCode = readVersionCode();
      const gitCommit = readGitCommit();
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
        sealWarnings,
        appVersion,
        versionCode,
        gitCommit,
        sessionTimeZones,
      };
      const body = packHashBody(unsigned);
      const packHash = await computePackHash(unsigned);
      const signature = signingKeyReady ? await signCanonicalBody(body, packHash) : null;

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
        sealWarnings,
        ...(signature ? { signature } : {}),
        documentVersion: DOCUMENT_VERSION,
        documentTheme: settings.profile.comprobanteTheme === "dark" ? "dark" : "light",
        documentLocale: settings.profile.language === "en" ? "en" : "es",
        appVersion,
        versionCode,
        gitCommit,
        sessionTimeZones,
        files: [],
      };
      const sealedStatement = { ...statement, packHash };
      const ledgerRows = await PersistenceService.listLedger();
      const powerOffs = powerOffsFromLedger(ledgerRows).filter((n) => statement.sessionIds.includes(n.sessionId));
      const siteMoves = siteMovesFromLedger(ledgerRows);
      const reportInput = {
        statement: sealedStatement,
        evidence,
        manifest,
        sessions: included,
        sites: await PersistenceService.listSites({ includeArchived: true }),
        profile: settings.profile,
        company: settings.company,
        ...(powerOffs.length ? { powerOffs } : {}),
        ...(siteMoves.length ? { siteMoves } : {}),
      };

      attemptId = Crypto.randomUUID();
      const employee = await ReportService.renderPdf("EMPLOYEE_RECEIPT", reportInput, { destination: "attempt", attemptId });
      const employer = await ReportService.renderPdf("EMPLOYER_DOSSIER", reportInput, { destination: "attempt", attemptId });
      manifest.files = [
        { role: "EMPLOYEE_RECEIPT", name: employee.name },
        { role: "EMPLOYER_DOSSIER", name: employer.name },
        { role: "MANIFEST_JSON", name: `manifest_${packId}.json` },
      ];
      const manifestFile = ReportService.writeJson(packId, `manifest_${packId}`, canonicalJson({ manifest, statement: sealedStatement, evidence }), { attemptId });

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
        await PersistenceService.insertPack(pack, db);
        await OfflineQueueService.enqueue(packId, packHash, db);
      });
      committed = true;
      StoreActions.packUpserted(pack);
      return { ok: true, data: pack, reused: false };
    } catch (error) {
      if (attemptId && !committed) {
        try {
          ReportService.discardAttempt(attemptId);
        } catch {
          // El fallo del sello es el que se informa.
        }
      }
      LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "Fallo sellando expediente", serializeError(error));
      return { ok: false, code: "PERSISTENCE_ERROR", detail: serializeError(error) };
    }
  },

  /**
   * Verifica un pack recomputando todos sus hashes desde el contenido guardado.
   * v3: como v2 y packHash incluye además sealWarnings (FieldCrypto §15).
   * v2: statementHash, evidenceHash, contentHash y packHash (que incluye contentHash).
   * v1 (legado, sin contentHash): mismas comprobaciones salvo contentHash,
   * con el formato de packHash antiguo; se informa `legacy: true`.
   * `trust` es la verificación externa: una clave o huella que no sale del pack.
   * Sin ese argumento se usa la clave del llavero de este teléfono, si existe.
   * Si no hay ancla (ni llavero, ni `trust` usable), una firma que cuadra
   * criptográficamente no identifica al firmante.
   */
  async verify(pack: EvidencePack, trust?: PackTrustAnchor): Promise<PackVerification> {
    const m = pack.manifest;
    const legacy = m.manifestVersion === undefined && m.contentHash === undefined;
    const failures: string[] = [];
    if ((await sha256Hex(canonicalJson({ ...statementForHash(pack.statement), packHash: null }))) !== m.statementHash) failures.push("STATEMENT_HASH");
    if ((await sha256Hex(canonicalJson(pack.evidence))) !== m.evidenceHash) failures.push("EVIDENCE_HASH");
    if (!legacy && (await computeContentHash(pack.statement, pack.evidence)) !== m.contentHash) failures.push("CONTENT_HASH");
    const { packHash, files: _files, signature, ...rest } = m;
    const body = packHashBody(rest);
    if ((await sha256Hex(canonicalJson(body))) !== packHash) failures.push("PACK_HASH");
    if (pack.statement.packHash !== packHash) failures.push("STATEMENT_PACK_HASH");
    // v4 y v5. Sin firma solo vale si el propio packHash lleva PACK_UNSIGNED
    // (sello sin llavero). Quitar la firma y rehacer los hashes no basta.
    // La clave embebida en la firma no es un ancla: o es la del llavero de
    // este teléfono, o la que pasa quien verifica. No se compara con la clave
    // del código de aprovisionamiento: esa firma el PIN, no los packs.
    const version = m.manifestVersion ?? 0;
    const unsignedOnPurpose = (m.sealWarnings ?? []).some((w) => w.code === "PACK_UNSIGNED");
    let identity: PackVerification["identity"] = "unsigned";
    if (version >= 4 && signature) {
      if (!verifyCanonicalBody(body, packHash, signature)) failures.push("SIGNATURE");
      else if (trust) {
        const decision = trustDecision(signature.publicKey, trust);
        if (decision === "match") identity = "anchor";
        else if (decision === "mismatch") {
          failures.push("SIGNATURE_KEY");
          identity = "mismatch";
        } else identity = "unverified";
      } else {
        const pinned = await readPinnedPackSigningKey();
        if (!pinned) identity = "unverified";
        else if (signature.publicKey !== pinned.publicKey || signature.keyId !== pinned.keyId) {
          failures.push("SIGNATURE_KEY");
          identity = "mismatch";
        } else identity = "device";
      }
    } else if (version >= 4 && !unsignedOnPurpose) {
      failures.push("SIGNATURE_MISSING");
    }
    if (version >= 5) {
      const rows = pack.evidence.ledgerHashes;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (typeof row.prevHash !== "string" || typeof row.payloadJson !== "string") {
          failures.push("LEDGER_EXPORT");
          break;
        }
        if ((await chainHash(row.prevHash, row.payloadJson)) !== row.hash) {
          failures.push("LEDGER_HASH");
          break;
        }
        if (i > 0 && row.prevHash !== rows[i - 1].hash) {
          failures.push("LEDGER_LINK");
          break;
        }
      }
      const seal = await sessionSealFailure(rows, pack.evidence.sessionSeals, pack.statement.sessionIds);
      if (seal) failures.push(seal);
    }
    if (identity === "unverified") failures.push("IDENTITY_UNVERIFIED");
    // El libro se vuelve a aplicar y se compara con la fila viva. INCOMPLETE no
    // falla: un paso que no se puede repetir no es un desajuste de minutos.
    // No se reescribe la jornada ni el statement.
    try {
      const settings = await SettingsService.load();
      const live = await PersistenceService.listSessions({ includeDeleted: true });
      const wanted = live.filter((session) => pack.statement.sessionIds.includes(session.id));
      const replay = compareSessionsToLedger(wanted, await PersistenceService.listLedger(), settings.company, TimeAuthorityService.now());
      if (replay.some((finding) => finding.status === "MISMATCH")) failures.push("SESSION_REPLAY");
    } catch (error) {
      LoggingService.log("NARANJA", "PAYROLL", "WARN", "No se pudo reconstruir la jornada desde el libro", serializeError(error));
    }
    const signatureMathOk = version >= 4 && !!signature && !failures.includes("SIGNATURE");
    const identityNote =
      identity === "unverified"
        ? { es: MICROCOPY_REJECTIONS.es.IDENTITY_UNVERIFIED, en: MICROCOPY_REJECTIONS.en.IDENTITY_UNVERIFIED }
        : null;
    return {
      valid: failures.length === 0,
      legacy,
      scheme: signatureMathOk ? "Ed25519" : "unsigned-v1",
      failures,
      identity,
      identityNote,
    };
  },

  async get(packId: string): Promise<EvidencePack | null> {
    return PersistenceService.getPack(packId);
  },

  async list(): Promise<EvidencePack[]> {
    return PersistenceService.listPacks();
  },

  async shareEmployee(packId: string, annex?: ReportAnnexOptions): Promise<IntentResult> {
    const pack = await PersistenceService.getPack(packId);
    if (!pack?.employeePdfUri) return { ok: false, code: "PACK_NOT_FOUND" };
    const uri = await exportPdf(pack, "EMPLOYEE_RECEIPT", annex);
    if (!uri || !(await ReportService.share(uri))) return { ok: false, code: "SHARE_UNAVAILABLE" };
    await recordShared(packId, "EMPLOYEE");
    return { ok: true };
  },

  async shareEmployer(packId: string, annex?: ReportAnnexOptions): Promise<IntentResult> {
    const pack = await PersistenceService.getPack(packId);
    if (!pack?.employerPdfUri) return { ok: false, code: "PACK_NOT_FOUND" };
    const settings = await SettingsService.load();
    const pdf = await exportPdf(pack, "EMPLOYER_DOSSIER", annex);
    if (!pdf) return { ok: false, code: "SHARE_UNAVAILABLE" };
    const uris = [pdf, pack.manifestUri].filter((u): u is string => !!u);
    const sent = await ReportService.email(uris, settings.company.companyEmail, settings.profile.employeeName, packId);
    if (!sent) return { ok: false, code: "SHARE_UNAVAILABLE" };
    await recordShared(packId, "EMPLOYER");
    return { ok: true };
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
