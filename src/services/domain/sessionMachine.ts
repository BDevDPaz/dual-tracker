/**
 * Máquina de siete estados de la jornada — función PURA.
 * ============================================================================
 * Única definición de transiciones legales. Solo SessionEngineService la
 * invoca (Propuesta Técnica §2: "Solo SessionEngine muta el ciclo de vida").
 *
 * Origen: guardas de transición del reducer de GEOTrack
 * (src/core/reducer/index.ts) + reglas de edición de W Tracker
 * (src/domain/sessionEngine.ts: hasTimeChanged / requiresAuditNote).
 * La regla demo de W Tracker "00:00 = solape" NO se porta: el solape real lo
 * calcula PersistenceService.checkOverlap y llega aquí como ctx.overlap.
 *
 * No lee el reloj ni toca SQLite: todo llega por `ctx`.
 */
import type {
  CompanyPolicy,
  FeedbackCode,
  IntegrityClass,
  IntegrityReason,
  IntentRejection,
  LedgerActor,
  SessionIntent,
  SessionRecord,
  SessionRecordStatus,
  SessionState,
  TransitSegment,
  PauseInterval,
} from "../../core/contracts";
import { companyCalendar } from "../../utils/companyPolicy";
import { nextWorkdayBoundary, workdayDateString } from "../../utils/dateUtils";
import { siteCheckedInBefore } from "./siteVisits";
import { fixedLunchExceedsSession, isFutureInstant, lunchOutsideSession, sessionSpanMinutes, FUTURE_TIME_TOLERANCE_MS } from "./sessionTimeGuard";
import { TransitPolicyService } from "./TransitPolicyService";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface TransitionContext {
  nowMs: number;
  /**
   * Último instante anotable (hora de confianza + tolerancia). Si falta, es
   * nowMs más la tolerancia: el reloj de la transición es el del dispositivo.
   */
  notAfterMs?: number;
  actor: LedgerActor;
  policyId: string;
  company: CompanyPolicy;
  disclosureAccepted: boolean;
  /** Sin background location o con deriva de reloj: no puede haber VALID. */
  degradedReason: IntegrityReason | null;
  /** Resultado de PersistenceService.checkOverlap (solo MANUAL_PATCH). */
  overlap?: boolean;
  /** RESOLVE_SPLIT: ¿cada mitad solapa con otra sesión? (spec v1.3 §5.4). */
  splitOverlap?: { a: boolean; b: boolean };
  /** El sitio destino existe y está activo. */
  siteExists?: (siteId: number) => boolean;
  /** Hay par ENTER/EXIT fiable para la sesión (RESOLVE_KEEP_GPS). */
  cleanGpsPair?: boolean;
  /** Generador de ids de tramo. */
  newId: () => string;
}

export type EngineEffect =
  | { type: "SYNC_RUNTIME"; sessionId: number; status: SessionRecordStatus; geofenceSiteId: number | null }
  | { type: "SCHEDULE_EXIT_DECISION"; sessionId: number; firstExitAtMs: number }
  | { type: "CANCEL_EXIT_DECISION"; sessionId: number };

export type TransitionOutcome =
  | {
      ok: true;
      next: SessionRecord;
      isNew: boolean;
      from: SessionState;
      to: SessionRecordStatus;
      reason: string;
      effects: EngineEffect[];
      feedback: FeedbackCode | null;
      /** Datos adicionales para el asiento del ledger (p. ej. recortes de pausas). */
      ledgerExtra?: Record<string, unknown>;
      /** Registro adicional a insertar en la misma transacción (RESOLVE_SPLIT: la mitad B). */
      extra?: SessionRecord;
    }
  | { ok: false; code: IntentRejection; detail?: string };

// ---------------------------------------------------------------------------
// Integridad: nunca se degrada en silencio y nunca "mejora" sin resolución
// ---------------------------------------------------------------------------

/**
 * Severidad para escalar clases. TODO(propuesta): el orden relativo AUTO vs
 * MANUAL no está definido; se asume MANUAL > AUTO porque implica intervención
 * humana sobre el horario.
 */
const SEVERITY: Record<IntegrityClass, number> = { VALID: 0, AUTO: 1, MANUAL: 2, CONFLICT: 3 };

export function escalate(
  current: { cls: IntegrityClass; reason: IntegrityReason },
  candidate: { cls: IntegrityClass; reason: IntegrityReason },
): { cls: IntegrityClass; reason: IntegrityReason } {
  return SEVERITY[candidate.cls] > SEVERITY[current.cls] ? candidate : current;
}

function withIntegrity(s: SessionRecord, cls: IntegrityClass, reason: IntegrityReason): SessionRecord {
  const r = escalate({ cls: s.integrityClass, reason: s.bookkeeping.integrityReason }, { cls, reason });
  return { ...s, integrityClass: r.cls, bookkeeping: { ...s.bookkeeping, integrityReason: r.reason } };
}

// ---------------------------------------------------------------------------
// Reglas de edición (portadas de W Tracker)
// ---------------------------------------------------------------------------

export function hasTimeChanged(s: SessionRecord, start: number, end: number | null): boolean {
  const currentStart = s.actualStartAtMs ?? s.declaredStartAtMs;
  return currentStart !== start || s.endAtMs !== end;
}

