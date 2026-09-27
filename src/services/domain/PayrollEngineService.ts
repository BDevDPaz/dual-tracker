/**
 * PayrollEngineService — Dominio (Propuesta Técnica §5.2, nuevo, crítico)
 * ============================================================================
 * Motor de nómina versionado. Sustituye calculateSessionDuration /
 * calculatePay (payrollUtils.ts de GEOTrack), calculateEarnings (LEDTracker)
 * y el cálculo embebido en el HTML del PDF (ReportGenerator).
 *
 * Entrada: sesiones cerradas, pausas, almuerzo, traslados, tarifa y multiplicador.
 * Salida: horas regulares, OT diario, OT semanal, deducciones, total estimado.
 *
 * Diferencias deliberadas con el código heredado:
 *  - El almuerzo es una línea explícita. Se usa (1) start/end reales, o
 *    (2) los minutos declarados en LunchModal. GEOTrack restaba 60 min por
 *    defecto si solo había "Sí": aquí NO se inventa la duración; se emite la
 *    advertencia LUNCH_DURATION_UNKNOWN y la línea vale 0 min.
 *  - Aritmética en minutos enteros (como GEOTrack) para evitar redondeos.
 *  - Interpretación documentada de "el traslado cuenta para overtime": los
 *    minutos de tránsito que cuentan consumen primero la capacidad regular del
 *    día; el tránsito se paga en su propia línea TRANSIT a su tarifa.
 *
 * El dominio es puro: no importa Expo, SQLite, TaskManager ni Print.
 */
import type {
  CompanyPolicy,
  IntegrityClass,
  IntegrityRollup,
  PayrollLine,
  PayrollPolicy,
  PayrollRates,
  PayrollStatement,
  SessionPayrollPreview,
  SessionRecord,
} from "../../core/contracts";
import { companyCalendar, legalFlags } from "../../utils/companyPolicy";
import { workweekEndAt, workweekStartAt, type CalendarHistory } from "../../utils/dateUtils";
import { getPayrollPolicy } from "./payrollPolicies";
import { TransitPolicyService } from "./TransitPolicyService";

const MS_PER_MIN = 60000;
const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (minutes: number, rate: number) => round2((minutes / 60) * rate);

/** Desglose de minutos de una sesión (sin reparto de OT). */
export interface SessionMinutes {
  sessionId: number;
  dateString: string;
  siteId: number | null;
  startMs: number;
  spanMinutes: number;
  lunchMinutes: number;
  pauseMinutes: number;
  transitPaidMinutes: number;
  transitOtMinutes: number;
  transitRateMultiplier: number;
  workMinutes: number;
  warnings: string[];
}

/**
 * Minutos de una sesión. `nowMs` solo se usa para sesiones abiertas (preview);
 * lo aporta TimeAuthority desde fuera (el dominio no lee el reloj).
 */
