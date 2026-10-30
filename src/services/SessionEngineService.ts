import type {
  SessionRecord,
  DomainStatus,
  LedgerActor,
  IntegrityClass,
  IntegrityReasonCode,
  TransitSegment,
} from "../core/contracts/domain";
import { timeAuthorityService } from "./TimeAuthorityService";
import { concurrencyGuardService } from "./ConcurrencyGuardService";
import { persistenceService } from "./PersistenceService";
// NOTA: IntegrityLedgerService es propiedad de la Ola 4 (Propuesta 5.3). Se
// importa tal como está especificado por contrato compartido; si el archivo
// aún no existiera en el árbol al momento de compilar este módulo de forma
// aislada, otro ingeniero lo implementa en paralelo con exactamente esta
// forma (`integrityLedgerService.append(entry)` -> Promise<LedgerEntry>).
import { integrityLedgerService } from "./IntegrityLedgerService";
import { transitPolicyService } from "./TransitPolicyService";
import { CALIFORNIA_DAILY_OT_WEEKLY_40 } from "./PayrollEngineService";
import { traceRecorderService } from "./TraceRecorderService";

/**
 * ============================================================================
 * SessionEngineService — Propuesta 4.1
 * ----------------------------------------------------------------------------
 * "Sigue siendo el corazón del producto. Debe ser el único autorizado a
 * transicionar la máquina de siete estados y a abrir o cerrar destinos
 * dentro de una misma jornada."
 *
 * Reglas duras que este servicio hace cumplir:
 *  - Mutex de sesión: una sola jornada abierta por dispositivo. Iniciar una
 *    jornada nueva mientras hay una abierta se rechaza, salvo que la abierta
 *    ya exceda el tope de 12h, en cuyo caso se auto-cierra con integridad
 *    AUTO/CONFLICT (nunca VALID silencioso) antes de continuar.
 *  - Toda intención pasa por ConcurrencyGuardService.withLock(sessionId, ...)
 *    para rechazar condiciones de carrera entre notificación/modal/geocerca.
 *  - Todo timestamp de negocio proviene de TimeAuthorityService.
 *  - Toda transición se persiste vía PersistenceService y deja un asiento en
 *    IntegrityLedgerService (append-only, hash encadenado).
 *  - manualPatch preserva el horario GPS original la PRIMERA vez que se
 *    edita, exige nota no vacía y degrada la integridad a MANUAL.
 * ============================================================================
 */

/** Tope de jornada continua: 12 horas (Propuesta 4.1 / 7.3). */
const SESSION_CAP_MS = 12 * 60 * 60 * 1000;

const LOCK_HOLDER_PREFIX = "SessionEngineService";

/**
 * Clave de candado fija para el mutex de dispositivo de START_DAY: "una
 * sola jornada abierta por dispositivo" no tiene todavía un sessionId sobre
 * el cual bloquear antes de crear la fila, así que se serializa contra esta
 * clave global en vez de contra un id de sesión.
 */
const DEVICE_START_DAY_LOCK_KEY = "__DEVICE_START_DAY_MUTEX__";

/** Error tipado: la sesión solicitada no existe en persistencia. */
export class SessionNotFoundError extends Error {
  constructor(sessionId: number) {
    super(`SessionEngineService: session ${sessionId} no existe.`);
    this.name = "SessionNotFoundError";
  }
}

/** Error tipado: la transición de estado solicitada no es válida. */
export class SessionTransitionError extends Error {
  readonly from: DomainStatus;
  readonly to: DomainStatus;

  constructor(intent: string, from: DomainStatus, to: DomainStatus) {
    super(`SessionEngineService: transición inválida para "${intent}": ${from} -> ${to}.`);
    this.name = "SessionTransitionError";
    this.from = from;
    this.to = to;
  }
}

/** Error tipado: no puede haber dos jornadas abiertas en el mismo dispositivo. */
export class SessionAlreadyOpenError extends Error {
  readonly openSessionId: number;

  constructor(openSessionId: number) {
    super(
      `SessionEngineService: ya existe una jornada abierta (id=${openSessionId}); ` +
        "cierre esa jornada antes de iniciar una nueva.",
    );
    this.name = "SessionAlreadyOpenError";
    this.openSessionId = openSessionId;
  }
}

