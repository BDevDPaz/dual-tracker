import type { PayrollStatement } from "./payroll";
import type { TraceSummary } from "./spatial";

/**
 * EvidencePack (Propuesta Técnica §5.10): expediente reproducible del periodo.
 * "Contiene: PayrollStatement, asientos del ledger, resumen de traza, hashes y policyId."
 */
export interface EvidenceSummary {
  ledgerEntryCount: number;
  ledgerHeadHash: string;
  ledgerChainValid: boolean;
  ledgerHashes: { id: number; sessionId: number | null; hash: string }[];
  traces: TraceSummary[];
  conflicts: { sessionId: number; reason: string }[];
}

/**
 * Versión del formato de manifiesto.
 *  - 1 (legado, sin campo): packHash = SHA-256 del manifiesto canónico sin contentHash.
 *  - 2: añade `contentHash` y lo incluye en packHash.
 *  - 3: añade `sealWarnings` (entra en packHash, no en contentHash).
 *  - 4: misma semántica de hashes que v3, más firma Ed25519 del cuerpo canónico.
 *    La firma NO entra en packHash ni en contentHash.
 */
export const PACK_MANIFEST_VERSION = 4;

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