export function computeSessionMinutes(
  session: SessionRecord,
  company: CompanyPolicy,
  nowMs: number,
): SessionMinutes | null {
  const b = session.bookkeeping;
  if (b.isDeleted || b.cancelled) return null;

  const startMs = session.actualStartAtMs ?? session.declaredStartAtMs;
  // SALIDA: se mide hasta la primera salida (port de selectComputedSessions de GEOTrack).
  const endMs =
    session.endAtMs ??
    (session.domainStatus === "SALIDA" && b.firstExitAtMs ? b.firstExitAtMs : nowMs);
  const warnings: string[] = [];
  const spanMinutes = Math.max(0, Math.round((endMs - startMs) / MS_PER_MIN));

  // Almuerzo
  let lunchMinutes = 0;
  const l = session.lunch;
  if (l.startAtMs && l.endAtMs) {
    lunchMinutes = Math.max(0, Math.round((l.endAtMs - l.startAtMs) / MS_PER_MIN));
  } else if (l.startAtMs && !l.endAtMs && session.domainStatus === "PAUSADA") {
    lunchMinutes = Math.max(0, Math.round((nowMs - l.startAtMs) / MS_PER_MIN));
  } else if (l.deductedMinutes !== null && l.deductedMinutes !== undefined) {
    lunchMinutes = Math.max(0, Math.round(l.deductedMinutes));
  } else if (l.taken) {
    warnings.push("LUNCH_DURATION_UNKNOWN");
  }

  // Pausas no-almuerzo
  const openPause = b.lastPauseStartMs ? Math.max(0, nowMs - b.lastPauseStartMs) : 0;
  const pauseMinutes = Math.round((session.totalPausedMs + openPause) / MS_PER_MIN);

  // Tránsito
  let transitPaidMinutes = 0;
  let transitOtMinutes = 0;
  let transitUnpaidMinutes = 0;
  let transitRateMultiplier = company.transitRateMultiplier;
  for (const seg of session.transitSegments) {
    const minutes = TransitPolicyService.segmentMinutes(seg, endMs);
    const decision = TransitPolicyService.decide(seg, company);
    if (decision.paid) {
      transitPaidMinutes += minutes;
      transitRateMultiplier = decision.rateMultiplier;
      if (decision.countsTowardOvertime) transitOtMinutes += minutes;
    } else {
      transitUnpaidMinutes += minutes;
    }
  }

  const workMinutes = Math.max(
    0,
    spanMinutes - lunchMinutes - pauseMinutes - transitPaidMinutes - transitUnpaidMinutes,
  );

  if (spanMinutes > 0 && workMinutes === 0) warnings.push("NO_WORK_MINUTES");

  return {
    sessionId: session.id,
    dateString: b.dateString,
    siteId: session.siteId,
    startMs,
    spanMinutes,
    lunchMinutes,
    pauseMinutes,
    transitPaidMinutes,
    transitOtMinutes,
    transitRateMultiplier,
    workMinutes,
    warnings,
  };
}

interface Allocation {
  regular: number;
  otDaily: number;
  otWeekly: number;
}

/**
 * Reparte minutos de trabajo en regular / OT diario / OT semanal según la
 * política. Las sesiones deben venir ordenadas cronológicamente.
 */
interface AllocateCtx {
  history?: CalendarHistory;
  /** Umbral semanal de un periodo de transición < 7 días [CONFIRMAR CON ASESORÍA LEGAL]. */
  transitionWeeklyThreshold?: "FULL" | "PRORATED";
}

/** Umbral semanal del periodo que empieza en `week` (proporcional solo con PRORATED). */
function weeklyThreshold(policy: PayrollPolicy, week: number, ctx: AllocateCtx): number {
  const full = policy.weeklyOvertimeAfterMinutes ?? 0;
  if (ctx.transitionWeeklyThreshold !== "PRORATED") return full;
  const len = workweekEndAt(week, ctx.history) + 1 - week;
  const WEEK = 7 * 24 * 3_600_000;
  return len > 0 && len < WEEK - 2 * 3_600_000 ? Math.round((full * len) / WEEK) : full;
}

function allocate(items: SessionMinutes[], policy: PayrollPolicy, ctx: AllocateCtx = {}): Map<number, Allocation> {
  const result = new Map<number, Allocation>();
  const dailyUsed = new Map<string, number>(); // capacidad regular consumida por día
  const weeklyRegular = new Map<number, number>(); // minutos regulares por semana

  for (const it of items) {
    let regular = it.workMinutes;
    let otDaily = 0;

    if (policy.dailyOvertimeAfterMinutes !== null) {
      const key = policy.dailyScope === "DAY" ? it.dateString : `S${it.sessionId}`;
      const used = (dailyUsed.get(key) ?? 0) + it.transitOtMinutes;
      const capacity = Math.max(0, policy.dailyOvertimeAfterMinutes - used);
      regular = Math.min(it.workMinutes, capacity);
      otDaily = it.workMinutes - regular;
      dailyUsed.set(key, used + regular);
    }

    let otWeekly = 0;
    if (policy.weeklyOvertimeAfterMinutes !== null) {
      const week = workweekStartAt(it.startMs, ctx.history);
      const soFar = weeklyRegular.get(week) ?? 0;
      const capacity = Math.max(0, weeklyThreshold(policy, week, ctx) - soFar - it.transitOtMinutes);
      const weeklyRegularPart = Math.min(regular, capacity);
      otWeekly = regular - weeklyRegularPart;
      regular = weeklyRegularPart;
      weeklyRegular.set(week, soFar + regular + it.transitOtMinutes);
    }

    result.set(it.sessionId, { regular, otDaily, otWeekly });
  }
  return result;
}

