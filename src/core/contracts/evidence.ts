import type { PayrollStatement } from "./payroll";
import type { TraceSummary } from "./spatial";

/**
 * EvidencePack (Propuesta Técnica §5.10): expediente reproducible del periodo.
 * "Contiene: PayrollStatement, asientos del ledger, resumen de traza, hashes y policyId."
 */
/**
 * Un eslabón exportado. v5 añade `prevHash` y `payloadJson` para que un
 * tercero recompute `sha256(prevHash + payloadJson)` sin la base del teléfono.
 * El `prevHash` del primer eslabón es el ancla (puede no ser el génesis).
 */
export interface LedgerHashExport {
  id: number;
  sessionId: number | null;
  hash: string;
  prevHash?: string;
  payloadJson?: string;
}

/** Tramo de tránsito tal como quedó en la jornada, para el JSON y el anexo. */
export interface TransitSegmentExport {
  sessionId: number;
  id: string;
  fromSiteId: number | null;
  toSiteId: number;
  startAtMs: number;
  endAtMs: number | null;
  cancelled: boolean;
  paid: boolean;
  minutes: number;
  cancelNote?: string | null;
  clip?: {
    beforeStartAtMs: number;
    beforeEndAtMs: number | null;
    afterStartAtMs: number | null;
    afterEndAtMs: number | null;
  } | null;
}

export interface EvidenceSummary {
  ledgerEntryCount: number;
  ledgerHeadHash: string;
  ledgerChainValid: boolean;
  ledgerHashes: LedgerHashExport[];
  traces: TraceSummary[];
  conflicts: { sessionId: number; reason: string }[];
  /**
   * v5. Ausente en packs anteriores: el contentHash de esos packs no lo incluye.
   * Lista vacía si el periodo no tuvo traslados.
   */
  transitSegments?: TransitSegmentExport[];
  /**
   * Id forense por jornada (SESSION_SEALED). Ausente en packs anteriores:
   * el contentHash de esos packs no lo incluye. Lista vacía si ninguna jornada
   * del periodo se cerró con sello. No entra en la nómina.
   */
  sessionSeals?: SessionSealExport[];
  /**
   * Confianza de la ubicación por jornada. Ausente en packs anteriores:
   * no entra en su contentHash. Informativa: no cambia el pago.
   */
  locationTrust?: LocationTrustExport[];
  /**
   * Integridad del dispositivo al sellar. Ausente en packs anteriores.
   * null si no hubo lectura. No entra en la nómina.
   */
  deviceIntegrity?: DeviceIntegrityExport | null;
  /**
   * Cobertura de monitoreo por jornada. Ausente en packs anteriores:
   * no entra en su contentHash. Informativa: no cambia el pago.
   */
  monitoringCoverage?: MonitoringCoverageExport[];
  /**
   * Minutos reconstruidos desde el libro, comparados con la fila de la jornada.
   * Ausente en packs anteriores. Un desajuste no reescribe la nómina.
   */
  sessionReplay?: SessionReplayExport[];
}

export interface MonitoringCoverageExport {
  sessionId: number;
  spanMs: number;
  monitoredMs: number;
  unmonitoredMs: number;
  /** 0–100 con un decimal. null si la jornada no tiene duración. */
  coveragePercent: number | null;
}

export interface SessionReplayExport {
  sessionId: number;
  status: "MATCH" | "MISMATCH" | "INCOMPLETE" | "SKIPPED";
  stored: { workedMinutes: number; transitMinutes: number; breakMinutes: number } | null;
  ledger: { workedMinutes: number; transitMinutes: number; breakMinutes: number } | null;
}

export interface LocationTrustExport {
  sessionId: number;
  score: number;
  label: "EXCELLENT" | "GOOD" | "FAIR" | "SUSPICIOUS";
  penalties: {
    accuracy: number;
    mock: number;
    root: number;
    jumps: number;
    stability: number;
    gaps: number;
  };
}

export interface DeviceIntegrityExport {
  developerOptionsEnabled: boolean | null;
  emulator: boolean | null;
  emulatorHits: string[];
  rooted: boolean | null;
  rootHits: string[];
  isDevice: boolean | null;
  platform: string;
}

/** Sello de una jornada: SHA-256 de los hashes de sus asientos, en orden, sin este sello. */
export interface SessionSealExport {
  sessionId: number;
  sessionHash: string;
  /** Id del asiento SESSION_SEALED. */
  entryId: number;
}

