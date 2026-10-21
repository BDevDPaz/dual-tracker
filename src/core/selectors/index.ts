/**
 * Selectores — única forma en que las vistas derivan datos del store.
 * ============================================================================
 * Portados de GEOTrack (src/core/selectors) y adaptados a DualTrackerState.
 * Son funciones PURAS: el tiempo llega como parámetro (nowMs) desde el hook.
 * Los cálculos de nómina se delegan a PayrollEngineService (funciones puras),
 * así la vista "no calcula horas: muestra selectores" (Producto §5.7).
 */
import { companyCalendar, pendingCalendarChange } from "../../utils/companyPolicy";
import type {
  DualTrackerState,
  EvidencePack,
  IntegrityClass,
  SessionPayrollPreview,
  SessionRecord,
  SessionState,
  Site,
  VisibleTrackingMode,
} from "../contracts";
import { OPEN_SESSION_STATES } from "../contracts";
import { DISCLOSURE_VERSION } from "../../i18n/legal";
import {
  allocateDisplayHundredths,
  displayStatement,
  formatCents,
  formatHundredths,
  formatSiteName,
  minutesToHundredths,
  moneyCents,
  trimDisplayNote,
} from "../../services/domain/payrollDisplay";
import { PayrollEngineService, isCertifiable, policyForPeriod } from "../../services/domain/PayrollEngineService";
import { restoreClippedTransits } from "../../services/domain/sessionMachine";
import { getPayrollPolicy } from "../../services/domain/payrollPolicies";
import { isZeroDuration, periodSliceOf, type PeriodSlice } from "../../services/domain/periodSlice";
import { computeSegmentMinutes } from "../../services/domain/segmentation";
import { checkedInSiteIds, lastVisitAtMs } from "../../services/domain/siteVisits";
import { retentionPhase, type RetentionPhase } from "../../services/evidence/retentionRules";
import { nextWorkdayBoundary, toDateString, workweekEndAt, workweekStartAt } from "../../utils/dateUtils";

/** Presentación de nómina para las pantallas (las rutas no importan services/). */
export { allocateDisplayHundredths, displayStatement, formatCents, formatHundredths, minutesToHundredths, moneyCents, trimDisplayNote };

// ---------------------------------------------------------------------------
// Gate (Producto §5.1)
// ---------------------------------------------------------------------------
export const selectIsHydrated = (s: DualTrackerState): boolean => !s.boot.isRehydrating;
export const selectBootError = (s: DualTrackerState): string | null => s.boot.bootError;
export const selectNeedsOnboarding = (s: DualTrackerState): boolean => !s.settings.device.onboardingCompleted;
/** "Alta incompleta o política nueva": una versión nueva del texto vuelve a pedir aceptación. */
export const selectNeedsDisclaimer = (s: DualTrackerState): boolean =>
  s.settings.device.disclosureAcceptedVersion !== DISCLOSURE_VERSION;
export const selectOsKillDetected = (s: DualTrackerState): boolean => s.boot.osKillDetected;

// ---------------------------------------------------------------------------
// Sesiones
// ---------------------------------------------------------------------------
export const selectSessionById = (s: DualTrackerState, id: number): SessionRecord | null => s.sessions.byId[String(id)] ?? null;

export const selectActiveSession = (s: DualTrackerState): SessionRecord | null => {
  const id = s.sessions.activeSessionId;
  if (id === null) return null;
  const session = s.sessions.byId[String(id)];
  return session && !session.bookkeeping.isDeleted && OPEN_SESSION_STATES.includes(session.domainStatus) ? session : null;
};

export const selectVisibleSessions = (s: DualTrackerState): SessionRecord[] =>
  s.sessions.order.map((id) => s.sessions.byId[String(id)]).filter((x): x is SessionRecord => !!x && !x.bookkeeping.isDeleted);

/** Última sesión de hoy (para el estado CERRADA de Hoy). */
export const selectLastSessionToday = (s: DualTrackerState, nowMs: number): SessionRecord | null => {
  const today = toDateString(nowMs);
  return selectVisibleSessions(s).find((x) => x.bookkeeping.dateString === today && !x.bookkeeping.cancelled) ?? null;
};