/** Error tipado: manualPatch exige una nota de auditoría no vacía. */
export class ManualPatchNoteRequiredError extends Error {
  constructor() {
    super("SessionEngineService.manualPatch requiere una nota de auditoría no vacía.");
    this.name = "ManualPatchNoteRequiredError";
  }
}

/** Máquina de siete estados: transiciones permitidas por intención. */
const ALLOWED_TRANSITIONS: Record<DomainStatus, DomainStatus[]> = {
  NO_INICIADA: ["GEOFENCE_CREATED"],
  GEOFENCE_CREATED: ["TRASLADO", "ACTIVA", "CERRADA"],
  TRASLADO: ["ACTIVA", "CERRADA"],
  ACTIVA: ["PAUSADA", "TRASLADO", "PENDING_EXIT_CONFIRMATION", "CERRADA"],
  PAUSADA: ["ACTIVA", "CERRADA"],
  PENDING_EXIT_CONFIRMATION: ["ACTIVA", "TRASLADO", "CERRADA"],
  CERRADA: [],
};

function assertTransition(intent: string, from: DomainStatus, to: DomainStatus): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new SessionTransitionError(intent, from, to);
  }
}

export interface StartDayInput {
  declaredStartAtMs?: number;
  siteId: string | null;
  clientId: string | null;
  policyId?: string;
}

export interface ManualPatchInput {
  startAtMs?: number;
  endAtMs?: number;
  note: string;
}

/** Resolución humana de un asiento CONFLICT (app/system/conflict.tsx). */
export type ConflictResolution = "KEEP_GPS" | "ACCEPT_MANUAL" | "SPLIT";

export interface ResolveConflictInput {
  resolution: ConflictResolution;
  note: string;
  /** Requerido solo para SPLIT: instante donde se corta la jornada. */
  splitAtMs?: number;
  /** ACCEPT_MANUAL: horario corregido (opcional; si se omite, conserva el actual). */
  correctedStartAtMs?: number;
  correctedEndAtMs?: number;
}

export interface ResolveConflictResult {
  original: SessionRecord;
  /** Presente solo cuando resolution === "SPLIT". */
  created: SessionRecord | null;
}

/** Error tipado: SPLIT exige un instante de corte dentro de la jornada. */
export class SplitPointRequiredError extends Error {
  constructor() {
    super(
      "SessionEngineService.resolveConflict(SPLIT) requiere splitAtMs dentro del rango de la jornada.",
    );
    this.name = "SplitPointRequiredError";
  }
}

class SessionEngineService {
  private lockHolder(origin: string): string {
    return `${LOCK_HOLDER_PREFIX}:${origin}`;
  }

  private async requireSession(sessionId: number): Promise<SessionRecord> {
    const session = await persistenceService.getSessionRecord(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }
    return session;
  }

  /**
   * Persiste la sesión y deja un asiento en el ledger para la transición.
   * Único punto interno de escritura de este servicio.
   */
  private syncBreadcrumb(sessionId: number, domainStatus: DomainStatus): void {
    try {
      if (domainStatus === "ACTIVA") traceRecorderService.startBreadcrumb(sessionId, "ACTIVA");
      else if (domainStatus === "TRASLADO")
        traceRecorderService.startBreadcrumb(sessionId, "TRASLADO");
      else traceRecorderService.stopBreadcrumb();
    } catch {}
  }

  private async persistAndLog(input: {
    session: SessionRecord;
    actor: LedgerActor;
    intent: string;
    fromState: DomainStatus | null;
    toState: DomainStatus | null;
    integrityClass: IntegrityClass;
    reasonCode: IntegrityReasonCode | null;
    reason: string | null;
    payload: Record<string, unknown>;
  }): Promise<SessionRecord> {
    const savedId = await persistenceService.saveSessionRecord(input.session);
    const persisted = { ...input.session, id: savedId };
    this.syncBreadcrumb(persisted.id, persisted.domainStatus);

    await integrityLedgerService.append({
      sessionId: persisted.id,
      actor: input.actor,
      intent: input.intent,
      fromState: input.fromState,
      toState: input.toState,
      integrityClass: input.integrityClass,
      reasonCode: input.reasonCode,
      reason: input.reason,
      timestampMs: timeAuthorityService.now(),
      payloadJson: JSON.stringify(input.payload),
    });

    return persisted;
  }