function buildLines(
  it: SessionMinutes,
  a: Allocation,
  rates: PayrollRates,
): PayrollLine[] {
  const base = { sessionId: it.sessionId, dateString: it.dateString, siteId: it.siteId };
  const otRate = rates.hourlyRate * rates.overtimeMultiplier;
  const transitRate = rates.hourlyRate * it.transitRateMultiplier;
  const lines: PayrollLine[] = [
    { ...base, kind: "REGULAR", minutes: a.regular, rate: rates.hourlyRate, amount: money(a.regular, rates.hourlyRate), warnings: it.warnings },
  ];
  if (a.otDaily > 0)
    lines.push({ ...base, kind: "OVERTIME_DAILY", minutes: a.otDaily, rate: otRate, amount: money(a.otDaily, otRate), warnings: [] });
  if (a.otWeekly > 0)
    lines.push({ ...base, kind: "OVERTIME_WEEKLY", minutes: a.otWeekly, rate: otRate, amount: money(a.otWeekly, otRate), warnings: [] });
  if (it.transitPaidMinutes > 0)
    lines.push({ ...base, kind: "TRANSIT", minutes: it.transitPaidMinutes, rate: transitRate, amount: money(it.transitPaidMinutes, transitRate), warnings: [] });
  if (it.lunchMinutes > 0 || it.warnings.includes("LUNCH_DURATION_UNKNOWN"))
    lines.push({ ...base, kind: "LUNCH_DEDUCTION", minutes: it.lunchMinutes, rate: 0, amount: 0, warnings: [] });
  if (it.pauseMinutes > 0)
    lines.push({ ...base, kind: "PAUSE_DEDUCTION", minutes: it.pauseMinutes, rate: 0, amount: 0, warnings: [] });
  return lines;
}

/**
 * Rollup de integridad. `certified` exige: sin CONFLICT y periodo no tocado
 * por una ruptura de cadena reconocida (spec v1.3 §5.5).
 */
export function rollupIntegrity(sessions: SessionRecord[], opts: { ledgerSegmented?: boolean } = {}): IntegrityRollup {
  const byClass: Record<IntegrityClass, number> = { VALID: 0, MANUAL: 0, AUTO: 0, CONFLICT: 0 };
  for (const s of sessions) byClass[s.integrityClass]++;
  const hasConflict = byClass.CONFLICT > 0;
  return { total: sessions.length, byClass, hasConflict, certified: !hasConflict && !opts.ledgerSegmented };
}