/** Estado de la vista Hoy. NO_INICIADA es solo de vista (no existe en SQLite). */
export const selectSessionState = (s: DualTrackerState, nowMs: number): SessionState => {
  const active = selectActiveSession(s);
  if (active) return active.domainStatus;
  return selectLastSessionToday(s, nowMs)?.domainStatus === "CERRADA" ? "CERRADA" : "NO_INICIADA";
};

export const selectConflictSessions = (s: DualTrackerState): SessionRecord[] =>
  selectVisibleSessions(s).filter((x) => x.integrityClass === "CONFLICT" && x.bookkeeping.integrityReason !== "ORPHAN_SESSION");

/** Jornadas en Revisar por abandono, o abiertas con deriva de reloj. */
export function selectReviewSessions(s: DualTrackerState): SessionRecord[] {
  return selectVisibleSessions(s).filter((x) => {
    if (x.bookkeeping.integrityReason === "ORPHAN_SESSION") return true;
    return OPEN_SESSION_STATES.includes(x.domainStatus) && x.bookkeeping.integrityReason === "CLOCK_DRIFT";
  });
}

export const selectHasConflict = (s: DualTrackerState): boolean => selectConflictSessions(s).length > 0;

export const selectSessionsInRange = (s: DualTrackerState, from: number, to: number): SessionRecord[] =>
  selectVisibleSessions(s).filter((x) => {
    const start = x.actualStartAtMs ?? x.declaredStartAtMs;
    return start >= from && start <= to;
  });

// ---------------------------------------------------------------------------
// Mapa estado → UI y CTAs (Producto §5.7, tabla "Mapa estado → CTAs")
// ---------------------------------------------------------------------------
export type HeroAction =
  | "OPEN_DAILY_SETUP_START"
  | "CANCEL_DAY"
  | "VIEW_DESTINATION"
  | "OPEN_LUNCH_CLOSE"
  | "START_LUNCH"
  | "RESUME"
  | "OPEN_LUNCH_FINISH"
  | "VIEW_STATUS"
  | "CANCEL_TRANSFER"
  | "OPEN_EXIT_MODAL"
  | "STAY_WORKING"
  | "REVIEW_SESSION"
  | "NEW_DAY"
  | "CONFIRM_ARRIVAL";

export interface SessionStateUI {
  state: SessionState;
  labelKey: string;
  subKey: string;
  showTimer: boolean;
  tone: "neutral" | "info" | "success" | "warning" | "danger";
  primary: { labelKey: string; action: HeroAction };
  secondary: { labelKey: string; action: HeroAction } | null;
  modal: "DAILY_SETUP_START" | "DAILY_SETUP_TRANSIT" | "LUNCH_CLOSE" | "LUNCH_SUPERVISOR" | "EXIT" | null;
}

const UI_TABLE: Record<SessionState, Omit<SessionStateUI, "state" | "labelKey" | "subKey">> = {
  NO_INICIADA: { showTimer: false, tone: "neutral", primary: { labelKey: "cta.startDay", action: "OPEN_DAILY_SETUP_START" }, secondary: null, modal: "DAILY_SETUP_START" },
  // Secundario = confirmar llegada: el ENTER no fiable y "ya estoy dentro" no fichan solos.
  ESPERANDO: { showTimer: false, tone: "info", primary: { labelKey: "cta.cancelDay", action: "CANCEL_DAY" }, secondary: { labelKey: "cta.confirmArrival", action: "CONFIRM_ARRIVAL" }, modal: null },
  ACTIVA: { showTimer: true, tone: "success", primary: { labelKey: "cta.closeDay", action: "OPEN_LUNCH_CLOSE" }, secondary: { labelKey: "cta.startLunch", action: "START_LUNCH" }, modal: "LUNCH_CLOSE" },
  PAUSADA: { showTimer: true, tone: "warning", primary: { labelKey: "cta.resume", action: "RESUME" }, secondary: { labelKey: "cta.finishDay", action: "OPEN_LUNCH_FINISH" }, modal: "LUNCH_SUPERVISOR" },
  // Primario = llegué: con geocercas solapadas el SO no dispara ENTER si ya estás dentro.
  TRASLADO: { showTimer: true, tone: "info", primary: { labelKey: "cta.confirmArrival", action: "CONFIRM_ARRIVAL" }, secondary: { labelKey: "cta.cancelTransfer", action: "CANCEL_TRANSFER" }, modal: "DAILY_SETUP_TRANSIT" },
  SALIDA: { showTimer: false, tone: "warning", primary: { labelKey: "cta.confirmExit", action: "OPEN_EXIT_MODAL" }, secondary: { labelKey: "cta.stayWorking", action: "STAY_WORKING" }, modal: "EXIT" },
  CERRADA: { showTimer: false, tone: "neutral", primary: { labelKey: "cta.reviewSession", action: "REVIEW_SESSION" }, secondary: { labelKey: "cta.newDay", action: "NEW_DAY" }, modal: null },
  CUARENTENA: { showTimer: false, tone: "warning", primary: { labelKey: "cta.reviewSession", action: "REVIEW_SESSION" }, secondary: null, modal: null },
};

