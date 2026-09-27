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
import { PayrollEngineService, isCertifiable, policyForPeriod } from "../../services/domain/PayrollEngineService";
import { nextWorkdayBoundary, toDateString, workweekEndAt, workweekStartAt } from "../../utils/dateUtils";

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
  selectVisibleSessions(s).filter((x) => x.integrityClass === "CONFLICT");

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
  ESPERANDO: { showTimer: false, tone: "info", primary: { labelKey: "cta.cancelDay", action: "CANCEL_DAY" }, secondary: { labelKey: "cta.viewDestination", action: "VIEW_DESTINATION" }, modal: null },
  ACTIVA: { showTimer: true, tone: "success", primary: { labelKey: "cta.closeDay", action: "OPEN_LUNCH_CLOSE" }, secondary: { labelKey: "cta.startLunch", action: "START_LUNCH" }, modal: "LUNCH_CLOSE" },
  PAUSADA: { showTimer: true, tone: "warning", primary: { labelKey: "cta.resume", action: "RESUME" }, secondary: { labelKey: "cta.finishDay", action: "OPEN_LUNCH_FINISH" }, modal: "LUNCH_SUPERVISOR" },
  TRASLADO: { showTimer: true, tone: "info", primary: { labelKey: "cta.viewStatus", action: "VIEW_STATUS" }, secondary: { labelKey: "cta.cancelTransfer", action: "CANCEL_TRANSFER" }, modal: "DAILY_SETUP_TRANSIT" },
  SALIDA: { showTimer: false, tone: "warning", primary: { labelKey: "cta.confirmExit", action: "OPEN_EXIT_MODAL" }, secondary: { labelKey: "cta.stayWorking", action: "STAY_WORKING" }, modal: "EXIT" },
  CERRADA: { showTimer: false, tone: "neutral", primary: { labelKey: "cta.reviewSession", action: "REVIEW_SESSION" }, secondary: { labelKey: "cta.newDay", action: "NEW_DAY" }, modal: null },
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
}

export const selectComputedSessions = (s: DualTrackerState, nowMs: number, list?: SessionRecord[]): ComputedSession[] => {
  const rates = { hourlyRate: s.settings.profile.hourlyRate, overtimeMultiplier: s.settings.company.overtimeMultiplier };
  return (list ?? selectVisibleSessions(s)).map((session) => ({
    session,
    preview: session.bookkeeping.cancelled
      ? null
      : PayrollEngineService.previewSession(session, rates, s.settings.company, nowMs, selectPolicyForSession(s, session)),
    site: session.siteId !== null ? s.sites.byId[String(session.siteId)] ?? null : null,
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
  const items = selectComputedSessions(s, nowMs).filter((c) => c.session.bookkeeping.dateString === today);
  const visited = new Set<number>();
  items.forEach((c) => {
    if (c.session.siteId !== null) visited.add(c.session.siteId);
    c.session.transitSegments.forEach((t) => !t.cancelled && visited.add(t.toSiteId));
  });
  return {
    netMinutes: items.reduce((a, c) => a + (c.preview?.netMinutes ?? 0), 0),
    grossEstimate: Math.round(items.reduce((a, c) => a + (c.preview?.grossEstimate ?? 0), 0) * 100) / 100,
    certified: items.every((c) => isCertifiable(c.session)),
    visitedSiteIds: [...visited],
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
  const gpsOk = h.locationForeground === "granted" && h.locationServicesEnabled !== false;
  const backgroundOk = h.locationBackground === "granted";
  return {
    gpsOk,
    backgroundOk,
    traceMode: selectVisibleTrackingMode(s),
    degraded: h.checkedAtMs !== null && (!gpsOk || !backgroundOk || h.clockDriftExceeded),
    checked: h.checkedAtMs !== null,
  };
};

// ---------------------------------------------------------------------------
// Packs, feedback, admin, UI
// ---------------------------------------------------------------------------
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
      const asA: SessionRecord = { ...session, declaredStartAtMs: o!.declaredStartAtMs, actualStartAtMs: o!.actualStartAtMs, endAtMs: o!.endAtMs };
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
