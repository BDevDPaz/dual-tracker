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
  | "TRACE_PURGED"
  /** El empleador dejó el PIN admin con un código de un solo uso. No guarda el PIN ni el hash. */
  | "ADMIN_PIN_PROVISIONED"
  /** Primera clave Ed25519 del empleador fijada tras huella o clave anclada. Solo el id, no la clave. */
  | "EMPLOYER_KEY_PINNED"
  /** La zona admin desbloqueada sustituyó la clave fijada. Solo ids. */
  | "EMPLOYER_KEY_REPINNED"
  /**
   * domain_status ilegible. La jornada queda en CUARENTENA, fuera de la nómina,
   * hasta que alguien la revise. El payload guarda el texto original.
   */
  | "SESSION_QUARANTINED"
  /** El servicio de ubicación no estaba en marcha con jornada abierta. */
  | "MONITORING_STOPPED_DETECTED"
  /** Un intento de relanzar el servicio. `data.success` dice si arrancó. */
  | "SERVICE_RECOVERY"
  /** Los intentos de relanzar se agotaron. Severidad HIGH. No cierra la jornada. */
  | "SERVICE_RECOVERY_FAILED"
  /** Hueco de monitoreo de al menos 5 min. No es la jornada huérfana (45 min). */
  | "MONITORING_GAP"
  /** startLocationUpdatesAsync no pudo arrancar. Severidad HIGH. */
  | "FOREGROUND_SERVICE_START_FAILED"
  /**
   * Cierre de la jornada: SHA-256 de los hashes de sus asientos, en orden.
   * No sustituye al asiento de cierre ni cambia la nómina.
   */
  | "SESSION_SEALED"
  /** Un permiso pasó a denegado o bloqueado. `data.permission` dice cuál. */
  | "PERMISSION_REVOKED"
  /** Un permiso pasó a concedido. `data.permission` dice cuál. */
  | "PERMISSION_GRANTED"
  /** Los servicios de ubicación del sistema se apagaron. */
  | "GPS_DISABLED"
  /** Los servicios de ubicación del sistema se encendieron. */
  | "GPS_ENABLED"
  /** El permiso de avisos dejó de estar concedido. */
  | "NOTIFICATION_DISABLED"
  /** Android puede restringir la app por batería. */
  | "BATTERY_OPTIMIZATION_ENABLED"
  /** La app quedó sin restricción de batería. */
  | "BATTERY_OPTIMIZATION_DISABLED"
  /** Anomalía operacional con severidad. `data.kind` dice cuál. No cambia la jornada. */
  | "ANOMALY"
  /** Se perdió la señal de ubicación con la jornada abierta. No es el GPS apagado. */
  | "GPS_LOST"
  /** Volvió una lectura después de GPS_LOST. */
  | "GPS_RESTORED"
  /**
   * Integridad del dispositivo (emulador, root, opciones de desarrollador).
   * Solo cuando cambia. No bloquea ni baja el pago.
   */
  | "DEVICE_INTEGRITY";

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