export const PayrollEngineService = {
  getPolicy: getPayrollPolicy,

  /**
   * PayrollStatement de un periodo. Solo sesiones CERRADAS entran al
   * statement; las abiertas se excluyen con advertencia.
   */
  buildStatement(input: {
    periodStart: number;
    periodEnd: number;
    sessions: SessionRecord[];
    rates: PayrollRates;
    company: CompanyPolicy;
    policyId: string;
    nowMs: number;
    /**
     * Instantes de asientos tocados por una ruptura de cadena reconocida
     * (dato de dominio que aporta IntegrityLedger, spec v1.3 §5.5).
     */
    segmentedLedgerTimestamps?: number[];
  }): PayrollStatement {
    const policy = getPayrollPolicy(input.policyId);
    const warnings: string[] = [];
    const ledgerSegmented = (input.segmentedLedgerTimestamps ?? []).some((ts) => ts >= input.periodStart && ts <= input.periodEnd);

    const inPeriod = input.sessions.filter((s) => {
      const start = s.actualStartAtMs ?? s.declaredStartAtMs;
      return start >= input.periodStart && start <= input.periodEnd && !s.bookkeeping.isDeleted;
    });
    const closed = inPeriod.filter((s) => s.domainStatus === "CERRADA");
    if (closed.length !== inPeriod.length) warnings.push("OPEN_SESSION_EXCLUDED");

    const items = closed
      .map((s) => computeSessionMinutes(s, input.company, input.nowMs))
      .filter((x): x is SessionMinutes => x !== null)
      .sort((a, b) => a.startMs - b.startMs);

    const alloc = allocate(items, policy, {
      history: companyCalendar(input.company),
      transitionWeeklyThreshold: legalFlags(input.company).transitionWeeklyThreshold,
    });
    const lines = items.flatMap((it) => buildLines(it, alloc.get(it.sessionId)!, input.rates));

    const sumMin = (kinds: PayrollLine["kind"][]) =>
      lines.filter((l) => kinds.includes(l.kind)).reduce((acc, l) => acc + l.minutes, 0);

    const regularMin = sumMin(["REGULAR"]);
    const otDailyMin = sumMin(["OVERTIME_DAILY"]);
    const otWeeklyMin = sumMin(["OVERTIME_WEEKLY"]);
    const transitMin = sumMin(["TRANSIT"]);
    const lunchMin = sumMin(["LUNCH_DEDUCTION"]);
    const pauseMin = sumMin(["PAUSE_DEDUCTION"]);
    items.forEach((it) => it.warnings.forEach((w) => warnings.push(`${w}#${it.sessionId}`)));
    if (ledgerSegmented) warnings.push("LEDGER_CHAIN_SEGMENTED");

    return {
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      lines,
      regularHours: regularMin / 60,
      overtimeHours: (otDailyMin + otWeeklyMin) / 60,
      transitHours: transitMin / 60,
      lunchMinutes: lunchMin,
      grossEstimate: round2(lines.reduce((acc, l) => acc + l.amount, 0)),
      integrityRollup: rollupIntegrity(closed, { ledgerSegmented }),
      policyId: policy.id,
      packHash: null,
      overtimeDailyHours: otDailyMin / 60,
      overtimeWeeklyHours: otWeeklyMin / 60,
      deductionMinutes: lunchMin + pauseMin,
      sessionIds: closed.map((s) => s.id),
      warnings,
    };
  },

  /**
   * Efecto de nómina tentativo de UNA sesión (salida de SessionEngine, §4.1).
   * No considera OT semanal (requiere el periodo completo).
   */
  previewSession(
    session: SessionRecord,
    rates: PayrollRates,
    company: CompanyPolicy,
    nowMs: number,
  ): SessionPayrollPreview | null {
    const policy = getPayrollPolicy(session.policyId);
    const it = computeSessionMinutes(session, company, nowMs);
    if (!it) return null;
    const a = allocate([it], { ...policy, weeklyOvertimeAfterMinutes: null });
    const lines = buildLines(it, a.get(it.sessionId)!, rates);
    return {
      sessionId: session.id,
      netMinutes: it.workMinutes + it.transitPaidMinutes,
      regularMinutes: a.get(it.sessionId)!.regular,
      overtimeDailyMinutes: a.get(it.sessionId)!.otDaily,
      transitMinutes: it.transitPaidMinutes,
      lunchMinutes: it.lunchMinutes,
      grossEstimate: round2(lines.reduce((acc, l) => acc + l.amount, 0)),
      certified: session.integrityClass !== "CONFLICT",
      policyId: policy.id,
    };
  },

  /**
   * Líneas de una sola sesión dentro de su semana (para session/[id]).
   * Reutiliza buildStatement sobre la semana y filtra por sessionId.
   */
  linesForSession(
    sessionId: number,
    weekSessions: SessionRecord[],
    ctx: { rates: PayrollRates; company: CompanyPolicy; policyId: string; nowMs: number; periodStart: number; periodEnd: number },
  ): PayrollLine[] {
    const st = PayrollEngineService.buildStatement({ ...ctx, sessions: weekSessions });
    return st.lines.filter((l) => l.sessionId === sessionId);
  },
};
