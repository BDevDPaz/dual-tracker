/**
 * ============================================================================
 * CONTRATOS CONGELADOS — Dual Tracker (Fase 0)
 * ----------------------------------------------------------------------------
 * Estos tipos son la única fuente de verdad para SessionRecord, SpatialFact,
 * LedgerEntry y PayrollStatement descritos en la Propuesta de Servicios Dual
 * Tracker (sección 9, "Contratos de datos mínimos").
 *
 * Regla de frontera: la geocerca no cierra la nómina; el PDF no calcula
 * overtime; la UI no escribe en SQLite. Todo servicio de dominio y de runtime
 * debe importar estos tipos en lugar de declarar sus propias formas locales.
 *
 * No se agregan campos ad hoc fuera de este archivo (Fase 0 del plan de
 * implementación). Un cambio de forma es un cambio de versión de contrato.
 * ============================================================================
 */

/** Máquina de siete estados del ciclo de vida de una jornada. */
export type DomainStatus =
  | "NO_INICIADA"
  | "GEOFENCE_CREATED"
  | "TRASLADO"
  | "ACTIVA"
  | "PAUSADA"
  | "PENDING_EXIT_CONFIRMATION"
  | "CERRADA";

/**
 * Clase de integridad de un asiento del ledger o de una sesión cerrada.
 * No se degradan en silencio: todo cambio de clase requiere un LedgerEntry
 * con `reason`.
 */
export type IntegrityClass = "VALID" | "MANUAL" | "AUTO" | "CONFLICT";

/** Motivo formal de degradación/():, usado por IntegrityLedgerService. */
export type IntegrityReasonCode =
  | "CLEAN_ENTER_EXIT"
  | "HUMAN_CONFIRMATION"
  | "MANUAL_EDIT"
  | "CLOCK_DRIFT"
  | "PERMISSION_REVOKED"
  | "PROVIDER_LOSS"
  | "MUTEX_REJECTED"
  | "SESSION_CAP_12H"
  | "OS_KILL_RECOVERED"
  | "EXIT_DECISION_EXPIRED"
  | "UNRELIABLE_ACCURACY"
  | "PENDING_EXIT_UNRESOLVED";

/** Un segmento de traslado remunerado entre dos sitios de la misma jornada. */
export interface TransitSegment {
  id: string;
  sessionId: number;
  fromSiteId: string | null;
  toSiteId: string | null;
  startAtMs: number;
  endAtMs: number | null;
  isPaid: boolean;
  countsForOvertime: boolean;
  policyId: string;
}

/**
 * SessionRecord — contrato canónico congelado.
 * Superset del `SessionRecord` legacy (src/core/contracts/types.ts) más los
 * campos exigidos por la propuesta: siteId/clientId, integrityClass,
 * transitSegments y policyId. El legacy se mapea 1:1 vía
 * `toLegacySessionRecord` / `fromLegacySessionRecord` en PersistenceService.
 */
export interface SessionRecord {
  id: number;
  declaredStartAtMs: number;
  actualStartAtMs: number | null;
  endAtMs: number | null;
  domainStatus: DomainStatus;
  siteId: string | null;
  clientId: string | null;
  lunch: {
    taken: boolean;
    startAtMs: number | null;
    endAtMs: number | null;
    deductedMinutes: number | null;
  };
  totalPausedMs: number;
  lastPauseStartMs: number | null;
  transitSegments: TransitSegment[];
  integrityClass: IntegrityClass;
  policyId: string;
  isDeleted: boolean;
  isManualEdit: boolean;
  manualEditNote: string | null;
  /** Horario GPS/declarado original, preservado aunque se edite manualmente. */
  originalActualStartAtMs: number | null;
  originalEndAtMs: number | null;
  dateString: string | null;
}

/** Tipos de hecho espacial que puede emitir GeofenceRuntime/TraceRecorder. */
export type SpatialFactType =
  "ENTER" | "EXIT" | "DWELL" | "BREADCRUMB" | "ACCURACY_DROP" | "PROVIDER_LOSS";

/**
 * SpatialFact — contrato canónico congelado.
 * Un hecho es inmutable una vez escrito; nunca se actualiza in place.
 */
