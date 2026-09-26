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

export interface PackManifest {
  packId: string;
  periodStart: number;
  periodEnd: number;
  sealedAtMs: number;
  policyId: string;
  sessionIds: number[];
  statementHash: string;
  evidenceHash: string;
  /** SHA-256 del manifiesto canónico: el hash que ambas partes comparan. */
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
