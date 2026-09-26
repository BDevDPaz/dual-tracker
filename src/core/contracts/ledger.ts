import type { IntegrityClass, SessionRecordStatus, SessionState } from "./session";
import type { SessionIntentType } from "./intents";

/**
 * ============================================================================
 * CONTRATO: LedgerEntry (Propuesta Técnica §9)
 * ============================================================================
 * id, sessionId, prevHash, hash, actor (USER|GEOFENCE|WATCHDOG|SYSTEM),
 * intent, fromState, toState, reason, timestampMs.
 *
 * Extensiones documentadas:
 *  - payloadJson: el hash se calcula como sha256(prevHash + payload) (§5.3);
 *    sin guardar el payload el hash no sería verificable.
 *  - integrityClass: clase resultante tras el asiento (para leer la historia
 *    desde el ledger y no desde el último UPDATE).
 */
export type LedgerActor = "USER" | "GEOFENCE" | "WATCHDOG" | "SYSTEM";

/** Intenciones del motor + hechos de sistema que también se asientan. */
export type LedgerIntent =
  | SessionIntentType
  | "SPATIAL_FACT"
  | "OS_KILL"
  | "INTEGRITY_RECLASSIFIED"
  | "PAYROLL_SEALED";

export interface LedgerEntry {
  id: number;
  sessionId: number | null;
  prevHash: string;
  hash: string;
  actor: LedgerActor;
  intent: LedgerIntent;
  fromState: SessionState | SessionRecordStatus | null;
  toState: SessionState | SessionRecordStatus | null;
  reason: string;
  timestampMs: number;
  // Extensiones
  payloadJson: string;
  integrityClass: IntegrityClass | null;
}

/** Datos necesarios para crear un asiento (hash y prevHash los calcula el ledger). */
export type LedgerDraft = Omit<LedgerEntry, "id" | "prevHash" | "hash">;

export const GENESIS_HASH = "0".repeat(64);
