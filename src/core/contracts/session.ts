/**
 * ============================================================================
 * CONTRATO: SessionRecord (Propuesta Técnica §9 — Fase 0, contrato congelado)
 * ============================================================================
 * Campos mínimos de la propuesta:
 *   id, declaredStartAtMs, actualStartAtMs, endAtMs, domainStatus, siteId,
 *   clientId, lunch, totalPausedMs, transitSegments[], integrityClass, policyId.
 *
 * Los campos adicionales viven agrupados en `bookkeeping` para no mezclar el
 * contrato mínimo con datos de soporte heredados de GEOTrack.
 */

/**
 * Máquina de siete estados (Propuesta de Producto §5.7, tabla estado → CTAs).
 * Equivalencias con el linaje GEOTrack (ver mappers.ts → mapLegacyStatus):
 *   NO_INICIADA ↔ IDLE (sin sesión abierta; estado de vista, nunca persistido)
 *   ESPERANDO   ↔ GEOFENCE_CREATED
 *   ACTIVA      ↔ ACTIVE_WORK
 *   PAUSADA     ↔ PAUSED
 *   TRASLADO    ↔ TRAVEL
 *   SALIDA      ↔ PENDING_EXIT_CONFIRMATION
 *   CERRADA     ↔ CLOSED
 */
export type SessionState =
  | "NO_INICIADA"
  | "ESPERANDO"
  | "ACTIVA"
  | "PAUSADA"
  | "TRASLADO"
  | "SALIDA"
  | "CERRADA";

/** Estados que puede tener un registro persistido (NO_INICIADA es solo de vista). */
export type SessionRecordStatus = Exclude<SessionState, "NO_INICIADA">;

/** Estados con jornada abierta (mutex: máximo una por dispositivo). */
export const OPEN_SESSION_STATES: readonly SessionRecordStatus[] = [
  "ESPERANDO",
  "ACTIVA",
  "PAUSADA",
  "TRASLADO",
  "SALIDA",
];

/**
 * Clases de integridad (Propuesta Técnica §5.3). No se degradan en silencio:
 * todo cambio de clase produce un LedgerEntry con motivo.
 */
export type IntegrityClass = "VALID" | "MANUAL" | "AUTO" | "CONFLICT";

/**
 * Motivos codificados que acompañan a una clase de integridad.
 * PENDING_EXIT, CLOCK_DRIFT, UNRELIABLE y OS_KILL vienen literalmente de la
 * propuesta; el resto son códigos de soporte.
 */
export type IntegrityReason =
  | "CLEAN"
  | "MANUAL_PATCH"
  | "AUTO_CLOSE_12H"
  | "AUTO_CLOSE_ABANDONMENT"
  | "EXIT_DECISION_EXPIRED"
  | "PENDING_EXIT"
  | "CLOCK_DRIFT"
  | "UNRELIABLE_FIX"
  | "OS_KILL"
  | "BACKGROUND_PERMISSION_MISSING"
  | "PROVIDER_LOSS"
  | "MUTEX_FAILED"
  | "OVERLAP"
  | "CONFLICT_RESOLVED"
  /** Cadena de hashes del ledger rota con la jornada abierta (spec FieldCrypto v1.3 §5.5). */
  | "LEDGER_CHAIN_BROKEN"
  /** Mitad de una sesión dividida con RESOLVE_SPLIT (spec v1.3 §5.4). */
  | "SESSION_SPLIT";

/** Almuerzo (línea explícita de nómina, Propuesta §5.2). */
export interface LunchRecord {
  taken: boolean;
  startAtMs: number | null;
  endAtMs: number | null;
  /** Minutos declarados en LunchModal al cerrar (0/30/45/60). */
  deductedMinutes: number | null;
}

/** Tramo de traslado entre sitios (TransitPolicy, Propuesta §5.6). */
export interface TransitSegment {
  id: string;
  fromSiteId: number | null;
  toSiteId: number;
  startAtMs: number;
  endAtMs: number | null;
  /** true si el operario canceló el traslado (no genera línea de tránsito). */
  cancelled: boolean;
  /** Decisión de TransitPolicy congelada al cerrar el tramo. */
  paid: boolean | null;
}

/** Horario original conservado ante una edición manual (Propuesta §5.3). */
export interface OriginalTimes {
  declaredStartAtMs: number;
  actualStartAtMs: number | null;
  endAtMs: number | null;
  capturedAtMs: number;
}

export interface SessionRecord {
  // ---- Contrato mínimo (§9) ----
  id: number;
  declaredStartAtMs: number;
  actualStartAtMs: number | null;
  endAtMs: number | null;
  domainStatus: SessionRecordStatus;
  siteId: number | null;
  clientId: string | null;
  lunch: LunchRecord;
  totalPausedMs: number;
  transitSegments: TransitSegment[];
  integrityClass: IntegrityClass;
  policyId: string;

  // ---- Soporte (no forma parte del contrato mínimo) ----
  bookkeeping: {
    /** YYYY-MM-DD en zona corporativa. */
    dateString: string;
    isDeleted: boolean;
    /** Cancelada antes de llegar (CANCEL_DAY desde ESPERANDO). No genera nómina. */
    cancelled: boolean;
    /** Inicio de una pausa NO-almuerzo en curso (ver sessionMachine). */
    lastPauseStartMs: number | null;
    /** Primera salida detectada (Propuesta §4.3: se registra la primera, no la última). */
    firstExitAtMs: number | null;
    /** true si la primera salida vino de un hecho espacial fiable. */
    firstExitReliable: boolean | null;
    /** Motivo de la clase de integridad actual. */
    integrityReason: IntegrityReason;
    /** Horario previo a la primera edición manual. null si nunca se editó. */
    original: OriginalTimes | null;
    /** Nota del operario / nota de auditoría de la última edición. */
    manualNote: string | null;
    /** Última modificación (TimeAuthority). */
    updatedAtMs: number;
    /**
     * Pausas no-almuerzo con horas (spec v1.3 §5.3, sessions.pauses_json).
     * Ausente = []. total_paused_ms se mantiene como suma derivada.
     */
    pauses?: PauseInterval[];
    /**
     * Origen de las pausas: RECORDED (registradas), LEDGER (reconstruidas del
     * ledger en la migración) o PRORATED (solo total → prorrateo con advertencia).
     */
    pausesSource?: PausesSource;
    /** MANUAL_PATCH recortó pausas/almuerzo fuera del nuevo intervalo (advertencia PAUSE_CLIPPED). */
    breaksClipped?: boolean;
    /** RESOLVE_SPLIT (spec v1.3 §5.4): id de la sesión original de la que salió esta mitad. */
    splitFromSessionId?: number;
    /**
     * FieldCrypto v1.3 §14: campos cifrados con un kid perdido (no legibles en
     * este dispositivo). Solo se hidrata; nunca se persiste ni se reescribe.
     */
    unreadableFields?: ("note" | "trace")[];
  };
}

/** Intervalo de pausa (spec v1.3 §5.3). endAtMs null = pausa en curso. */
export interface PauseInterval {
  startAtMs: number;
  endAtMs: number | null;
}
export type PausesSource = "RECORDED" | "LEDGER" | "PRORATED";

/** Borrador para crear una sesión (START_DAY). */
export interface NewSessionDraft {
  siteId: number;
  clientId: string | null;
  declaredStartAtMs: number;
  note: string | null;
}