  /**
   * Si `session` sigue abierta y ya excedió SESSION_CAP_MS desde su inicio
   * real, la auto-cierra con integridad AUTO (nunca VALID silencioso) y
   * devuelve la versión cerrada. Si no aplica, devuelve `session` sin tocar.
   */
  private async enforceTwelveHourCap(session: SessionRecord): Promise<SessionRecord> {
    if (session.domainStatus === "CERRADA") {
      return session;
    }

    const referenceStartMs = session.actualStartAtMs ?? session.declaredStartAtMs;
    const nowMs = timeAuthorityService.now();

    if (nowMs - referenceStartMs <= SESSION_CAP_MS) {
      return session;
    }

    const closed: SessionRecord = {
      ...session,
      endAtMs: nowMs,
      domainStatus: "CERRADA",
      integrityClass: "AUTO",
    };

    return this.persistAndLog({
      session: closed,
      actor: "WATCHDOG",
      intent: "AUTO_CLOSE_SESSION_CAP",
      fromState: session.domainStatus,
      toState: "CERRADA",
      integrityClass: "AUTO",
      reasonCode: "SESSION_CAP_12H",
      reason: "Auto-cierre por tope de jornada de 12 horas.",
      payload: { sessionId: session.id, referenceStartMs, closedAtMs: nowMs },
    });
  }

  /**
   * START_DAY — crea una jornada nueva. Antes de crear, hace cumplir el
   * mutex "una sola jornada abierta por dispositivo": si existe otra sesión
   * no CERRADA, se auto-cierra (si excede 12h) o se rechaza explícitamente.
   */
  async startDay(input: StartDayInput): Promise<SessionRecord> {
    const holder = this.lockHolder("startDay");

    return concurrencyGuardService.withLock(DEVICE_START_DAY_LOCK_KEY, holder, async () => {
      const openSessions = await persistenceService.listSessionRecords({
        includeClosed: false,
      });

      for (const openSession of openSessions) {
        const afterCap = await this.enforceTwelveHourCap(openSession);

        if (afterCap.domainStatus !== "CERRADA") {
          throw new SessionAlreadyOpenError(afterCap.id);
        }
      }

      return this.createDay(input);
    });
  }

  private async createDay(input: StartDayInput): Promise<SessionRecord> {
    const nowMs = timeAuthorityService.now();
    const declaredStartAtMs = input.declaredStartAtMs ?? nowMs;

    const draft: SessionRecord = {
      id: -1,
      declaredStartAtMs,
      actualStartAtMs: null,
      endAtMs: null,
      domainStatus: "GEOFENCE_CREATED",
      siteId: input.siteId,
      clientId: input.clientId,
      lunch: { taken: false, startAtMs: null, endAtMs: null, deductedMinutes: null },
      totalPausedMs: 0,
      lastPauseStartMs: null,
      transitSegments: [],
      integrityClass: "VALID",
      policyId: input.policyId ?? CALIFORNIA_DAILY_OT_WEEKLY_40.policyId,
      isDeleted: false,
      isManualEdit: false,
      manualEditNote: null,
      originalActualStartAtMs: null,
      originalEndAtMs: null,
      dateString: timeAuthorityService.toDateString(declaredStartAtMs),
    };

    assertTransition("START_DAY", "NO_INICIADA", draft.domainStatus);

    return this.persistAndLog({
      session: draft,
      actor: "USER",
      intent: "START_DAY",
      fromState: "NO_INICIADA",
      toState: draft.domainStatus,
      integrityClass: "VALID",
      reasonCode: null,
      reason: null,
      payload: { siteId: input.siteId, clientId: input.clientId, declaredStartAtMs },
    });
  }