export function requiresAuditNote(s: SessionRecord, start: number, end: number | null, note: string): boolean {
  return hasTimeChanged(s, start, end) && !(note ?? "").trim();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OPEN: readonly SessionRecordStatus[] = ["ESPERANDO", "ACTIVA", "PAUSADA", "TRASLADO", "SALIDA"];

function reject(code: IntentRejection, detail?: string): TransitionOutcome {
  return { ok: false, code, detail };
}

function openSegment(s: SessionRecord): TransitSegment | undefined {
  return s.transitSegments.find((t) => t.endAtMs === null && !t.cancelled);
}

/** Cierra el tramo abierto y congela la decisión de TransitPolicy de ese instante. */
function closeOpenSegment(s: SessionRecord, atMs: number, company: CompanyPolicy, cancelled = false): TransitSegment[] {
  return s.transitSegments.map((t) => {
    if (t.endAtMs !== null || t.cancelled) return t;
    if (cancelled) return { ...t, endAtMs: atMs, cancelled: true, paid: false, rateMultiplier: 0, countsTowardOvertime: false };
    const d = TransitPolicyService.decide({ ...t, paid: null, cancelled: false }, company);
    return {
      ...t,
      endAtMs: atMs,
      cancelled: false,
      paid: d.paid,
      rateMultiplier: d.paid ? d.rateMultiplier : 0,
      countsTowardOvertime: d.paid && d.countsTowardOvertime,
    };
  });
}

function sync(s: SessionRecord, geofenceSiteId: number | null): EngineEffect {
  return { type: "SYNC_RUNTIME", sessionId: s.id, status: s.domainStatus, geofenceSiteId };
}

function touch(s: SessionRecord, nowMs: number): SessionRecord {
  return { ...s, bookkeeping: { ...s.bookkeeping, updatedAtMs: nowMs } };
}

function notAfter(ctx: TransitionContext): number {
  return ctx.notAfterMs ?? ctx.nowMs + FUTURE_TIME_TOLERANCE_MS;
}

function future(ts: number | null | undefined, ctx: TransitionContext): boolean {
  return isFutureInstant(ts, notAfter(ctx));
}

/**
 * Cierre hecho por el operario. Un cierre automático de verdad (12 h o
 * abandono) no pasa por aquí. Si la clase quedó AUTO por otra vía —seguir
 * tras un corte, o conservar GPS sin par limpio— el operario está cerrando:
 * eso es MANUAL. Recuperar un corte se rotula RECOVERED_CLOSED. No se baja
 * un CONFLICT.
 */
function labelUserClose(next: SessionRecord): SessionRecord {
  if (next.integrityClass === "CONFLICT") return next;
  const reason = next.bookkeeping.integrityReason;
  if (reason === "ORPHAN_CONTINUED") {
    return {
      ...next,
      integrityClass: "MANUAL",
      bookkeeping: { ...next.bookkeeping, integrityReason: "RECOVERED_CLOSED" },
    };
  }
  if (next.integrityClass === "AUTO" && reason !== "AUTO_CLOSE_12H" && reason !== "AUTO_CLOSE_ABANDONMENT") {
    return { ...next, integrityClass: "MANUAL", bookkeeping: { ...next.bookkeeping, integrityReason: reason } };
  }
  return next;
}

function ok(
  prev: SessionRecord | null,
  next: SessionRecord,
  ctx: TransitionContext,
  reason: string,
  effects: EngineEffect[],
  feedback: FeedbackCode | null,
): TransitionOutcome {
  // Entorno degradado (deriva de reloj / sin background) durante una jornada
  // abierta: ninguna transición del ciclo de vida puede dejarla VALID (§7.3,
  // Propuesta de calidad §9 "deriva 4 min marca CLOCK_DRIFT y bloquea VALID").
  // Antes solo START_DAY aplicaba ctx.degradedReason y un CLOSE_DAY con el
  // reloj manipulado cerraba VALID. Las acciones sobre jornadas ya CERRADAS
  // (patch, resolve, delete) no se ven afectadas.
  // MARK_ORPHAN fija el motivo ORPHAN_SESSION a propósito: un sensor degradado
  // no lo pisa. Una resolución del operario (seguir tras el corte, aceptar el
  // ajuste, confirmar el fin) tampoco se deshace en la misma transición: si no,
  // un servicio parado vuelve a dejar la jornada en Revisar y el primer toque
  // no surte efecto. El resto de transiciones sí escalan si el entorno bloquea VALID.
  if (
    ctx.degradedReason &&
    prev &&
    OPEN.includes(prev.domainStatus) &&
    reason !== "ORPHAN_SESSION" &&
    reason !== "ORPHAN_CONTINUED" &&
    reason !== "ORPHAN_END_CONFIRMED" &&
    reason !== "RESOLVE_MANUAL"
  ) {
    next = withIntegrity(next, "CONFLICT", ctx.degradedReason);
  }
  return {
    ok: true,
    next: touch(next, ctx.nowMs),
    isNew: prev === null,
    from: prev ? prev.domainStatus : "NO_INICIADA",
    to: next.domainStatus,
    reason,
    effects,
    feedback,
  };
}

/** Cierra la pausa abierta de pauses_json (spec v1.3 §5.3). */
function closeOpenPause(s: SessionRecord, atMs: number): PauseInterval[] {
  return (s.bookkeeping.pauses ?? []).map((p) => (p.endAtMs === null ? { ...p, endAtMs: Math.max(p.startAtMs, atMs) } : p));
}

/** Cierre común: cierra almuerzo/pausa/tramo abiertos y fija endAtMs. */
function closeRecord(s: SessionRecord, endMs: number, company: CompanyPolicy): SessionRecord {
  const lunch =
    s.lunch.startAtMs && !s.lunch.endAtMs ? { ...s.lunch, endAtMs: endMs } : s.lunch;
  const pauseExtra = s.bookkeeping.lastPauseStartMs ? Math.max(0, endMs - s.bookkeeping.lastPauseStartMs) : 0;
  return {
    ...s,
    domainStatus: "CERRADA",
    endAtMs: endMs,
    lunch,
    totalPausedMs: s.totalPausedMs + pauseExtra,
    transitSegments: closeOpenSegment(s, endMs, company),
    bookkeeping: { ...s.bookkeeping, lastPauseStartMs: null, pauses: closeOpenPause(s, endMs) },
  };
}

type ClippedBreak = { kind: "LUNCH" | "PAUSE"; before: { startAtMs: number; endAtMs: number }; after: { startAtMs: number; endAtMs: number } | null };
type ClippedTransit = { id: string; before: { startAtMs: number; endAtMs: number }; after: { startAtMs: number; endAtMs: number } | null };

/**
 * MANUAL_PATCH (spec v1.3 §5.3): recorta almuerzo y pausas al nuevo intervalo.
 * Lo que queda fuera se descarta y se devuelve para el asiento del ledger.
 */
function clipBreaks(s: SessionRecord, start: number, end: number): { next: SessionRecord; clipped: ClippedBreak[] } {
  const clipped: ClippedBreak[] = [];
  const clip = (a: number, b: number) => {
    const ns = Math.max(a, start);
    const ne = Math.min(b, end);
    return ne > ns ? { startAtMs: ns, endAtMs: ne } : null;
  };
  let lunch = s.lunch;
  if (lunch.startAtMs && lunch.endAtMs) {
    const after = clip(lunch.startAtMs, lunch.endAtMs);
    if (!after || after.startAtMs !== lunch.startAtMs || after.endAtMs !== lunch.endAtMs) {
      clipped.push({ kind: "LUNCH", before: { startAtMs: lunch.startAtMs, endAtMs: lunch.endAtMs }, after });
      lunch = after
        ? { ...lunch, startAtMs: after.startAtMs, endAtMs: after.endAtMs, deductedMinutes: lunch.deductedMinutes === null ? null : Math.round((after.endAtMs - after.startAtMs) / 60000) }
        : { ...lunch, startAtMs: null, endAtMs: null, deductedMinutes: 0 };
    }
  }
  let pauses = s.bookkeeping.pauses ?? [];
  let totalPausedMs = s.totalPausedMs;
  if (pauses.length && s.bookkeeping.pausesSource !== "PRORATED") {
    const kept: PauseInterval[] = [];
    for (const p of pauses) {
      const pe = p.endAtMs ?? end;
      const after = clip(p.startAtMs, pe);
      if (!after || after.startAtMs !== p.startAtMs || after.endAtMs !== pe) clipped.push({ kind: "PAUSE", before: { startAtMs: p.startAtMs, endAtMs: pe }, after });
      if (after) kept.push(after);
    }
    if (clipped.some((c) => c.kind === "PAUSE")) {
      pauses = kept;
      totalPausedMs = kept.reduce((a, p) => a + ((p.endAtMs ?? p.startAtMs) - p.startAtMs), 0);
    }
  }
  if (!clipped.length) return { next: s, clipped };
  return {
    next: { ...s, lunch, totalPausedMs, bookkeeping: { ...s.bookkeeping, pauses, breaksClipped: true } },
    clipped,
  };
}

/**
 * MANUAL_PATCH: recorta tramos de tránsito al nuevo intervalo. Lo que queda
 * totalmente fuera se descarta (el asiento guarda el antes/después).
 */
function clipTransits(s: SessionRecord, start: number, end: number): { next: SessionRecord; clipped: ClippedTransit[] } {
  const clipped: ClippedTransit[] = [];
  const kept: TransitSegment[] = [];
  let changed = false;
  for (const t of s.transitSegments) {
    if (t.cancelled) {
      kept.push(t);
      continue;
    }
    const tEnd = t.endAtMs ?? end;
    const ns = Math.max(t.startAtMs, start);
    const ne = Math.min(tEnd, end);
    const after = ne > ns ? { startAtMs: ns, endAtMs: ne } : null;
    if (!after || after.startAtMs !== t.startAtMs || after.endAtMs !== tEnd) {
      changed = true;
      clipped.push({ id: t.id, before: { startAtMs: t.startAtMs, endAtMs: tEnd }, after });
    }
    if (!after) continue;
    if (after.startAtMs === t.startAtMs && after.endAtMs === t.endAtMs) kept.push(t);
    else kept.push({ ...t, startAtMs: after.startAtMs, endAtMs: after.endAtMs, clipped: true });
  }
  if (!changed) return { next: s, clipped: [] };
  return { next: { ...s, transitSegments: kept }, clipped };
}

/**
 * RESOLVE_SPLIT (spec v1.3 §5.4). A conserva su id con end = splitAtMs; B es
 * nueva desde splitAtMs hasta el fin original. Almuerzo, pausas y tránsito van
 * a la mitad donde ocurrieron (el tránsito se corta en el punto); un almuerzo
 * declarado sin horas y las pausas PRORATED se reparten por duración.
 * Invariantes: A.end = B.start; neto y deducciones A + B = original.
 */
function splitSession(
  s: SessionRecord,
  at: number,
  ctx: TransitionContext,
  note: string,
): { a: SessionRecord; b: SessionRecord } | { code: IntentRejection; detail?: string } {
  const start = s.actualStartAtMs ?? s.declaredStartAtMs;
  const end = s.endAtMs!;
  const MINUTE = 60_000;
  if (!Number.isFinite(at) || at < start + MINUTE || at > end - MINUTE) return { code: "INVALID_TIMES", detail: "SPLIT_OUT_OF_RANGE" };
  const inside = (a: number | null, b: number | null) => a !== null && b !== null && a < at && at < b;
  const pauses = s.bookkeeping.pauses ?? [];
  if (inside(s.lunch.startAtMs, s.lunch.endAtMs) || pauses.some((p) => inside(p.startAtMs, p.endAtMs ?? end))) {
    return { code: "SPLIT_INSIDE_BREAK" };
  }
  // Ambas mitades siguen solapando con otra sesión → la división no resuelve
  // nada y crea un solape nuevo (B) → OVERLAP. Interpretación documentada.
  if (ctx.splitOverlap?.a && ctx.splitOverlap?.b) return { code: "OVERLAP", detail: "SPLIT_KEEPS_BOTH_OVERLAPPING" };

  const wA = at - start;
  const wB = end - at;
  const shareA = (total: number) => {
    // Reparto por duración: floor para B y el resto a A (A + B = total).
    const b = Math.floor((total * wB) / (wA + wB));
    return total - b;
  };

  // Almuerzo
  let lunchA = s.lunch;
  let lunchB: SessionRecord["lunch"] = { taken: false, startAtMs: null, endAtMs: null, deductedMinutes: null };
  if (s.lunch.startAtMs !== null && s.lunch.endAtMs !== null) {
    if (s.lunch.startAtMs >= at) {
      lunchB = s.lunch;
      lunchA = { taken: false, startAtMs: null, endAtMs: null, deductedMinutes: null };
    }
  } else if (s.lunch.deductedMinutes !== null && s.lunch.deductedMinutes > 0) {
    const a = shareA(s.lunch.deductedMinutes);
    lunchA = { ...s.lunch, deductedMinutes: a, taken: a > 0 };
    lunchB = { ...s.lunch, deductedMinutes: s.lunch.deductedMinutes - a, taken: s.lunch.deductedMinutes - a > 0 };
    if (fixedLunchExceedsSession(lunchA, start, at) || fixedLunchExceedsSession(lunchB, at, end)) {
      return { code: "INVALID_TIMES", detail: "LUNCH_EXCEEDS_SESSION" };
    }
  }

  // Pausas
  const pausesA = pauses.filter((p) => p.startAtMs < at);
  const pausesB = pauses.filter((p) => p.startAtMs >= at);
  const sum = (ps: PauseInterval[]) => ps.reduce((acc, p) => acc + ((p.endAtMs ?? end) - p.startAtMs), 0);
  let totalA: number;
  if (s.bookkeeping.pausesSource === "PRORATED" || !pauses.length) {
    totalA = shareA(s.totalPausedMs);
  } else {
    const residual = Math.max(0, s.totalPausedMs - sum(pauses));
    totalA = sum(pausesA) + shareA(residual);
  }
  const totalB = s.totalPausedMs - totalA;

  // Tránsito (cortado en el punto)
  const transitA: TransitSegment[] = [];
  const transitB: TransitSegment[] = [];
  for (const t of s.transitSegments) {
    const tEnd = t.endAtMs ?? end;
    if (tEnd <= at) transitA.push(t);
    else if (t.startAtMs >= at) transitB.push(t);
    else {
      transitA.push({ ...t, endAtMs: at });
      transitB.push({ ...t, id: `${t.id}-b`, startAtMs: at });
    }
  }

  const fe = s.bookkeeping.firstExitAtMs;
  const feInB = fe !== null && fe >= at;
  // A termina en `at` (exclusivo): si el traslado es posterior, A sigue en el origen.
  const siteAtSplit = siteCheckedInBefore(s, at);
  const halfIntegrity = (overlaps: boolean) =>
    overlaps ? { integrityClass: "CONFLICT" as const, reason: "OVERLAP" as const } : { integrityClass: "MANUAL" as const, reason: "SESSION_SPLIT" as const };
  const ia = halfIntegrity(!!ctx.splitOverlap?.a);
  const ib = halfIntegrity(!!ctx.splitOverlap?.b);
  const original = s.bookkeeping.original ?? { declaredStartAtMs: s.declaredStartAtMs, actualStartAtMs: s.actualStartAtMs, endAtMs: s.endAtMs, capturedAtMs: ctx.nowMs };

  const a: SessionRecord = {
    ...s,
    siteId: siteAtSplit,
    endAtMs: at,
    lunch: lunchA,
    totalPausedMs: totalA,
    transitSegments: transitA,
    integrityClass: ia.integrityClass,
    bookkeeping: {
      ...s.bookkeeping,
      pauses: pausesA,
      firstExitAtMs: feInB ? null : fe,
      firstExitReliable: feInB ? null : s.bookkeeping.firstExitReliable,
      integrityReason: ia.reason,
      original,
      manualNote: note,
    },
  };
  const b: SessionRecord = {
    ...s,
    id: 0,
    declaredStartAtMs: at,
    actualStartAtMs: at,
    endAtMs: end,
    lunch: lunchB,
    totalPausedMs: totalB,
    transitSegments: transitB,
    integrityClass: ib.integrityClass,
    bookkeeping: {
      ...s.bookkeeping,
      dateString: workdayDateString(at, companyCalendar(ctx.company)),
      pauses: pausesB,
      firstExitAtMs: feInB ? fe : null,
      firstExitReliable: feInB ? s.bookkeeping.firstExitReliable : null,
      integrityReason: ib.reason,
      original: null,
      splitFromSessionId: s.id,
      breaksClipped: s.bookkeeping.breaksClipped,
      manualNote: note,
    },
  };
  return { a, b };
}

// ---------------------------------------------------------------------------
// Transición
// ---------------------------------------------------------------------------

/**
 * @param open    Jornada abierta del dispositivo (o null).
 * @param target  Sesión objetivo para intenciones con sessionId (patch, delete, resolve…).
 */
export function transition(
  open: SessionRecord | null,
  intent: SessionIntent,
  ctx: TransitionContext,
  target: SessionRecord | null = null,
): TransitionOutcome {
  const now = ctx.nowMs;

  switch (intent.type) {
    // ------------------------------------------------------------ START_DAY
    case "START_DAY": {
      if (open) return reject("SESSION_ALREADY_OPEN");
      // DualDisclosure §5.11: "Sin aceptación, no se inicia ESPERANDO."
      if (!ctx.disclosureAccepted) return reject("DISCLOSURE_NOT_ACCEPTED");
      if (!intent.siteId) return reject("SITE_REQUIRED");
      if (ctx.siteExists && !ctx.siteExists(intent.siteId)) return reject("SITE_NOT_FOUND");

      let record: SessionRecord = {
        id: 0, // lo asigna SQLite
        declaredStartAtMs: now,
        actualStartAtMs: null,
        endAtMs: null,
        domainStatus: "ESPERANDO",
        siteId: intent.siteId,
        clientId: intent.clientId ?? null,
        lunch: { taken: false, startAtMs: null, endAtMs: null, deductedMinutes: null },
        totalPausedMs: 0,
        transitSegments: [],
        integrityClass: "VALID",
        policyId: ctx.policyId,
        bookkeeping: {
          // Jornada de inicio bajo el calendario vigente (spec v1.3 §5.1 / §5.2 N4).
          dateString: workdayDateString(now, companyCalendar(ctx.company)),
          isDeleted: false,
          cancelled: false,
          lastPauseStartMs: null,
          firstExitAtMs: null,
          firstExitReliable: null,
          integrityReason: "CLEAN",
          original: null,
          manualNote: intent.note ?? null,
          updatedAtMs: now,
        },
      };
      if (ctx.degradedReason) record = withIntegrity(record, "CONFLICT", ctx.degradedReason);
      return ok(null, record, ctx, "DAY_STARTED", [sync(record, record.siteId)], "DAY_STARTED");
    }

    // ------------------------------------------------------------ CANCEL_DAY
    case "CANCEL_DAY": {
      if (!open) return reject("NO_OPEN_SESSION");
      if (open.domainStatus !== "ESPERANDO") return reject("ILLEGAL_TRANSITION");
      const next: SessionRecord = {
        ...open,
        domainStatus: "CERRADA",
        endAtMs: now,
        bookkeeping: { ...open.bookkeeping, cancelled: true },
      };
      return ok(open, next, ctx, "CANCELLED_BEFORE_ARRIVAL", [sync(next, null)], "DAY_CANCELLED");
    }

    // ------------------------------------------------------------ ARRIVAL_CONFIRMED
    case "ARRIVAL_CONFIRMED": {
      if (!open) return reject("NO_OPEN_SESSION");
      if (open.domainStatus !== "ESPERANDO" && open.domainStatus !== "TRASLADO") {
        return reject("ILLEGAL_TRANSITION");
      }
      // Un ENTER no fiable no hace check-in automático: queda para confirmación humana.
      if (ctx.actor === "GEOFENCE" && intent.fact && !intent.fact.reliable) {
        return reject("UNRELIABLE_FACT", intent.fact.reason ?? undefined);
      }
      const at = intent.fact?.timestampMs ?? now;
      const seg = openSegment(open);
      const next: SessionRecord = {
        ...open,
        domainStatus: "ACTIVA",
        actualStartAtMs: open.actualStartAtMs ?? at,
        siteId: seg ? seg.toSiteId : open.siteId,
        transitSegments: closeOpenSegment(open, at, ctx.company),
        bookkeeping: { ...open.bookkeeping, firstExitAtMs: null, firstExitReliable: null },
      };
      const reason = ctx.actor === "GEOFENCE" ? "AUTO_CHECKIN_GEOFENCE_ENTRY" : "MANUAL_ARRIVAL_CONFIRMED";
      return ok(open, next, ctx, reason, [sync(next, next.siteId)], ctx.actor === "GEOFENCE" ? "AUTO_CHECKIN" : "ARRIVAL_CONFIRMED");
    }

    // ------------------------------------------------------------ LUNCH_START
    case "LUNCH_START": {
      if (!open) return reject("NO_OPEN_SESSION");
      // El hub de salida ofrece "Iniciar almuerzo" en SALIDA. El almuerzo
      // empieza en la primera salida (el mismo instante que usa el traslado)
      // y se anula el temporizador para que esa salida no cierre el día.
      if (open.domainStatus !== "ACTIVA" && open.domainStatus !== "SALIDA") return reject("ILLEGAL_TRANSITION");
      const fromExit = open.domainStatus === "SALIDA";
      const at = fromExit && open.bookkeeping.firstExitAtMs ? open.bookkeeping.firstExitAtMs : now;
      if (future(at, ctx)) return reject("FUTURE_TIME");
      const cleared = fromExit ? { firstExitAtMs: null, firstExitReliable: null } : {};
      // Primera pausa = almuerzo (línea explícita). Pausas siguientes = pausa genérica.
      const next: SessionRecord = open.lunch.taken
        ? {
            ...open,
            domainStatus: "PAUSADA",
            bookkeeping: {
              ...open.bookkeeping,
              ...cleared,
              lastPauseStartMs: at,
              pauses: [...(open.bookkeeping.pauses ?? []), { startAtMs: at, endAtMs: null }],
            },
          }
        : {
            ...open,
            domainStatus: "PAUSADA",
            lunch: { ...open.lunch, taken: true, startAtMs: at, endAtMs: null },
            bookkeeping: { ...open.bookkeeping, ...cleared },
          };
      const effects: EngineEffect[] = [sync(next, next.siteId)];
      if (fromExit) effects.push({ type: "CANCEL_EXIT_DECISION", sessionId: open.id });
      return ok(open, next, ctx, open.lunch.taken ? "PAUSE_STARTED" : "LUNCH_STARTED", effects, "LUNCH_STARTED");
    }

    // ------------------------------------------------------------ RESUME
    case "RESUME": {
      if (!open) return reject("NO_OPEN_SESSION");
      if (open.domainStatus !== "PAUSADA") return reject("ILLEGAL_TRANSITION");
      let next: SessionRecord;
      if (open.lunch.startAtMs && !open.lunch.endAtMs) {
        const sessionStart = open.actualStartAtMs ?? open.declaredStartAtMs;
        if (future(now, ctx)) return reject("FUTURE_TIME");
        if (now <= open.lunch.startAtMs) return reject("INVALID_TIMES", "END_NOT_AFTER_START");
        if (lunchOutsideSession(sessionStart, now, open.lunch.startAtMs, now)) return reject("INVALID_TIMES", "LUNCH_OUTSIDE_SESSION");
        next = { ...open, domainStatus: "ACTIVA", lunch: { ...open.lunch, endAtMs: now } };
      } else {
        const extra = open.bookkeeping.lastPauseStartMs ? Math.max(0, now - open.bookkeeping.lastPauseStartMs) : 0;
        next = {
          ...open,
          domainStatus: "ACTIVA",
          totalPausedMs: open.totalPausedMs + extra,
          bookkeeping: { ...open.bookkeeping, lastPauseStartMs: null, pauses: closeOpenPause(open, now) },
        };
      }
      return ok(open, next, ctx, "USER_RESUMED_WORK", [sync(next, next.siteId)], "RESUMED");
    }

    // ------------------------------------------------------------ TRANSFER_START
    case "TRANSFER_START": {
      if (!open) return reject("NO_OPEN_SESSION");
      if (open.domainStatus !== "ACTIVA" && open.domainStatus !== "SALIDA") return reject("ILLEGAL_TRANSITION");
      // TransitPolicy §5.6: exige destino configurado antes de iniciar trayecto.
      if (!intent.toSiteId || intent.toSiteId === open.siteId) return reject("SITE_REQUIRED");
      if (ctx.siteExists && !ctx.siteExists(intent.toSiteId)) return reject("SITE_NOT_FOUND");
      // El trayecto empieza en la primera salida si venimos de SALIDA.
      const startAt = open.domainStatus === "SALIDA" && open.bookkeeping.firstExitAtMs ? open.bookkeeping.firstExitAtMs : now;
      if (future(startAt, ctx)) return reject("FUTURE_TIME");
      const seg: TransitSegment = {
        id: ctx.newId(),
        fromSiteId: open.siteId,
        toSiteId: intent.toSiteId,
        startAtMs: startAt,
        endAtMs: null,
        cancelled: false,
        paid: null,
      };
      const next: SessionRecord = {
        ...open,
        domainStatus: "TRASLADO",
        transitSegments: [...open.transitSegments, seg],
        bookkeeping: { ...open.bookkeeping, firstExitAtMs: null, firstExitReliable: null },
      };
      return ok(open, next, ctx, "WORK_CONTINUITY_TRANSFER", [sync(next, intent.toSiteId), { type: "CANCEL_EXIT_DECISION", sessionId: open.id }], "TRANSFER_STARTED");
    }

    // ------------------------------------------------------------ TRANSFER_CANCEL
    case "TRANSFER_CANCEL": {
      if (!open) return reject("NO_OPEN_SESSION");
      if (open.domainStatus !== "TRASLADO") return reject("ILLEGAL_TRANSITION");
      // TODO(propuesta): el efecto de nómina del tramo cancelado no está definido;
      // se marca cancelled (no genera línea TRANSIT) y el tiempo cuenta como jornada.
      const next: SessionRecord = { ...open, domainStatus: "ACTIVA", transitSegments: closeOpenSegment(open, now, ctx.company, true) };
      return ok(open, next, ctx, "TRANSFER_CANCELLED", [sync(next, next.siteId)], "TRANSFER_CANCELLED");
    }

    // ------------------------------------------------------------ EXIT_DETECTED
    case "EXIT_DETECTED": {
      if (!open) return reject("NO_OPEN_SESSION");
      if (open.domainStatus !== "ACTIVA") return reject("ILLEGAL_TRANSITION");
      // §4.3: se registra la PRIMERA salida, no la última.
      const firstExit = open.bookkeeping.firstExitAtMs ?? intent.fact.timestampMs;
      const next: SessionRecord = {
        ...open,
        domainStatus: "SALIDA",
        bookkeeping: {
          ...open.bookkeeping,
          firstExitAtMs: firstExit,
          firstExitReliable: open.bookkeeping.firstExitReliable ?? intent.fact.reliable,
        },
      };
      return ok(
        open,
        next,
        ctx,
        intent.fact.reliable ? "VALID_EXIT_CONFIRMED" : "UNRELIABLE_EXIT",
        [sync(next, next.siteId), { type: "SCHEDULE_EXIT_DECISION", sessionId: open.id, firstExitAtMs: firstExit }],
        "EXIT_DETECTED",
      );
    }

    // ------------------------------------------------------------ STAY_WORKING
    case "STAY_WORKING": {
      if (!open) return reject("NO_OPEN_SESSION");
      if (open.domainStatus !== "SALIDA") return reject("ILLEGAL_TRANSITION");
      // La salida no cierra VALID si el usuario elige "sigo trabajando" (§12).
      // El ledger conserva el EXIT original; el registro vuelve a ACTIVA.
      const next: SessionRecord = {
        ...open,
        domainStatus: "ACTIVA",
        bookkeeping: { ...open.bookkeeping, firstExitAtMs: null, firstExitReliable: null },
      };
      return ok(open, next, ctx, "USER_CONFIRMED_CONTINUE", [sync(next, next.siteId), { type: "CANCEL_EXIT_DECISION", sessionId: open.id }], "STAY_WORKING");
    }

    // ------------------------------------------------------------ CLOSE_DAY
    case "CLOSE_DAY": {
      if (!open) return reject("NO_OPEN_SESSION");
      // La jornada huérfana no se cierra con la hora del reloj: el operario confirma el fin.
      if (open.bookkeeping.integrityReason === "ORPHAN_SESSION") return reject("ILLEGAL_TRANSITION", "ORPHAN_REVIEW");
      if (open.domainStatus === "ESPERANDO") return reject("ILLEGAL_TRANSITION"); // usar CANCEL_DAY
      // "El tiempo mostrado es la primera salida, no la última."
      const endMs =
        open.domainStatus === "SALIDA" && open.bookkeeping.firstExitAtMs ? open.bookkeeping.firstExitAtMs : now;
      if (future(endMs, ctx)) return reject("FUTURE_TIME");
      // Cerrar «ahora» puede durar 0 min (fin == inicio). Un fin tecleado no:
      // eso lo rechaza MANUAL_PATCH / CONFIRM_ORPHAN_END (fin ≤ inicio), salvo
      // la regla de medianoche que ya dejó el epoch en el día siguiente.
      const sessionStart = open.actualStartAtMs ?? open.declaredStartAtMs;
      if (endMs < sessionStart) return reject("INVALID_TIMES", "END_NOT_AFTER_START");
      let next = closeRecord(open, endMs, ctx.company);
      const declared = intent.lunchDeductedMinutes;
      if (declared !== undefined && declared !== null && !next.lunch.startAtMs) {
        let lunch: SessionRecord["lunch"] = { ...next.lunch, taken: declared > 0, deductedMinutes: declared };
        if (declared > 0 && Math.round(declared) > sessionSpanMinutes(sessionStart, endMs)) {
          return reject("INVALID_TIMES", "LUNCH_EXCEEDS_SESSION");
        }
        if (declared > 0) {
          // spec v1.3 §5.3: si la jornada cruza un límite de jornada, la hora de inicio es obligatoria.
          const start = open.actualStartAtMs ?? open.declaredStartAtMs;
          const crosses = nextWorkdayBoundary(start, companyCalendar(ctx.company)) < endMs;
          const ls = intent.lunchStartAtMs;
          if (ls !== undefined && ls !== null) {
            const lunchEnd = ls + declared * 60_000;
            if (future(ls, ctx) || future(lunchEnd, ctx)) return reject("FUTURE_TIME");
            if (lunchOutsideSession(start, endMs, ls, lunchEnd)) return reject("INVALID_TIMES", "LUNCH_OUTSIDE_SESSION");
            lunch = { ...lunch, startAtMs: ls, endAtMs: lunchEnd };
          } else if (crosses && ctx.actor === "USER") {
            return reject("LUNCH_START_REQUIRED");
          }
        }
        next = { ...next, lunch };
      }
      // Cierre VALID exige confirmación humana o Enter/Exit limpio (§7.3).
      if (ctx.actor !== "USER") next = withIntegrity(next, "CONFLICT", "UNRELIABLE_FIX");
      else next = labelUserClose(next);
      return ok(
        open,
        next,
        ctx,
        intent.mode === "EXIT_CONFIRMED" ? "EXIT_CONFIRMED_BY_USER" : "MANUAL_ACTION_EXPLICIT",
        [sync(next, null), { type: "CANCEL_EXIT_DECISION", sessionId: open.id }],
        "DAY_CLOSED",
      );
    }

    // ------------------------------------------------------------ AUTO_CLOSE
    case "AUTO_CLOSE": {
      if (!open) return reject("NO_OPEN_SESSION");
      if (ctx.actor === "USER") return reject("ILLEGAL_TRANSITION");
      // Nunca cerrar sola una jornada en revisión por abandono (no se inventan horas).
      if (open.bookkeeping.integrityReason === "ORPHAN_SESSION") return reject("ILLEGAL_TRANSITION", "ORPHAN_REVIEW");
      const b = open.bookkeeping;

      if (open.domainStatus === "ESPERANDO") {
        // Jornada huérfana sin llegada: se cierra como cancelada, clase AUTO.
        let next: SessionRecord = { ...open, domainStatus: "CERRADA", endAtMs: now, bookkeeping: { ...b, cancelled: true } };
        next = withIntegrity(next, "AUTO", "AUTO_CLOSE_12H");
        return ok(open, next, ctx, `AUTO_CLOSE_${intent.cause}`, [sync(next, null)], "DAY_AUTO_CLOSED");
      }

      let endMs = now;
      let cls: IntegrityClass = "CONFLICT";
      let reason: IntegrityReason = "EXIT_DECISION_EXPIRED";

      switch (intent.cause) {
        case "EXIT_DECISION_EXPIRED":
          endMs = b.firstExitAtMs ?? now;
          if (ctx.company.exitDecisionExpiry === "AUTO_IF_CONFIRMED_OUTSIDE" && intent.confirmedOutside && b.firstExitReliable) {
            cls = "AUTO";
            reason = "AUTO_CLOSE_ABANDONMENT";
          }
          break;
        case "ABANDONMENT_CONFIRMED":
          endMs = b.firstExitAtMs ?? now;
          cls = "AUTO";
          reason = "AUTO_CLOSE_ABANDONMENT";
          break;
        case "MAX_OPEN_12H": {
          const start = open.actualStartAtMs ?? open.declaredStartAtMs;
          endMs = b.firstExitAtMs ?? Math.min(now, start + 12 * 60 * 60 * 1000);
          cls = intent.confirmedOutside ? "AUTO" : "CONFLICT";
          reason = "AUTO_CLOSE_12H";
          break;
        }
        case "PROVIDER_LOSS":
          // TODO(política): umbral de "pérdida prolongada" no definido; cierre siempre CONFLICT.
          endMs = b.firstExitAtMs ?? now;
          cls = "CONFLICT";
          reason = "PROVIDER_LOSS";
          break;
      }

      const next = withIntegrity(closeRecord(open, endMs, ctx.company), cls, reason);
      return ok(open, next, ctx, `AUTO_CLOSE_${intent.cause}`, [sync(next, null), { type: "CANCEL_EXIT_DECISION", sessionId: open.id }], "DAY_AUTO_CLOSED");
    }

    // ------------------------------------------------------------ MANUAL_PATCH
    case "MANUAL_PATCH": {
      const s = target;
      if (!s) return reject("SESSION_NOT_FOUND");
      if (s.bookkeeping.isDeleted) return reject("SESSION_DELETED");
      const { declaredStartAtMs: start, endAtMs: end, note } = intent;
      if (!Number.isFinite(start) || (end !== null && !Number.isFinite(end))) return reject("INVALID_TIMES");
      // Igualdad de reloj ya cruzó la medianoche en el modal (N6). Aquí fin ≤ inicio es duración vacía.
      if (end !== null && end <= start) return reject("INVALID_TIMES", "END_NOT_AFTER_START");
      if (future(start, ctx) || (end !== null && future(end, ctx))) return reject("FUTURE_TIME");
      // Tope de 24 h por edición (spec v1.3 §5.2 N6).
      if (end !== null && end - start > 24 * 60 * 60 * 1000) return reject("INVALID_TIMES", "MAX_24H");
      if (end !== null && fixedLunchExceedsSession(s.lunch, start, end)) return reject("INVALID_TIMES", "LUNCH_EXCEEDS_SESSION");
      if (end === null && s.domainStatus === "CERRADA") return reject("INVALID_TIMES");
      if (end !== null && OPEN.includes(s.domainStatus)) return reject("INVALID_TIMES"); // cerrar = CLOSE_DAY
      if (requiresAuditNote(s, start, end, note)) return reject("NOTE_REQUIRED");
      if (!hasTimeChanged(s, start, end)) return reject("INVALID_TIMES", "NO_CHANGE");
      if (ctx.overlap) return reject("OVERLAP");

      const original = s.bookkeeping.original ?? {
        declaredStartAtMs: s.declaredStartAtMs,
        actualStartAtMs: s.actualStartAtMs,
        endAtMs: s.endAtMs,
        capturedAtMs: now,
      };
      let next: SessionRecord = {
        ...s,
        declaredStartAtMs: start,
        // Corrige GEOTrack: allí solo se editaba start_time y la nómina seguía
        // usando actual_start_time, así que la edición no tenía efecto.
        actualStartAtMs: s.actualStartAtMs === null ? null : start,
        endAtMs: end,
        bookkeeping: { ...s.bookkeeping, original, manualNote: note.trim() },
      };
      let clippedBreaks: ClippedBreak[] = [];
      let clippedTransits: ClippedTransit[] = [];
      if (end !== null) {
        const c = clipBreaks(next, start, end);
        next = c.next;
        clippedBreaks = c.clipped;
        const tr = clipTransits(next, start, end);
        next = tr.next;
        clippedTransits = tr.clipped;
      }
      next = withIntegrity(next, "MANUAL", "MANUAL_PATCH");
      const out = ok(s, next, ctx, "MANUAL_PATCH_WITH_NOTE", [], "SESSION_PATCHED");
      if (out.ok && (clippedBreaks.length || clippedTransits.length)) {
        out.ledgerExtra = {
          ...(clippedBreaks.length ? { clippedBreaks } : {}),
          ...(clippedTransits.length ? { clippedTransits } : {}),
        };
      }
      return out;
    }

    // ------------------------------------------------------------ ADD_NOTE
    case "ADD_NOTE": {
      const s = target;
      if (!s) return reject("SESSION_NOT_FOUND");
      if (!intent.note.trim()) return reject("NOTE_REQUIRED");
      const next: SessionRecord = { ...s, bookkeeping: { ...s.bookkeeping, manualNote: intent.note.trim() } };
      return ok(s, next, ctx, "NOTE_ADDED", [], "NOTE_SAVED");
    }

    // ------------------------------------------------------------ DELETE_SESSION
    case "DELETE_SESSION": {
      const s = target;
      if (!s) return reject("SESSION_NOT_FOUND");
      if (s.bookkeeping.isDeleted) return reject("SESSION_DELETED");
      // Fail-secure: una jornada abierta se cierra antes de poder borrarse.
      if (s.domainStatus !== "CERRADA") return reject("ILLEGAL_TRANSITION");
      const next: SessionRecord = { ...s, bookkeeping: { ...s.bookkeeping, isDeleted: true } };
      return ok(s, next, ctx, "SOFT_DELETE", [], "SESSION_DELETED");
    }

    // ------------------------------------------------------------ RESOLVE_*
    case "RESOLVE_KEEP_GPS": {
      const s = target;
      if (!s) return reject("SESSION_NOT_FOUND");
      if (s.integrityClass !== "CONFLICT") return reject("NOT_IN_CONFLICT");
      const o = s.bookkeeping.original;
      const restored: SessionRecord = o
        ? { ...s, declaredStartAtMs: o.declaredStartAtMs, actualStartAtMs: o.actualStartAtMs, endAtMs: o.endAtMs }
        : s;
      const cls: IntegrityClass = ctx.cleanGpsPair && !ctx.degradedReason ? "VALID" : "AUTO";
      const next: SessionRecord = {
        ...restored,
        integrityClass: cls,
        bookkeeping: { ...restored.bookkeeping, integrityReason: "CONFLICT_RESOLVED", manualNote: intent.note?.trim() || s.bookkeeping.manualNote },
      };
      return ok(s, next, ctx, "RESOLVE_KEEP_GPS", [], "CONFLICT_RESOLVED");
    }

    case "RESOLVE_MANUAL": {
      const s = target;
      if (!s) return reject("SESSION_NOT_FOUND");
      if (s.integrityClass !== "CONFLICT") return reject("NOT_IN_CONFLICT");
      if (!intent.note.trim()) return reject("NOTE_REQUIRED");
      const next: SessionRecord = {
        ...s,
        integrityClass: "MANUAL",
        bookkeeping: { ...s.bookkeeping, integrityReason: "CONFLICT_RESOLVED", manualNote: intent.note.trim() },
      };
      return ok(s, next, ctx, "RESOLVE_MANUAL", [], "CONFLICT_RESOLVED");
    }

    case "RESOLVE_SPLIT": {
      const s = target;
      if (!s) return reject("SESSION_NOT_FOUND");
      if (s.bookkeeping.isDeleted) return reject("SESSION_DELETED");
      if (s.domainStatus !== "CERRADA" || s.bookkeeping.cancelled || s.endAtMs === null) return reject("ILLEGAL_TRANSITION");
      if (!(intent.note ?? "").trim()) return reject("NOTE_REQUIRED");
      const split = splitSession(s, intent.splitAtMs, ctx, intent.note.trim());
      if ("code" in split) return reject(split.code, split.detail);
      const out = ok(s, split.a, ctx, "SESSION_SPLIT", [], "SESSION_PATCHED");
      if (out.ok) out.extra = touch(split.b, ctx.nowMs);
      return out;
    }

    // ------------------------------------------------------------ MARK_ORPHAN
    case "MARK_ORPHAN": {
      if (!open) return reject("NO_OPEN_SESSION");
      if (open.bookkeeping.integrityReason === "ORPHAN_SESSION") return reject("ILLEGAL_TRANSITION", "ALREADY_ORPHAN");
      const next: SessionRecord = {
        ...open,
        integrityClass: "CONFLICT",
        bookkeeping: { ...open.bookkeeping, integrityReason: "ORPHAN_SESSION" },
      };
      return ok(open, next, ctx, "ORPHAN_SESSION", [], "ORPHAN_REVIEW");
    }

    case "CONTINUE_ORPHAN": {
      if (!open) return reject("NO_OPEN_SESSION");
      if (open.bookkeeping.integrityReason !== "ORPHAN_SESSION") return reject("NOT_ORPHAN");
      // El operario decidió seguir. No es un cierre del sistema: MANUAL, no AUTO.
      // El comprobante dice «Recuperada» cuando él cierra (RECOVERED_CLOSED).
      const next: SessionRecord = {
        ...open,
        integrityClass: "MANUAL",
        bookkeeping: { ...open.bookkeeping, integrityReason: "ORPHAN_CONTINUED" },
      };
      return ok(open, next, ctx, "ORPHAN_CONTINUED", [], "ORPHAN_CONTINUED");
    }

    case "CONFIRM_ORPHAN_END": {
      if (!open) return reject("NO_OPEN_SESSION");
      if (open.bookkeeping.integrityReason !== "ORPHAN_SESSION") return reject("NOT_ORPHAN");
      if (!(intent.note ?? "").trim()) return reject("NOTE_REQUIRED");
      const start = open.actualStartAtMs ?? open.declaredStartAtMs;
      const end = intent.endAtMs;
      if (!Number.isFinite(end) || end <= start) return reject("INVALID_TIMES", "END_NOT_AFTER_START");
      if (future(end, ctx)) return reject("FUTURE_TIME");
      if (fixedLunchExceedsSession(open.lunch, start, end)) return reject("INVALID_TIMES", "LUNCH_EXCEEDS_SESSION");
      let next = closeRecord(open, end, ctx.company);
      next = {
        ...next,
        integrityClass: "MANUAL",
        bookkeeping: { ...next.bookkeeping, integrityReason: "ORPHAN_END_CONFIRMED", manualNote: intent.note.trim() },
      };
      return ok(open, next, ctx, "ORPHAN_END_CONFIRMED", [sync(next, null), { type: "CANCEL_EXIT_DECISION", sessionId: open.id }], "ORPHAN_END_CONFIRMED");
    }

    // ------------------------------------------------------------ INTEGRITY_DEGRADE
    case "INTEGRITY_DEGRADE": {
      if (!open) return reject("NO_OPEN_SESSION");
      if (open.integrityClass === "CONFLICT") return reject("ILLEGAL_TRANSITION", "ALREADY_CONFLICT");
      const reason: IntegrityReason = intent.cause;
      const next = withIntegrity(open, "CONFLICT", reason);
      const feedback: FeedbackCode =
        intent.cause === "CLOCK_DRIFT"
          ? "CLOCK_DRIFT"
          : intent.cause === "LEDGER_CHAIN_BROKEN"
            ? "LEDGER_BROKEN"
            : intent.cause === "FIELD_CRYPTO_KEY_LOST"
              ? "FIELD_CRYPTO_KEY_LOST"
              : intent.cause === "LOCATION_FOREGROUND_MISSING" || intent.cause === "LOCATION_SERVICES_DISABLED" || intent.cause === "FOREGROUND_SERVICE_STOPPED"
                ? "SENSOR_BLOCKS_VALID"
                : "PERMISSION_REVOKED";
      return ok(open, next, ctx, `INTEGRITY_DEGRADED_${intent.cause}`, [], feedback);
    }
  }
}
