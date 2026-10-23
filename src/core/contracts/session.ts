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
 *   CUARENTENA  estado persistido de una fila cuyo domain_status no se reconoce.
 *               No es un estado de la máquina: no se entra por una intención.
 */
export type SessionState =
  | "NO_INICIADA"
  | "ESPERANDO"
  | "ACTIVA"
  | "PAUSADA"
  | "TRASLADO"
  | "SALIDA"
  | "CERRADA"
  | "CUARENTENA";

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
  /** Jornada abierta con notas/rastro de una clave perdida tras restaurar (FieldCrypto §14). */
  | "FIELD_CRYPTO_KEY_LOST"
  /** Mitad de una sesión dividida con RESOLVE_SPLIT (spec v1.3 §5.4). */
  | "SESSION_SPLIT"
  /** Ubicación en uso denegada: bloquea VALIDADA. */
  | "LOCATION_FOREGROUND_MISSING"
  /** Servicios de ubicación del sistema apagados: bloquea VALIDADA. */
  | "LOCATION_SERVICES_DISABLED"
  /** Servicio en primer plano parado con jornada abierta: bloquea VALIDADA. */
  | "FOREGROUND_SERVICE_STOPPED"
  /**
   * Jornada abierta sin heartbeat dentro del hueco y sin fix dentro del sitio.
   * Queda en Revisar. No se cierra sola ni se inventan horas.
   */
  | "ORPHAN_SESSION"
  /** El operario decidió seguir: la jornada sigue abierta, sin horas inventadas. */
  | "ORPHAN_CONTINUED"
  /** El operario confirmó la hora de fin, con nota. No es VALID. */
  | "ORPHAN_END_CONFIRMED"
  /**
   * El operario cerró una jornada que había recuperado tras un corte.
   * La clase sigue siendo MANUAL (no hay una quinta clase: byClass entra
   * en el statement). El comprobante la rotula «Recuperada», no «Cierre automático».
   */
  | "RECOVERED_CLOSED";

/** Almuerzo (línea explícita de nómina, Propuesta §5.2). */
export interface LunchRecord {
  taken: boolean;
  startAtMs: number | null;
  endAtMs: number | null;
  /** Minutos declarados en LunchModal al cerrar (0/30/45/60). */
  deductedMinutes: number | null;
  /** No fue libre de deber. No se descuenta y no cuenta como comida. */
  interrupted?: boolean;
}

/** Segunda comida u otro intervalo declarado aparte del almuerzo principal. */
export interface MealInterval {
  startAtMs: number | null;
  endAtMs: number | null;
  deductedMinutes?: number | null;
  interrupted?: boolean;
}

/**
 * Respuestas de comida y descanso de la jornada. Ausente si no hay ninguna:
 * no cambia el registro de una jornada que no las contestó.
 */
export interface PayrollCompliance {
  waiveFirstMeal?: boolean;
  waiveSecondMeal?: boolean;
  /** false = el operario dijo que no tomó el descanso. true = «Lo tomé». */
  restBreaksTaken?: boolean;
  mealInterrupted?: boolean;
  secondMeal?: MealInterval;
}

/** Tramo de traslado entre sitios (TransitPolicy, Propuesta §5.6). */
export interface TransitSegment {
  id: string;
  fromSiteId: number | null;
  toSiteId: number;
  startAtMs: number;
  endAtMs: number | null;
  /**
   * true si el operario canceló el traslado.
   * Un cancelado legado (`paid !== true`) no genera línea de tránsito.
   * Uno nuevo (`paid === true`) se paga como tránsito hasta `endAtMs`, a 1× y sin contar para extra.
   */
  cancelled: boolean;
  /** Nota opcional del cancelado (p. ej. «llamó el encargado»). No va en claro al ledger. */
  cancelNote?: string | null;
  /**
   * Decisión de TransitPolicy congelada al cerrar el tramo.
   * null = tramo abierto o legado (se aplica la política vigente de la empresa).
   * true/false ya no cambia si después se edita `transitPaid`.
   */
  paid: boolean | null;
  /** Congelados junto con `paid` cuando el tramo se cierra. Ausentes en tramos legados. */
  rateMultiplier?: number;
  countsTowardOvertime?: boolean;
  /** MANUAL_PATCH recortó este tramo al intervalo de la jornada. */
  clipped?: boolean;
  /**
   * El recorte lo dejó fuera de la jornada. No se paga hasta que
   * RESOLVE_KEEP_GPS deshace el clip. Ausente = no.
   */
  suppressed?: boolean;
  /**
   * Antes/después del recorte. RESOLVE_KEEP_GPS vuelve a `before`.
   * `after` null = el tramo quedó suprimido.
   */
  clip?: {
    beforeStartAtMs: number;
    beforeEndAtMs: number | null;
    afterStartAtMs: number | null;
    afterEndAtMs: number | null;
  } | null;
}

/** Horario original conservado ante una edición manual (Propuesta §5.3). */
export interface OriginalTimes {
  declaredStartAtMs: number;
  actualStartAtMs: number | null;
  endAtMs: number | null;
  capturedAtMs: number;
}

/** FieldCrypto v1.3 §10/§12: bloqueo de certificación (sessions.cert_blockers_json). */
export type CertificationBlocker = "FIELD_CRYPTO_UNAVAILABLE";

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
    /** YYYY-MM-DD en la zona en que se registró la jornada. */
    dateString: string;
    /**
     * Zona IANA con la que se calculó dateString. Ausente en jornadas
     * anteriores al campo: se leen como America/Los_Angeles.
     */
    recordedTimeZone?: string;
    /**
     * Tarifa por hora vigente al iniciar la jornada (schema v8). Ausente en
     * jornadas anteriores al campo: la nómina usa la tarifa actual de Ajustes
     * y añade la advertencia RATE_FALLBACK_CURRENT#<id>. Solo presente si se
     * conoce, para no alterar el contentHash de registros antiguos.
     */
    hourlyRateSnapshot?: number;
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
    /**
     * FieldCrypto v1.3 §12: bloqueos de certificación (permanentes). No son una
     * clase ni un motivo de CONFLICT. Solo presente si no está vacío.
     */
    certificationBlockers?: CertificationBlocker[];
    /** Comida, renuncias y descanso. Solo presente si el operario contestó algo. */
    compliance?: PayrollCompliance;
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