export function getSessionStateUI(state: SessionState): SessionStateUI {
  return { state, labelKey: `states.${state}.label`, subKey: `states.${state}.sub`, ...UI_TABLE[state] };
}

// ---------------------------------------------------------------------------
// Nómina derivada (preview; el statement sellado lo hace EvidencePack)
// ---------------------------------------------------------------------------
export interface ComputedSession {
  session: SessionRecord;
  preview: SessionPayrollPreview | null;
  site: Site | null;
  /** Cadena "Origen → Destino" (un solo alias si no hubo traslado). */
  siteLabel: string;
}

/** La jornada pasó por este sitio (origen, llegada o destino del tramo abierto). */
export function sessionVisitsSite(session: SessionRecord, siteId: number): boolean {
  return checkedInSiteIds(session).includes(siteId);
}

/** Alias en orden de visita. Si no hay alias, la dirección. Vacío si la jornada no tiene sitio. */
export function sessionSiteLabel(session: SessionRecord, sitesById: Record<string, Site | undefined>): string {
  const label = (id: number) => formatSiteName(sitesById[String(id)]).primary || `#${id}`;
  const ids = checkedInSiteIds(session);
  if (!ids.length) return session.siteId != null ? label(session.siteId) : "";
  return ids.map(label).join(" → ");
}

export const selectComputedSessions = (s: DualTrackerState, nowMs: number, list?: SessionRecord[]): ComputedSession[] => {
  const rates = { hourlyRate: s.settings.profile.hourlyRate, overtimeMultiplier: s.settings.company.overtimeMultiplier };
  return (list ?? selectVisibleSessions(s)).map((session) => ({
    session,
    preview: session.bookkeeping.cancelled
      ? null
      : PayrollEngineService.previewSession(session, rates, s.settings.company, nowMs, selectPolicyForSession(s, session)),
    site: session.siteId !== null ? s.sites.byId[String(session.siteId)] ?? null : null,
    siteLabel: sessionSiteLabel(session, s.sites.byId),
  }));
};

export interface DaySummary {
  netMinutes: number;
  grossEstimate: number;
  certified: boolean;
  visitedSiteIds: number[];
}

export const selectTodaySummary = (s: DualTrackerState, nowMs: number): DaySummary => {
  const today = toDateString(nowMs);
  const active = selectActiveSession(s);
  // La jornada abierta sigue en "hoy" aunque cruce la medianoche (su dateString es el del inicio).
  const items = selectComputedSessions(s, nowMs).filter(
    (c) => c.session.bookkeeping.dateString === today || c.session.id === active?.id,
  );
  const visited: number[] = [];
  items.forEach((c) => {
    for (const id of checkedInSiteIds(c.session)) {
      if (!visited.includes(id)) visited.push(id);
    }
  });
  return {
    netMinutes: items.reduce((a, c) => a + (c.preview?.netMinutes ?? 0), 0),
    grossEstimate: Math.round(items.reduce((a, c) => a + (c.preview?.grossEstimate ?? 0), 0) * 100) / 100,
    certified: items.every((c) => isCertifiable(c.session)),
    visitedSiteIds: visited,
  };
};

export interface WeekRollup {
  netMinutes: number;
  grossEstimate: number;
  byClass: Record<IntegrityClass, number>;
}

export const selectRollup = (items: ComputedSession[]): WeekRollup => {
  const byClass: Record<IntegrityClass, number> = { VALID: 0, MANUAL: 0, AUTO: 0, CONFLICT: 0 };
  items.forEach((c) => byClass[c.session.integrityClass]++);
  return {
    netMinutes: items.reduce((a, c) => a + (c.preview?.netMinutes ?? 0), 0),
    grossEstimate: Math.round(items.reduce((a, c) => a + (c.preview?.grossEstimate ?? 0), 0) * 100) / 100,
    byClass,
  };
};