/**
 * Versión del formato de manifiesto.
 *  - 1 (legado, sin campo): packHash = SHA-256 del manifiesto canónico sin contentHash.
 *  - 2: añade `contentHash` y lo incluye en packHash.
 *  - 3: añade `sealWarnings` (entra en packHash, no en contentHash).
 *  - 4: misma semántica de hashes que v3, más firma Ed25519 del cuerpo canónico.
 *    La firma NO entra en packHash ni en contentHash.
 *  - 5: añade al packHash la identidad del build (`appVersion`, `versionCode`,
 *    `gitCommit`) y la zona de cada sesión. No cambia el contentHash de un
 *    pack que no traiga `transitSegments` ni `prevHash` en los eslabones.
 */
export const PACK_MANIFEST_VERSION = 5;

/**
 * Versión de la plantilla del PDF. No entra en packHash ni en contentHash:
 * es presentación. Los packs ya sellados no traen el campo (se leen como v1,
 * la plantilla heredada). Los sellos nuevos escriben v3.
 *  - ausente o 1: HTML heredado, siempre en español.
 *  - 2: comprobante premium (claro por defecto, es/en al sellar).
 *  - 3: el mismo premium, más el anexo de tramos de tránsito y la identidad
 *    del build en el pie. Sigue fuera de packHash y contentHash.
 */
export const DOCUMENT_VERSION = 3;

export type DocumentTheme = "light" | "dark";

/** Contexto del dispositivo al sellar (entra en packHash, NO en contentHash). */
export interface SealWarning {
  code: "FIELD_CRYPTO_KEY_LOST" | "PACK_UNSIGNED";
  sessionIds: number[];
}

/**
 * Firma Ed25519 del manifiesto canónico (cuerpo de packHash + packHash).
 * No entra en packHash. Los packs anteriores, sin este bloque, son unsigned-v1.
 */
export interface PackSignature {
  algorithm: "Ed25519";
  keyId: string;
  /** Clave pública de 32 bytes, base64url. */
  publicKey: string;
  /** Firma detached de 64 bytes, base64url. */
  value: string;
}

export interface PackManifest {
  /** Ausente en packs legados (v1). */
  manifestVersion?: number;
  packId: string;
  periodStart: number;
  periodEnd: number;
  sealedAtMs: number;
  policyId: string;
  sessionIds: number[];
  statementHash: string;
  evidenceHash: string;
  /**
   * SHA-256 del contenido del periodo (statement sin packHash + evidencia de
   * sesiones), SIN campos volátiles del sello (packId, sealedAtMs, cabeza del
   * ledger, asientos de sello). Mismo contenido ⇒ mismo contentHash.
   * Ausente en packs legados (v1).
   */
  contentHash?: string;
  /** SHA-256 del manifiesto canónico (incluye contentHash en v2): identifica ESTE sello. */
  packHash: string;
  certified: boolean;
  /** v3+: advertencias del sello (vacío si no hay). Ausente en v1/v2. */
  sealWarnings?: SealWarning[];
  /** v4: firma del dispositivo. Ausente = unsigned-v1 (packs anteriores siguen siendo válidos). */
  signature?: PackSignature;
  /**
   * Plantilla del PDF (DOCUMENT_VERSION). Ausente en packs ya sellados.
   * No entra en packHash ni en contentHash.
   */
  documentVersion?: number;
  /** Tema con el que se pintó el PDF al sellar. Ausente = claro. Fuera del hash. */
  documentTheme?: DocumentTheme;
  /** Idioma con el que se pintó el PDF al sellar. Ausente = es. Fuera del hash. */
  documentLocale?: "es" | "en";
  /**
   * v5. Identidad del build y zona de cada sesión. Entran en packHash.
   * Ausentes en v1–v4: packHashBody no las pide y el sello viejo sigue verificando.
   */
  appVersion?: string | null;
  versionCode?: number | null;
  gitCommit?: string | null;
  sessionTimeZones?: { sessionId: number; timeZone: string }[];
  files: { role: "EMPLOYEE_RECEIPT" | "EMPLOYER_DOSSIER" | "MANIFEST_JSON"; name: string }[];
}

export interface EvidencePack {
  id: string;
  manifest: PackManifest;
  statement: PayrollStatement;
  evidence: EvidenceSummary;
  employeePdfUri: string | null;
  employerPdfUri: string | null;
  manifestUri: string | null;
  createdAtMs: number;
}

export type OfflineQueueStatus = "PENDING" | "SYNCED" | "FAILED";

export interface OfflineQueueItem {
  id: number;
  packId: string;
  status: OfflineQueueStatus;
  attempts: number;
  lastError: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  /** packHash con el que se enviará (clave de idempotencia). null si aún no se conoce. */
  idempotencyKey: string | null;
  /** No reintentar antes de este instante. null = se puede intentar ya. */
  nextAttemptAtMs: number | null;
}