  /** ARRIVAL_CONFIRMED — cierra el traslado en curso (si lo hay) y activa la jornada. */
  async confirmArrival(
    sessionId: number,
    actualStartAtMs: number,
    source: LedgerActor,
  ): Promise<SessionRecord> {
    return concurrencyGuardService.withLock(
      String(sessionId),
      this.lockHolder("confirmArrival"),
      async () => {
        const session = await this.requireSession(sessionId);
        assertTransition("ARRIVAL_CONFIRMED", session.domainStatus, "ACTIVA");

        let transitSegments = session.transitSegments;
        let siteId = session.siteId;

        if (session.domainStatus === "TRASLADO") {
          const openSegment = [...transitSegments]
            .reverse()
            .find((segment) => segment.endAtMs === null);

          if (openSegment) {
            await persistenceService.updateTransitSegment(openSegment.id, {
              endAtMs: actualStartAtMs,
            });
            transitSegments = transitSegments.map((segment) =>
              segment.id === openSegment.id ? { ...segment, endAtMs: actualStartAtMs } : segment,
            );
            siteId = openSegment.toSiteId ?? siteId;
          }
        }

        const next: SessionRecord = {
          ...session,
          actualStartAtMs,
          domainStatus: "ACTIVA",
          siteId,
          transitSegments,
        };

        return this.persistAndLog({
          session: next,
          actor: source,
          intent: "ARRIVAL_CONFIRMED",
          fromState: session.domainStatus,
          toState: "ACTIVA",
          integrityClass: "VALID",
          reasonCode: source === "USER" ? "HUMAN_CONFIRMATION" : "CLEAN_ENTER_EXIT",
          reason: null,
          payload: { sessionId, actualStartAtMs, source },
        });
      },
    );
  }

  /** LUNCH_START — ACTIVA -> PAUSADA. */
  async startLunch(sessionId: number): Promise<SessionRecord> {
    return concurrencyGuardService.withLock(
      String(sessionId),
      this.lockHolder("startLunch"),
      async () => {
        const session = await this.requireSession(sessionId);
        assertTransition("LUNCH_START", session.domainStatus, "PAUSADA");

        const nowMs = timeAuthorityService.now();
        const next: SessionRecord = {
          ...session,
          domainStatus: "PAUSADA",
          lastPauseStartMs: nowMs,
          lunch: { ...session.lunch, taken: true, startAtMs: nowMs },
        };

        return this.persistAndLog({
          session: next,
          actor: "USER",
          intent: "LUNCH_START",
          fromState: session.domainStatus,
          toState: "PAUSADA",
          integrityClass: session.integrityClass,
          reasonCode: null,
          reason: null,
          payload: { sessionId, startAtMs: nowMs },
        });
      },
    );
  }

  /** LUNCH_END — PAUSADA -> ACTIVA. */
  async endLunch(sessionId: number, deductedMinutes: number): Promise<SessionRecord> {
    return concurrencyGuardService.withLock(
      String(sessionId),
      this.lockHolder("endLunch"),
      async () => {
        const session = await this.requireSession(sessionId);
        assertTransition("LUNCH_END", session.domainStatus, "ACTIVA");

        const nowMs = timeAuthorityService.now();
        const pauseElapsedMs = session.lastPauseStartMs ? nowMs - session.lastPauseStartMs : 0;

        const next: SessionRecord = {
          ...session,
          domainStatus: "ACTIVA",
          lastPauseStartMs: null,
          totalPausedMs: session.totalPausedMs + Math.max(0, pauseElapsedMs),
          lunch: { ...session.lunch, endAtMs: nowMs, deductedMinutes },
        };

        return this.persistAndLog({
          session: next,
          actor: "USER",
          intent: "LUNCH_END",
          fromState: session.domainStatus,
          toState: "ACTIVA",
          integrityClass: session.integrityClass,
          reasonCode: null,
          reason: null,
          payload: { sessionId, endAtMs: nowMs, deductedMinutes },
        });
      },
    );
  }

  /**
   * TRANSFER_START — inicia un traslado remunerado hacia `toSiteId`. Exige
   * destino declarado (TransitPolicyService.requireDestinationBeforeTransit).
   */
  async startTransit(sessionId: number, toSiteId: string): Promise<SessionRecord> {
    return concurrencyGuardService.withLock(
      String(sessionId),
      this.lockHolder("startTransit"),
      async () => {
        const session = await this.requireSession(sessionId);
        assertTransition("TRANSFER_START", session.domainStatus, "TRASLADO");

        transitPolicyService.requireDestinationBeforeTransit(toSiteId);

        const nowMs = timeAuthorityService.now();
        const segmentDraft = transitPolicyService.decideTransit({
          fromSiteId: session.siteId,
          toSiteId,
          startAtMs: nowMs,
          policy: CALIFORNIA_DAILY_OT_WEEKLY_40,
        });
        const segment: TransitSegment = { ...segmentDraft, sessionId };

        await persistenceService.insertTransitSegment(segment);

        const next: SessionRecord = {
          ...session,
          domainStatus: "TRASLADO",
          transitSegments: [...session.transitSegments, segment],
        };

        return this.persistAndLog({
          session: next,
          actor: "USER",
          intent: "TRANSFER_START",
          fromState: session.domainStatus,
          toState: "TRASLADO",
          integrityClass: session.integrityClass,
          reasonCode: null,
          reason: null,
          payload: { sessionId, toSiteId, segmentId: segment.id },
        });
      },
    );
  }