// ---------------------------------------------------------------------------
// Destinos
// ---------------------------------------------------------------------------
export const selectSites = (s: DualTrackerState, opts: { includeArchived?: boolean } = {}): Site[] =>
  s.sites.order.map((id) => s.sites.byId[String(id)]).filter((x): x is Site => !!x && (opts.includeArchived || x.active));

export const selectSiteById = (s: DualTrackerState, id: number | null): Site | null =>
  id === null ? null : s.sites.byId[String(id)] ?? null;

/**
 * Última visita derivada de las sesiones del store (mismo criterio que el
 * SQL de listSites: site_id, no borrada, MAX del inicio). El campo
 * `site.lastVisitAtMs` solo se rellena al listar; si la jornada se abre
 * después, ese campo se queda viejo hasta reiniciar.
 */
export function selectSiteLastVisitAtMs(s: DualTrackerState, siteId: number): number | null {
  let max: number | null = null;
  for (const id of s.sessions.order) {
    const session = s.sessions.byId[String(id)];
    if (!session || session.bookkeeping.isDeleted) continue;
    const at = lastVisitAtMs(session, siteId);
    if (at !== null && (max === null || at > max)) max = at;
  }
  return max;
}

/** Destino objetivo actual (tramo de traslado abierto o sitio de la sesión). */
export const selectCurrentTargetSite = (s: DualTrackerState): Site | null => {
  const active = selectActiveSession(s);
  if (!active) return null;
  const seg = active.transitSegments.find((t) => t.endAtMs === null && !t.cancelled);
  return selectSiteById(s, seg ? seg.toSiteId : active.siteId);
};

// ---------------------------------------------------------------------------
// Salud (Producto §5.7 SystemHealthBlock y §5.15)
// ---------------------------------------------------------------------------
export interface SystemHealthView {
  gpsOk: boolean;
  backgroundOk: boolean;
  traceMode: VisibleTrackingMode;
  degraded: boolean;
  checked: boolean;
}

export const selectVisibleTrackingMode = (s: DualTrackerState): VisibleTrackingMode => {
  const active = selectActiveSession(s);
  const status = active?.domainStatus ?? "NO_INICIADA";
  if (status === "NO_INICIADA" || s.health.locationForeground !== "granted") return "SIN_UBICACION";
  if (s.settings.company.traceMode === "BREADCRUMB" && (status === "ACTIVA" || status === "TRASLADO")) return "RASTRO_ACTIVO";
  return "SOLO_GEOCERCA";
};

export const selectSystemHealth = (s: DualTrackerState): SystemHealthView => {
  const h = s.health;
  const open = selectActiveSession(s) !== null;
  const gpsOk = h.locationForeground === "granted" && h.locationServicesEnabled !== false;
  const backgroundOk = h.locationBackground === "granted";
  const foregroundOk = !open || h.foregroundService !== "stopped";
  return {
    gpsOk,
    backgroundOk,
    traceMode: selectVisibleTrackingMode(s),
    degraded: h.checkedAtMs !== null && (!gpsOk || !backgroundOk || !foregroundOk || h.clockDriftExceeded),
    checked: h.checkedAtMs !== null,
  };
};

export interface RetentionStatusRow {
  periodStart: number;
  periodEnd: number;
  phase: RetentionPhase;
  eligibleAtMs: number;
}

/** Estado de retención de las últimas semanas con jornada, expediente o la semana en curso. */
export function selectRetentionStatus(s: DualTrackerState, nowMs: number): RetentionStatusRow[] {
  const days = s.settings.company.traceRetentionDays;
  const history = companyCalendar(s.settings.company);
  const packs = selectPacks(s);
  const weeks = new Map<number, { start: number; end: number }>();
  const add = (ts: number) => {
    const start = workweekStartAt(ts, history);
    const end = workweekEndAt(ts, history);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;
    weeks.set(start, { start, end });
  };
  for (const sess of selectVisibleSessions(s)) add(sess.actualStartAtMs ?? sess.declaredStartAtMs);
  for (const pack of packs) add(pack.manifest.periodStart);
  add(nowMs);
  return [...weeks.values()]
    .sort((a, b) => b.start - a.start)
    .slice(0, 8)
    .map((week) => {
      const bounds = { periodStart: week.start, periodEnd: week.end };
      const exported = packs.some((p) => p.manifest.periodStart === bounds.periodStart && p.manifest.periodEnd === bounds.periodEnd);
      const status = retentionPhase(nowMs, days, bounds, exported);
      return { periodStart: week.start, periodEnd: week.end, phase: status.phase, eligibleAtMs: status.eligibleAtMs };
    });
}