export interface SpatialFact {
  id: string;
  sessionId: number | null;
  siteId: string | null;
  type: SpatialFactType;
  lat: number;
  lon: number;
  accuracyM: number;
  speedMps: number | null;
  altitudeM: number | null;
  battery: number | null;
  timestampMs: number;
  source: "gps" | "network" | "passive" | "unknown";
  /** false cuando accuracyM excede el radio del sitio: no puede producir VALID solo. */
  reliable: boolean;
}

/** Actor que originó un asiento del ledger. */
export type LedgerActor = "USER" | "GEOFENCE" | "WATCHDOG" | "SYSTEM";

/**
 * LedgerEntry — contrato canónico congelado.
 * Append-only, hash encadenado: hash = H(prevHash + payload canónico).
 */
export interface LedgerEntry {
  id: string;
  sessionId: number;
  prevHash: string | null;
  hash: string;
  actor: LedgerActor;
  intent: string;
  fromState: DomainStatus | null;
  toState: DomainStatus | null;
  integrityClass: IntegrityClass;
  reasonCode: IntegrityReasonCode | null;
  reason: string | null;
  timestampMs: number;
  /** Payload canónico serializado que produjo el hash (auditable, no PII cruda). */
  payloadJson: string;
}

/** Una línea de nómina ya resuelta por PayrollEngineService. */
export interface PayrollLine {
  kind:
    | "REGULAR"
    | "OVERTIME_DAILY"
    | "OVERTIME_WEEKLY"
    | "LUNCH_UNPAID"
    | "TRANSIT_PAID"
    | "DEDUCTION";
  sessionId: number | null;
  minutes: number;
  rate: number;
  amount: number;
  description: string;
}

/**
 * PayrollStatement — contrato canónico congelado.
 * Salida única y versionada de PayrollEngineService. El PDF (ReportService)
 * solo renderiza este objeto; nunca recalcula.
 */
export interface PayrollStatement {
  id: string;
  periodStart: number;
  periodEnd: number;
  lines: PayrollLine[];
  regularHours: number;
  overtimeHours: number;
  transitHours: number;
  lunchMinutes: number;
  grossEstimate: number;
  /** Resumen de integridad del periodo: cuenta por clase (VALID/MANUAL/AUTO/CONFLICT). */
  integrityRollup: Record<IntegrityClass, number>;
  policyId: string;
  /** SHA-256 del statement canónico; compartido entre PDF empleado/empleador. */
  packHash: string;
  generatedAtMs: number;
}

/** Política de nómina versionada — nunca reescribe historial cerrado. */
export interface PayrollPolicy {
  policyId: string;
  label: string;
  dailyOvertimeThresholdMinutes: number;
  weeklyOvertimeThresholdMinutes: number;
  overtimeMultiplier: number;
  hourlyRate: number;
  transitIsPaidByDefault: boolean;
  lunchIsUnpaid: boolean;
  effectiveFromMs: number;
}

/** Sitio/cliente del catálogo de SiteRegistryService. */
export interface Site {
  id: string;
  alias: string;
  clientId: string | null;
  clientName: string | null;
  address: string;
  targetLatitude: number;
  targetLongitude: number;
  radiusMeters: number;
  isActive: boolean;
  createdAtMs: number;
}

/** Paquete reproducible de evidencia (EvidencePackService). */
export interface EvidencePack {
  id: string;
  periodStart: number;
  periodEnd: number;
  statement: PayrollStatement;
  ledgerEntryIds: string[];
  traceSummary: {
    siteId: string;
    dwellMinutes: number;
  }[];
  manifestSha256: string;
  policyId: string;
  generatedAtMs: number;
}

/** Estado de "modo de rastro" mostrado al usuario (DualDisclosureService). */
export type TraceMode = "RASTRO_ACTIVO" | "SOLO_GEOCERCA" | "SIN_UBICACION";

/** Tarea de segundo plano reconocida por TaskOrchestratorService. */
export type BackgroundTaskName =
  | "GEOFENCE"
  | "BREADCRUMB"
  | "SESSION_WATCHDOG"
  | "EXIT_DECISION_TIMER"
  | "DAILY_REMINDER"
  | "INTEGRITY_SWEEP"
  | "PAYROLL_EXPORT";
