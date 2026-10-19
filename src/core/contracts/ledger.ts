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
  | "PAYROLL_SEALED"
  // Spec FieldCrypto v1.3 §5.5: reconocimiento y exportación de una ruptura de cadena.
  | "LEDGER_BREAK_ACKNOWLEDGED"
  | "LEDGER_BREAK_EXPORTED"
  // §5.1: calendario laboral.
  | "CALENDAR_CHANGED"
  | "CALENDAR_CHANGE_CANCELLED"
  // §5.2: cambio de política de nómina.
  | "PAYROLL_POLICY_CHANGED"
  // FieldCrypto v1.3 §12 y §16.
  | "CERT_BLOCKER_ADDED"
  | "PACK_SHARED"
  /** Muestra de hora de red (deriva). No cierra la jornada. */
  | "CLOCK_SAMPLED"
  /** Expurgo de miga de pan tras exportar el periodo y cumplir la retención. */
  | "TRACE_PURGED";

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

/**
 * Incidente de cadena rota (spec v1.3 §5.5). Persistente en KV `ledger.broken`
 * hasta que el administrador lo reconoce con PIN.
 */
export interface LedgerIncident {
  /** Primer asiento que no verifica. */
  breakAtId: number;
  /** Último asiento válido (null si la ruptura está en el primer asiento). */
  lastGoodId: number | null;
  /** hash del último válido (GENESIS_HASH si lastGoodId es null). */
  lastGoodHash: string;
  /** prev_hash guardado en breakAtId. */
  observedPrevHash: string;
  /** hash guardado en breakAtId. */
  observedHash: string;
  /** sha256(prev esperado + payload guardado). */
  recomputedHash: string;
  detectedAtMs: number;
  headAtDetection: { id: number; hash: string };
}

/** Segmento de cadena verificado (spec v1.3 §5.5). */
export interface LedgerSegment {
  fromId: number | null;
  toId: number | null;
  /** Hash de anclaje: GENESIS_HASH en el segmento 1; observedHash de la ruptura en los siguientes. */
  anchor: string;
  valid: boolean;
}

export interface LedgerVerification {
  valid: boolean;
  /** Primer asiento roto NO reconocido (null si la cadena es íntegra o solo tiene rupturas reconocidas). */
  brokenAtId: number | null;
  head: string;
  segments: LedgerSegment[];
  /** Número de rupturas reconocidas (LEDGER_BREAK_ACKNOWLEDGED) aplicadas. */
  acknowledgedBreaks: number;
  /** Asientos en cuarentena (breakAtId de cada ruptura reconocida). */
  quarantinedIds: number[];
  /** Detalle de la ruptura no reconocida (base del incidente). */
  incident: Omit<LedgerIncident, "detectedAtMs"> | null;
}
