/**
 * ============================================================================
 * CONTRATO: Auditoría de jornadas (PR3)
 * ============================================================================
 * Vista de solo lectura de lo que el teléfono YA registra de una jornada:
 * ledger de la sesión, el registro de la sesión, los huecos de la miga y el
 * sello SESSION_SEALED. No añade columnas ni escribe nada.
 *
 * Lo que no se registra se marca como tal (AuditNotRecorded) y no se rellena:
 *  - PRIOR_REASONS: el ledger solo guarda noteDigest; el texto legible es la
 *    última nota de la sesión (sessions.manual_note_sealed).
 *  - AUTHOR: el actor es USER, sin identidad de persona.
 *  - NOTIFICATION_CHANNEL: UI y NOTIFICATION se asientan los dos como USER.
 *  - GPS_LOSS_DURATION: GPS_LOST no lleva duración.
 */
import type { IntegrityClass, IntegrityReason, LunchRecord, PauseInterval, PausesSource, PayrollCompliance } from "./session";
import type { LedgerEntry, LedgerIntent } from "./ledger";

/** Origen del evento, derivado de actor + intent. */
export type AuditOrigin = "GEOFENCE" | "MANUAL" | "CORRECTION" | "SYSTEM";

export type AuditKind =
  | "START"
  | "ARRIVAL"
  | "EXIT"
  | "CONTINUE"
  | "CLOSE"
  | "CANCEL"
  | "SPATIAL"
  | "BREAK"
  | "TRANSFER"
  | "EDIT"
  | "NOTE"
  | "DELETE"
  | "RESOLUTION"
  | "INTEGRITY"
  | "AUTO_CLOSE"
  | "ORPHAN"
  | "EXTEND"
  | "SEAL"
  | "MONITORING"
  | "CLOCK"
  | "DEVICE"
  | "OTHER";

export type AuditNotRecorded = "PRIOR_REASONS" | "AUTHOR" | "NOTIFICATION_CHANNEL" | "GPS_LOSS_DURATION";

/** Nota del asiento: texto legible, solo huella (no registrado) o ninguna. */
export type AuditNote = { status: "READABLE"; text: string } | { status: "DIGEST_ONLY" } | { status: "NONE" };

export interface AuditTimes {
  declaredStartAtMs: number;
  actualStartAtMs: number | null;
  endAtMs: number | null;
}

export interface AuditRow {
  ledgerId: number;
  atMs: number;
  origin: AuditOrigin;
  kind: AuditKind;
  intent: LedgerIntent;
  /** reason del asiento, tal cual. */
  reason: string;
  /** Clase tras el asiento (null si el asiento no la lleva). */
  integrityClass: IntegrityClass | null;
  note: AuditNote;
  /** Datos del asiento que la vista muestra. Solo campos que existen. */
  detail: {
    /** SPATIAL / EXIT / ARRIVAL: hecho espacial (sin coordenadas). */
    factType?: string;
    reliable?: boolean;
    accuracyM?: number | null;
    unreliableReason?: string | null;
    mocked?: boolean;
    /** EDIT: horas antes y después de la edición. */
    before?: AuditTimes;
    after?: AuditTimes;
    clippedBreaks?: number;
    clippedTransits?: number;
    /** AUTO_CLOSE. */
    cause?: string;
    confirmedOutside?: boolean;
    /** CLOSE. */
    closeMode?: string;
    lunchDeductedMinutes?: number | null;
    /** MONITORING: hueco medido (MONITORING_GAP, OS_KILL). */
    gapMs?: number;
    deviceOffMs?: number;
    /** CLOCK_SAMPLED. */
    driftMs?: number;
    suspect?: boolean;
    /** SEAL. */
    eventCount?: number;
    sessionHash?: string;
    /** RESOLUTION (split). */
    newSessionId?: number;
    splitFrom?: number;
    splitAtMs?: number;
    /** Cambio de clase en este asiento. */
    conflictOpened?: boolean;
    conflictClosed?: boolean;
  };
  /** Datos que este asiento no tiene (se muestran como «no registrado»). */
  notRecorded: AuditNotRecorded[];
}

export interface AuditConflict {
  openedAtMs: number;
  openedLedgerId: number;
  reason: string;
  resolvedAtMs: number | null;
  resolvedLedgerId: number | null;
  resolvedBy: LedgerIntent | null;
}

export type AuditSealStatus = "OPEN" | "MISSING" | "OK" | "MISMATCH";
export type AuditChainStatus = "OK" | "BROKEN_IN_SESSION" | "BROKEN_ELSEWHERE";

export interface AuditTrailGap {
  kind: "retention" | "recording";
  fromMs: number;
  toMs: number;
}

/** Entradas del selector que hay que leer de forma asíncrona (useCases/sessionAudit). */
export interface SessionAuditInputs {
  ledger: LedgerEntry[];
  trailGaps: AuditTrailGap[];
  /** Hash recalculado de los asientos previos al último SESSION_SEALED; null si no hay sello. */
  recomputedSealHash: string | null;
  /** noteDigest de la última nota legible de la sesión; null si no hay nota o no se puede calcular. */
  latestNoteDigest: string | null;
  /** Asientos BACKUP_RESTORED (globales). */
  restores: LedgerEntry[];
}

export interface SessionAudit {
  sessionId: number;
  dateString: string;
  times: AuditTimes;
  arrival: { atMs: number; origin: AuditOrigin; manualArrival: boolean } | null;
  firstExit: { atMs: number; reliable: boolean | null } | null;
  lunch: LunchRecord;
  pauses: PauseInterval[];
  pausesSource: PausesSource;
  breaksClipped: boolean;
  compliance: PayrollCompliance | null;
  integrityClass: IntegrityClass;
  integrityReason: IntegrityReason;
  original: AuditTimes | null;
  latestNote: string | null;
  rows: AuditRow[];
  conflicts: AuditConflict[];
  counts: {
    edits: number;
    conflicts: number;
    resolved: number;
    autoCloses: number;
    monitoringGaps: number;
    osKills: number;
    gpsLosses: number;
    unreliableFacts: number;
    trailGaps: number;
  };
  /** eventsAfter: asientos de la jornada posteriores al último sello (p. ej. ediciones tras cerrar). */
  seal: { status: AuditSealStatus; atMs: number | null; eventCount: number | null; eventsAfter: number };
  chain: AuditChainStatus;
  trailGaps: AuditTrailGap[];
  /** Última restauración de copia posterior al inicio de la jornada. */
  restoredAtMs: number | null;
  /** Lo que esta jornada no tiene registrado (sin repetir). */
  notRecorded: AuditNotRecorded[];
}