// ---------------------------------------------------------------------------
// Packs, feedback, admin, UI
// ---------------------------------------------------------------------------
/**
 * Jornadas que aportan tiempo a un periodo, con el reloj de ESA porción.
 * Con la política v2, una jornada que cruza la medianoche del domingo aparece
 * en las dos semanas: cada una con su tramo, no con el horario completo.
 * Los minutos y el importe de las cerradas salen del statement (mismo motor
 * que el PDF). Las abiertas muestran solo los minutos del tramo.
 */
export interface PeriodSessionRow {
  session: SessionRecord;
  site: Site | null;
  siteLabel: string;
  displayStartMs: number;
  displayEndMs: number | null;
  continuesFromMs: number | null;
  continuesUntilMs: number | null;
  netMinutes: number | null;
  grossEstimate: number | null;
  /** Centavos enteros del tramo. null si no hay importe (cancelada, o abierta partida). */
  grossCents: number | null;
  zeroDuration: boolean;
}

/** Porción visible de una jornada dentro de un periodo. null si la política no parte por jornada o la jornada no cae ahí. */
export function selectSessionPortion(
  s: DualTrackerState,
  policyId: string,
  periodStart: number,
  periodEnd: number,
  session: SessionRecord,
  nowMs: number,
): PeriodSlice | null {
  if (getPayrollPolicy(policyId).segmentation !== "WORKDAY") return null;
  return periodSliceOf(session, periodStart, periodEnd, companyCalendar(s.settings.company), nowMs);
}