  /** EXIT_DETECTED — ACTIVA -> PENDING_EXIT_CONFIRMATION. Nunca cierra VALID por sí sola. */
  async exitDetected(
    sessionId: number,
    exitTimestampMs: number,
    source: LedgerActor,
  ): Promise<SessionRecord> {
    return concurrencyGuardService.withLock(
      String(sessionId),
      this.lockHolder("exitDetected"),
      async () => {
        const session = await this.requireSession(sessionId);
        assertTransition("EXIT_DETECTED", session.domainStatus, "PENDING_EXIT_CONFIRMATION");

        const next: SessionRecord = {
          ...session,
          domainStatus: "PENDING_EXIT_CONFIRMATION",
        };

        return this.persistAndLog({
          session: next,
          actor: source,
          intent: "EXIT_DETECTED",
          fromState: session.domainStatus,
          toState: "PENDING_EXIT_CONFIRMATION",
          integrityClass: session.integrityClass,
          reasonCode: null,
          reason: null,
          payload: { sessionId, exitTimestampMs, source },
        });
      },
    );
  }

  /** EXIT_RESOLVED_CONTINUE — el usuario declara "sigo trabajando". */
  async resolveExitContinue(sessionId: number): Promise<SessionRecord> {
    return concurrencyGuardService.withLock(
      String(sessionId),
      this.lockHolder("resolveExitContinue"),
      async () => {
        const session = await this.requireSession(sessionId);
        assertTransition("EXIT_RESOLVED_CONTINUE", session.domainStatus, "ACTIVA");

        const next: SessionRecord = { ...session, domainStatus: "ACTIVA" };

        return this.persistAndLog({
          session: next,
          actor: "USER",
          intent: "EXIT_RESOLVED_CONTINUE",
          fromState: session.domainStatus,
          toState: "ACTIVA",
          integrityClass: session.integrityClass,
          reasonCode: null,
          reason: null,
          payload: { sessionId },
        });
      },
    );
  }

  /**
   * CLOSE_DAY — cierra la jornada. El llamador declara `integrityClass` y,
   * si aplica, `reasonCode`; este servicio nunca sustituye un CONFLICT/AUTO
   * declarado por VALID, ni infiere VALID por defecto salvo cierre humano
   * explícito con actor USER.
   */
  async closeDay(
    sessionId: number,
    endAtMs: number,
    actor: LedgerActor,
    integrityClass: IntegrityClass,
    reasonCode: IntegrityReasonCode | null = null,
  ): Promise<SessionRecord> {
    return concurrencyGuardService.withLock(
      String(sessionId),
      this.lockHolder("closeDay"),
      async () => {
        const session = await this.requireSession(sessionId);
        assertTransition("CLOSE_DAY", session.domainStatus, "CERRADA");

        const next: SessionRecord = {
          ...session,
          endAtMs,
          domainStatus: "CERRADA",
          integrityClass,
        };

        return this.persistAndLog({
          session: next,
          actor,
          intent: "CLOSE_DAY",
          fromState: session.domainStatus,
          toState: "CERRADA",
          integrityClass,
          reasonCode,
          reason:
            reasonCode !== null ? `Cierre de jornada (${integrityClass}/${reasonCode}).` : null,
          payload: { sessionId, endAtMs, actor, integrityClass, reasonCode },
        });
      },
    );
  }

