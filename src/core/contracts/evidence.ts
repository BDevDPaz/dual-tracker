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
 *  - 2: añade `contentHash` (hash de contenido estable entre sellos) y lo
 *    incluye en packHash, de modo que alterar el contenido rompe ambos.
 */
export const PACK_MANIFEST_VERSION = 2;

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
}