export function selectPeriodSessionRows(s: DualTrackerState, periodStart: number, periodEnd: number, nowMs: number): PeriodSessionRow[] {
  const history = companyCalendar(s.settings.company);
  const packs = selectPacks(s).map((p) => ({
    periodStart: p.manifest.periodStart,
    periodEnd: p.manifest.periodEnd,
    policyId: p.statement.policyId,
    createdAtMs: p.createdAtMs,
  }));
  const policyId = policyForPeriod(packs, periodStart, periodEnd, s.settings.company.overtimePolicyId);
  const split = getPayrollPolicy(policyId).segmentation === "WORKDAY";
  const rates = { hourlyRate: s.settings.profile.hourlyRate, overtimeMultiplier: s.settings.company.overtimeMultiplier };
  const visible = selectVisibleSessions(s);
  const statement = PayrollEngineService.buildStatement({
    periodStart,
    periodEnd,
    sessions: visible,
    rates,
    company: s.settings.company,
    policyId,
    nowMs,
  });
  const pay = new Map<number, { minutes: number; cents: number }>();
  for (const id of statement.sessionIds) pay.set(id, { minutes: 0, cents: 0 });
  for (const line of statement.lines) {
    const row = pay.get(line.sessionId);
    if (!row) continue;
    if (!line.kind.endsWith("DEDUCTION")) row.minutes += line.minutes;
    row.cents += moneyCents(line.minutes, line.rate);
  }
  const siteOf = (session: SessionRecord) => (session.siteId !== null ? s.sites.byId[String(session.siteId)] ?? null : null);
  const make = (
    session: SessionRecord,
    displayStartMs: number,
    displayEndMs: number | null,
    continuesFromMs: number | null,
    continuesUntilMs: number | null,
    netMinutes: number | null,
    grossEstimate: number | null,
    grossCents: number | null,
    zeroDuration: boolean,
  ): PeriodSessionRow => ({
    session,
    site: siteOf(session),
    siteLabel: sessionSiteLabel(session, s.sites.byId),
    displayStartMs,
    displayEndMs,
    continuesFromMs,
    continuesUntilMs,
    netMinutes,
    grossEstimate,
    grossCents,
    zeroDuration,
  });
  const rows: PeriodSessionRow[] = [];
  for (const session of visible) {
    const start = session.actualStartAtMs ?? session.declaredStartAtMs;
    if (session.bookkeeping.cancelled) {
      if (start < periodStart || start > periodEnd) continue;
      rows.push(make(session, start, session.endAtMs, null, null, null, null, null, false));
      continue;
    }
    if (!split) {
      if (start < periodStart || start > periodEnd) continue;
      const closedPay = pay.get(session.id);
      const preview =
        closedPay || session.domainStatus === "CERRADA"
          ? null
          : PayrollEngineService.previewSession(session, rates, s.settings.company, nowMs, policyId);
      rows.push(
        make(
          session,
          start,
          session.endAtMs,
          null,
          null,
          closedPay ? closedPay.minutes : preview?.netMinutes ?? null,
          closedPay ? closedPay.cents / 100 : preview?.grossEstimate ?? null,
          closedPay ? closedPay.cents : null,
          session.endAtMs != null && isZeroDuration(start, session.endAtMs),
        ),
      );
      continue;
    }
    const slice = periodSliceOf(session, periodStart, periodEnd, history, nowMs);
    if (!slice) continue;
    const closedPay = pay.get(session.id);
    let net: number | null = closedPay ? closedPay.minutes : null;
    let gross: number | null = closedPay ? closedPay.cents / 100 : null;
    let grossCents: number | null = closedPay ? closedPay.cents : null;
    if (!closedPay && session.domainStatus !== "CERRADA") {
      const segs = computeSegmentMinutes(session, s.settings.company, nowMs, history) ?? [];
      net = segs
        .filter((x) => x.segment.startMs >= periodStart && x.segment.startMs <= periodEnd)
        .reduce((a, x) => a + x.workMinutes + x.transitPaidMinutes, 0);
      const whole = slice.continuesFromMs == null && slice.continuesUntilMs == null;
      const preview = whole ? PayrollEngineService.previewSession(session, rates, s.settings.company, nowMs, policyId) : null;
      gross = preview?.grossEstimate ?? null;
      grossCents = null;
    }
    rows.push(
      make(session, slice.displayStartMs, slice.displayEndMs, slice.continuesFromMs, slice.continuesUntilMs, net, gross, grossCents, slice.zeroDuration),
    );
  }
  rows.sort((a, b) => a.displayStartMs - b.displayStartMs || a.session.id - b.session.id);
  return rows;
}

export const selectPacks = (s: DualTrackerState): EvidencePack[] =>
  s.packs.order.map((id) => s.packs.byId[id]).filter((p): p is EvidencePack => !!p);
export const selectPackById = (s: DualTrackerState, id: string): EvidencePack | null => s.packs.byId[id] ?? null;
export const selectPendingFeedback = (s: DualTrackerState) => s.feedback.pending;
export const selectAdmin = (s: DualTrackerState) => s.admin;
export const selectIsAdminUnlocked = (s: DualTrackerState, nowMs: number): boolean =>
  s.admin.isUnlocked && !!s.admin.unlockedUntilMs && s.admin.unlockedUntilMs > nowMs;
export const selectUiRequests = (s: DualTrackerState) => s.uiRequests;
export const selectSettings = (s: DualTrackerState) => s.settings;
export const selectHealth = (s: DualTrackerState) => s.health;

/**
 * Tiempo transcurrido de la jornada abierta (temporizador del hero), neto de
 * pausas cerradas y de la pausa en curso. Presentación, no nómina: la nómina
 * sale de PayrollEngineService.previewSession.
 */
export const selectActiveElapsedMs = (s: DualTrackerState, nowMs: number): number => {
  const a = selectActiveSession(s);
  if (!a) return 0;
  const start = a.actualStartAtMs ?? a.declaredStartAtMs;
  const ongoingPause = a.bookkeeping.lastPauseStartMs ? Math.max(0, nowMs - a.bookkeeping.lastPauseStartMs) : 0;
  return Math.max(0, nowMs - start - a.totalPausedMs - ongoingPause);
};

/** Tiempo transcurrido del almuerzo en curso (LunchModal modo supervisor). */
export const selectLunchElapsedMs = (s: DualTrackerState, nowMs: number): number => {
  const a = selectActiveSession(s);
  return a?.bookkeeping.lastPauseStartMs ? Math.max(0, nowMs - a.bookkeeping.lastPauseStartMs) : 0;
};