  /**
   * MANUAL_PATCH — edita startAtMs/endAtMs con nota obligatoria. Preserva
   * `originalActualStartAtMs`/`originalEndAtMs` SOLO la primera vez que se
   * edita (si ya existen valores originales, no se vuelven a sobreescribir:
   * el original siempre es el primer valor GPS/declarado, nunca la última
   * corrección). Nunca cambia `domainStatus`.
   */
  async manualPatch(sessionId: number, patch: ManualPatchInput): Promise<SessionRecord> {
    if (!patch.note || patch.note.trim().length === 0) {
      throw new ManualPatchNoteRequiredError();
    }

    return concurrencyGuardService.withLock(
      String(sessionId),
      this.lockHolder("manualPatch"),
      async () => {
        const session = await this.requireSession(sessionId);

        const isFirstManualEdit = !session.isManualEdit;

        const originalActualStartAtMs = isFirstManualEdit
          ? session.actualStartAtMs
          : session.originalActualStartAtMs;
        const originalEndAtMs = isFirstManualEdit ? session.endAtMs : session.originalEndAtMs;

        const next: SessionRecord = {
          ...session,
          actualStartAtMs: patch.startAtMs ?? session.actualStartAtMs,
          endAtMs: patch.endAtMs ?? session.endAtMs,
          isManualEdit: true,
          manualEditNote: patch.note,
          integrityClass: "MANUAL",
          originalActualStartAtMs,
          originalEndAtMs,
        };

        return this.persistAndLog({
          session: next,
          actor: "USER",
          intent: "MANUAL_PATCH",
          fromState: session.domainStatus,
          toState: session.domainStatus,
          integrityClass: "MANUAL",
          reasonCode: "MANUAL_EDIT",
          reason: patch.note,
          payload: {
            sessionId,
            startAtMs: patch.startAtMs ?? null,
            endAtMs: patch.endAtMs ?? null,
            note: patch.note,
          },
        });
      },
    );
  }

  /**
   * OS_KILL recovery — Propuesta §12 (criterio de aceptación): "Matar la
   * aplicación con jornada ACTIVA y reabrirla debe restaurar el mismo
   * SessionRecord, anotar OS_KILL en el ledger y no duplicar la sesión."
   *
   * Llamado por TaskOrchestratorService.heartbeat() a través de
   * bootWiring.runBootIntegritySweep() en cada arranque. No transiciona el
   * estado (el SessionRecord persistido en WAL ya es la verdad); solo
   * re-guarda la sesión sin cambios y anota un asiento de ledger. Idempotente
   * en el sentido de que si la sesión ya está CERRADA no hace nada.
   */
  async recoverFromOsKill(sessionId: number): Promise<SessionRecord> {
    return concurrencyGuardService.withLock(
      String(sessionId),
      this.lockHolder("recoverFromOsKill"),
      async () => {
        const session = await this.requireSession(sessionId);

        if (session.domainStatus === "CERRADA") {
          return session;
        }

        return this.persistAndLog({
          session,
          actor: "SYSTEM",
          intent: "OS_KILL_RECOVERED",
          fromState: session.domainStatus,
          toState: session.domainStatus,
          integrityClass: session.integrityClass,
          reasonCode: "OS_KILL_RECOVERED",
          reason:
            "Proceso terminado por el sistema operativo con jornada abierta; " +
            "estado restaurado desde persistencia al reabrir la app.",
          payload: { sessionId },
        });
      },
    );
  }

  /**
   * Resuelve un asiento CONFLICT (app/system/conflict.tsx, Propuesta capa
   * app §5.16). Cada decisión humana es una intención + un asiento nuevo en
   * el ledger; nunca se "descarta" un conflicto sin autor y sin nota.
   *
   * - KEEP_GPS: conserva el horario ya persistido (el hecho GPS original);
   *   la clase de integridad sube a VALID con reasonCode HUMAN_CONFIRMATION.
   * - ACCEPT_MANUAL: aplica una corrección de horario (o conserva el actual
   *   si no se pasa una), exige nota, clase MANUAL -- igual que manualPatch,
   *   pero con reasonCode explícito de resolución de conflicto.
   * - SPLIT: cierra la jornada actual en `splitAtMs` y abre una jornada
   *   nueva a partir de ese instante, en el mismo sitio/cliente, ya
   *   confirmada como ACTIVA. Nunca inventa un segundo motor de sesión: usa
   *   las mismas intenciones START_DAY + ARRIVAL_CONFIRMED internamente.
   */
  async resolveConflict(
    sessionId: number,
    input: ResolveConflictInput,
  ): Promise<ResolveConflictResult> {
    if (!input.note || input.note.trim().length === 0) {
      throw new ManualPatchNoteRequiredError();
    }

    return concurrencyGuardService.withLock(
      String(sessionId),
      this.lockHolder("resolveConflict"),
      async () => {
        const session = await this.requireSession(sessionId);

        if (input.resolution === "KEEP_GPS") {
          const resolved: SessionRecord = {
            ...session,
            integrityClass: "VALID",
          };
          const original = await this.persistAndLog({
            session: resolved,
            actor: "USER",
            intent: "RESOLVE_CONFLICT_KEEP_GPS",
            fromState: session.domainStatus,
            toState: session.domainStatus,
            integrityClass: "VALID",
            reasonCode: "HUMAN_CONFIRMATION",
            reason: input.note,
            payload: { sessionId },
          });
          return { original, created: null };
        }

        if (input.resolution === "ACCEPT_MANUAL") {
          const isFirstManualEdit = !session.isManualEdit;
          const resolved: SessionRecord = {
            ...session,
            actualStartAtMs: input.correctedStartAtMs ?? session.actualStartAtMs,
            endAtMs: input.correctedEndAtMs ?? session.endAtMs,
            isManualEdit: true,
            manualEditNote: input.note,
            integrityClass: "MANUAL",
            originalActualStartAtMs: isFirstManualEdit
              ? session.actualStartAtMs
              : session.originalActualStartAtMs,
            originalEndAtMs: isFirstManualEdit ? session.endAtMs : session.originalEndAtMs,
          };
          const original = await this.persistAndLog({
            session: resolved,
            actor: "USER",
            intent: "RESOLVE_CONFLICT_ACCEPT_MANUAL",
            fromState: session.domainStatus,
            toState: session.domainStatus,
            integrityClass: "MANUAL",
            reasonCode: "MANUAL_EDIT",
            reason: input.note,
            payload: { sessionId },
          });
          return { original, created: null };
        }

        // SPLIT
        const splitAtMs = input.splitAtMs;
        const referenceStartMs = session.actualStartAtMs ?? session.declaredStartAtMs;
        const referenceEndMs = session.endAtMs ?? timeAuthorityService.now();

        if (!splitAtMs || splitAtMs <= referenceStartMs || splitAtMs >= referenceEndMs) {
          throw new SplitPointRequiredError();
        }

        const closedOriginal: SessionRecord = {
          ...session,
          endAtMs: splitAtMs,
          domainStatus: "CERRADA",
          isManualEdit: true,
          manualEditNote: input.note,
          integrityClass: "MANUAL",
          originalActualStartAtMs: session.originalActualStartAtMs ?? session.actualStartAtMs,
          originalEndAtMs: session.originalEndAtMs ?? session.endAtMs,
        };

        const original = await this.persistAndLog({
          session: closedOriginal,
          actor: "USER",
          intent: "RESOLVE_CONFLICT_SPLIT_CLOSE_ORIGINAL",
          fromState: session.domainStatus,
          toState: "CERRADA",
          integrityClass: "MANUAL",
          reasonCode: "MANUAL_EDIT",
          reason: input.note,
          payload: { sessionId, splitAtMs },
        });

        const draft: SessionRecord = {
          id: -1,
          declaredStartAtMs: splitAtMs,
          actualStartAtMs: splitAtMs,
          endAtMs: session.endAtMs,
          domainStatus: "ACTIVA",
          siteId: session.siteId,
          clientId: session.clientId,
          lunch: { taken: false, startAtMs: null, endAtMs: null, deductedMinutes: null },
          totalPausedMs: 0,
          lastPauseStartMs: null,
          transitSegments: [],
          integrityClass: "MANUAL",
          policyId: session.policyId,
          isDeleted: false,
          isManualEdit: true,
          manualEditNote: `Continuación de la sesión #${sessionId} por división de conflicto: ${input.note}`,
          originalActualStartAtMs: null,
          originalEndAtMs: null,
          dateString: timeAuthorityService.toDateString(splitAtMs),
        };

        const created = await this.persistAndLog({
          session: draft,
          actor: "USER",
          intent: "RESOLVE_CONFLICT_SPLIT_CREATE_CONTINUATION",
          fromState: "NO_INICIADA",
          toState: "ACTIVA",
          integrityClass: "MANUAL",
          reasonCode: "MANUAL_EDIT",
          reason: input.note,
          payload: { splitFromSessionId: sessionId, splitAtMs },
        });

        return { original, created };
      },
    );
  }
}

/** Instancia única — autoridad de sesión canónica del proceso. */
export const sessionEngineService = new SessionEngineService();