// ---------------------------------------------------------------------------
// Conflicto (Producto §5.16)
// ---------------------------------------------------------------------------
export interface ConflictView {
  session: SessionRecord;
  site: Site | null;
  /** Hecho A: tiempos originales capturados por GPS / motor antes del ajuste. */
  factA: { startAtMs: number; endAtMs: number | null } | null;
  /** Hecho B: tiempos vigentes (ajuste manual o cierre automático). */
  factB: { startAtMs: number; endAtMs: number | null };
  diffMinutes: number | null;
  /** Impacto estimado en nómina de conservar B frente a A (PayrollEngine, no la vista). */
  payrollImpact: number | null;
  reason: string;
  canSplit: boolean;
}

export const selectConflictViews = (s: DualTrackerState, nowMs: number): ConflictView[] => {
  const rates = { hourlyRate: s.settings.profile.hourlyRate, overtimeMultiplier: s.settings.company.overtimeMultiplier };
  return selectConflictSessions(s).map((session) => {
    const o = session.bookkeeping.original;
    const factB = { startAtMs: session.actualStartAtMs ?? session.declaredStartAtMs, endAtMs: session.endAtMs };
    const factA = o ? { startAtMs: o.actualStartAtMs ?? o.declaredStartAtMs, endAtMs: o.endAtMs } : null;
    let diffMinutes: number | null = null;
    let payrollImpact: number | null = null;
    if (factA) {
      const pol = selectPolicyForSession(s, session);
      const b = PayrollEngineService.previewSession(session, rates, s.settings.company, nowMs, pol);
      const asA: SessionRecord = {
        ...session,
        declaredStartAtMs: o!.declaredStartAtMs,
        actualStartAtMs: o!.actualStartAtMs,
        endAtMs: o!.endAtMs,
        transitSegments: restoreClippedTransits(session.transitSegments),
      };
      const a = PayrollEngineService.previewSession(asA, rates, s.settings.company, nowMs, pol);
      if (a && b) {
        diffMinutes = b.netMinutes - a.netMinutes;
        payrollImpact = Math.round((b.grossEstimate - a.grossEstimate) * 100) / 100;
      }
    }
    return {
      session,
      site: selectSiteById(s, session.siteId),
      factA,
      factB,
      diffMinutes,
      payrollImpact,
      reason: session.bookkeeping.integrityReason,
      canSplit: session.bookkeeping.integrityReason === "OVERLAP",
    };
  });
};

// ---------------------------------------------------------------------------
// Integridad del ledger (spec v1.3 §5.5)
// ---------------------------------------------------------------------------
export const selectLedgerHealth = (s: DualTrackerState) => s.health.ledger;

// ---------------------------------------------------------------------------
// Cifrado de campos (spec FieldCrypto v1.3 §11, §12, §14)
// ---------------------------------------------------------------------------
export const selectCryptoHealth = (s: DualTrackerState) => s.health.fieldCrypto;

export interface CertificationView {
  certifiable: boolean;
  /** true si la sesión lleva un bloqueo de certificación (badge "No certificable"). */
  blocked: boolean;
  blockers: string[];
  /** Nota/rastro ilegibles en este dispositivo (kid perdido, §14). */
  unreadable: ("note" | "trace")[];
}

/** Etiqueta de certificación de una sesión (§12): IntegrityBadge muestra "No certificable" si hay bloqueo. */
export function selectCertification(s: DualTrackerState, session: SessionRecord): CertificationView {
  const blockers = session.bookkeeping.certificationBlockers ?? [];
  void s;
  return { certifiable: isCertifiable(session), blocked: blockers.length > 0, blockers, unreadable: [...(session.bookkeeping.unreadableFields ?? [])] };
}

// ---------------------------------------------------------------------------
// Calendario laboral (spec v1.3 §5.1)
// ---------------------------------------------------------------------------
export const selectCalendarHistory = (s: DualTrackerState) => companyCalendar(s.settings.company);
export const selectPendingCalendarChange = (s: DualTrackerState, nowMs: number) => pendingCalendarChange(s.settings.company, nowMs);

/**
 * ¿La jornada abierta cruza un límite de jornada si se cerrara ahora? LunchModal
 * pide entonces la hora de inicio del almuerzo (spec v1.3 §5.3).
 */
export function selectActiveCrossesWorkday(s: DualTrackerState, nowMs: number): boolean {
  const open = selectActiveSession(s);
  if (!open || !OPEN_SESSION_STATES.includes(open.domainStatus)) return false;
  const start = open.actualStartAtMs ?? open.declaredStartAtMs;
  const end = open.domainStatus === "SALIDA" && open.bookkeeping.firstExitAtMs ? open.bookkeeping.firstExitAtMs : nowMs;
  return nextWorkdayBoundary(start, companyCalendar(s.settings.company)) < end;
}

/**
 * Política del periodo que contiene la sesión (spec v1.3 §5.2 N3): la del pack
 * más reciente de ese periodo o la vigente de la empresa. session.policyId es
 * solo informativa (política al iniciar).
 */
export function selectPolicyForSession(s: DualTrackerState, session: SessionRecord): string {
  const history = companyCalendar(s.settings.company);
  const start = session.actualStartAtMs ?? session.declaredStartAtMs;
  const packs = selectPacks(s).map((p) => ({ periodStart: p.manifest.periodStart, periodEnd: p.manifest.periodEnd, policyId: p.statement.policyId, createdAtMs: p.createdAtMs }));
  return policyForPeriod(packs, workweekStartAt(start, history), workweekEndAt(start, history), s.settings.company.overtimePolicyId);
}

// ---------------------------------------------------------------------------
// Respaldos y exportación del expediente (spec FieldCrypto v1.3 §16)
// ---------------------------------------------------------------------------
export interface BackupAdvice {
  /** Packs sellados sin ningún asiento PACK_SHARED (más reciente primero). */
  unsharedPacks: EvidencePack[];
  /** Periodo cerrado más reciente con jornadas cerradas y sin pack. */
  unpackedPeriod: { periodStart: number; periodEnd: number } | null;
  /** Periodos pendientes de exportar (fila de system/health). */
  pendingPeriods: number;
  /** Siguiente periodo a exportar con el botón "Exportar expediente". */
  next: { periodStart: number; periodEnd: number } | null;
}

/**
 * §16: packs sin compartir + periodo cerrado más reciente sin pack. Las
 * pantallas lo leen; no importan servicios. "Cerrado" = el periodo terminó
 * antes de `nowMs` (según el calendario laboral vigente en cada fecha).
 */
export function selectBackupAdvice(s: DualTrackerState, nowMs: number): BackupAdvice {
  const shared = new Set(s.packs.sharedIds);
  const packs = selectPacks(s);
  const unsharedPacks = packs.filter((p) => !shared.has(p.id)).sort((a, b) => b.manifest.periodStart - a.manifest.periodStart || b.createdAtMs - a.createdAtMs);
  const history = companyCalendar(s.settings.company);
  const packed = new Set(packs.map((p) => `${p.manifest.periodStart}:${p.manifest.periodEnd}`));
  let unpackedPeriod: BackupAdvice["unpackedPeriod"] = null;
  for (const session of Object.values(s.sessions.byId)) {
    if (session.bookkeeping.isDeleted || session.bookkeeping.cancelled || session.domainStatus !== "CERRADA") continue;
    const start = session.actualStartAtMs ?? session.declaredStartAtMs;
    const periodStart = workweekStartAt(start, history);
    const periodEnd = workweekEndAt(start, history);
    if (periodEnd >= nowMs || packed.has(`${periodStart}:${periodEnd}`)) continue;
    if (!unpackedPeriod || periodStart > unpackedPeriod.periodStart) unpackedPeriod = { periodStart, periodEnd };
  }
  const periods = new Set(unsharedPacks.map((p) => `${p.manifest.periodStart}:${p.manifest.periodEnd}`));
  const pendingPeriods = periods.size + (unpackedPeriod ? 1 : 0);
  const firstUnshared = unsharedPacks[0];
  const next = unpackedPeriod ?? (firstUnshared ? { periodStart: firstUnshared.manifest.periodStart, periodEnd: firstUnshared.manifest.periodEnd } : null);
  return { unsharedPacks, unpackedPeriod, pendingPeriods, next };
}

/** §16: ¿este pack ya se compartió al menos una vez? */
export const selectPackShared = (s: DualTrackerState, packId: string): boolean => s.packs.sharedIds.includes(packId);
