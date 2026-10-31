/**
 * PayrollEngineService — Dominio (Propuesta Técnica §5.2, nuevo, crítico)
 * ============================================================================
 * Motor de nómina versionado. Sustituye calculateSessionDuration /
 * calculatePay (payrollUtils.ts de GEOTrack), calculateEarnings (proyecto fuente anterior LEDTracker)
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
import { moneyCents } from "./payrollDisplay";
import { evaluateDayPremiums } from "./caPremiums";
import { computeSegmentMinutes, deductibleLunchMinutes, sessionEndMs } from "./segmentation";
import { getPayrollPolicy } from "./payrollPolicies";
import { TransitPolicyService } from "./TransitPolicyService";

const MS_PER_MIN = 60000;
/** Dólares de una línea: centavos enteros half-up, no `(minutos/60)*tarifa` en float. */
const money = (minutes: number, rate: number) => moneyCents(minutes, rate) / 100;

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
  /** Solo si hay tramos cancelados pagados. */
  cancelledTransits?: { minutes: number; endAtMs: number; note: string | null }[];
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
    session.domainStatus === "ESPERANDO"
      ? startMs
      : (session.endAtMs ?? (session.domainStatus === "SALIDA" && b.firstExitAtMs ? b.firstExitAtMs : nowMs));
  const warnings: string[] = [];
  const spanMinutes = Math.max(0, Math.round((endMs - startMs) / MS_PER_MIN));

  // Pausas no-almuerzo. Van antes del almuerzo fijo: el tope es la jornada menos las pausas.
  const openPause = b.lastPauseStartMs ? Math.max(0, nowMs - b.lastPauseStartMs) : 0;
  const pauseMinutes = Math.round((session.totalPausedMs + openPause) / MS_PER_MIN);

  // Almuerzo. Un fijo ya guardado no puede descontar más que la jornada (dato viejo).
  // Menos de 30 min o interrumpido no se descuenta: no se inventan 30 min.
  const l = session.lunch;
  const openLunch = Boolean(l.startAtMs && !l.endAtMs && session.domainStatus === "PAUSADA");
  const lunchEnd = openLunch ? nowMs : l.endAtMs;
  const deducted = deductibleLunchMinutes(
    { ...l, endAtMs: lunchEnd, interrupted: Boolean(l.interrupted || b.compliance?.mealInterrupted) },
    spanMinutes,
    pauseMinutes,
    nowMs,
    openLunch,
  );
  let lunchMinutes = deducted.minutes;
  if (deducted.unknown) warnings.push("LUNCH_DURATION_UNKNOWN");
  const second = b.compliance?.secondMeal;
  if (second) {
    const extra = deductibleLunchMinutes(
      {
        taken: true,
        startAtMs: second.startAtMs,
        endAtMs: second.endAtMs,
        deductedMinutes: second.deductedMinutes ?? null,
        interrupted: second.interrupted,
      },
      spanMinutes,
      pauseMinutes + lunchMinutes,
      nowMs,
      false,
    );
    lunchMinutes += extra.minutes;
  }

  // Tránsito
  let transitPaidMinutes = 0;
  let transitOtMinutes = 0;
  let transitUnpaidMinutes = 0;
  let transitRateMultiplier = company.transitRateMultiplier;
  let transitClipped = false;
  const cancelledTransits: { minutes: number; endAtMs: number; note: string | null }[] = [];
  for (const seg of session.transitSegments) {
    if (seg.suppressed || (seg.cancelled && seg.paid !== true)) continue;
    const minutes = TransitPolicyService.boundedMinutes(seg, startMs, endMs);
    if (seg.clipped || TransitPolicyService.overlapsOutside(seg, startMs, endMs)) transitClipped = true;
    const decision = TransitPolicyService.decide(seg, company);
    if (decision.paid) {
      transitPaidMinutes += minutes;
      transitRateMultiplier = decision.rateMultiplier;
      if (decision.countsTowardOvertime) transitOtMinutes += minutes;
      if (seg.cancelled && minutes > 0) cancelledTransits.push({ minutes, endAtMs: seg.endAtMs ?? endMs, note: seg.cancelNote ?? null });
    } else {
      transitUnpaidMinutes += minutes;
    }
  }

  const workMinutes = Math.max(
    0,
    spanMinutes - lunchMinutes - pauseMinutes - transitPaidMinutes - transitUnpaidMinutes,
  );

  if (transitClipped && !warnings.includes("TRANSIT_CLIPPED")) warnings.push("TRANSIT_CLIPPED");
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
    ...(cancelledTransits.length ? { cancelledTransits } : {}),
  };
}

interface Allocation {
  regular: number;
  otDaily: number;
  otWeekly: number;
  otDouble: number;
}

/** Unidad de reparto: una sesión (v1) o un segmento de jornada de una sesión (v2). */
export interface AllocItem extends SessionMinutes {
  /** Clave de la cubeta diaria (dateString, "S<id>" o inicio de jornada). */
  dayKey: string;
  /** Clave de la cubeta semanal (inicio del periodo semanal). */
  weekKey: number;
}

interface AllocateCtx {
  history?: CalendarHistory;
  /** Umbral semanal de un periodo de transición < 7 días [CONFIRMAR CON ASESORÍA LEGAL]. */
  transitionWeeklyThreshold?: "FULL" | "PRORATED";
  /** P6 [CONFIRMAR CON ASESORÍA LEGAL]: aplicar doble tiempo diario. */
  caDoubleTime?: boolean;
  /** P6 [CONFIRMAR CON ASESORÍA LEGAL]: aplicar la regla del séptimo día consecutivo. */
  caSeventhDay?: boolean;
}

/** Reglas P6 efectivas para una política y unas banderas. */
function p6Rules(policy: PayrollPolicy, ctx: AllocateCtx): { doubleAfter: number | null; seventh: PayrollPolicy["seventhDayRule"] } {
  const doubleAfter = ctx.caDoubleTime && policy.dailyScope === "DAY" ? (policy.doubleTimeDailyAfterMinutes ?? null) : null;
  const seventh = ctx.caSeventhDay && policy.dailyScope === "DAY" ? (policy.seventhDayRule ?? null) : null;
  return { doubleAfter, seventh };
}

/**
 * Días (dayKey) que son el séptimo día consecutivo trabajado de su semana
 * laboral: la semana tiene trabajo en 7 jornadas distintas y el día es la
 * última de ellas (los periodos de transición < 7 días nunca lo alcanzan).
 */
function seventhDays(items: AllocItem[]): Set<string> {
  const byWeek = new Map<number, Map<string, number>>();
  for (const it of items) {
    if (it.workMinutes + it.transitOtMinutes <= 0) continue;
    const days = byWeek.get(it.weekKey) ?? new Map<string, number>();
    days.set(it.dayKey, Math.min(days.get(it.dayKey) ?? Infinity, it.startMs));
    byWeek.set(it.weekKey, days);
  }
  const out = new Set<string>();
  for (const days of byWeek.values()) {
    if (days.size < 7) continue;
    const last = [...days.entries()].sort((a, b) => a[1] - b[1])[6];
    out.add(last[0]);
  }
  return out;
}

/** Umbral semanal del periodo que empieza en `week` (proporcional solo con PRORATED). */
function weeklyThreshold(policy: PayrollPolicy, week: number, ctx: AllocateCtx): number {
  const full = policy.weeklyOvertimeAfterMinutes ?? 0;
  if (ctx.transitionWeeklyThreshold !== "PRORATED") return full;
  const len = workweekEndAt(week, ctx.history) + 1 - week;
  const WEEK = 7 * 24 * 3_600_000;
  return len > 0 && len < WEEK - 2 * 3_600_000 ? Math.round((full * len) / WEEK) : full;
}

/**
 * Reparte minutos de trabajo en regular / OT diario / OT semanal según la
 * política. Los items deben venir ordenados cronológicamente. Devuelve una
 * asignación por item (mismo índice).
 */
function allocate(items: AllocItem[], policy: PayrollPolicy, ctx: AllocateCtx = {}): Allocation[] {
  const dailyUsed = new Map<string, number>(); // capacidad regular consumida por día
  const dailyTotal = new Map<string, number>(); // minutos totales (regular + OT + tránsito OT) por día (P6)
  const weeklyRegular = new Map<number, number>(); // minutos regulares por semana
  const { doubleAfter, seventh } = p6Rules(policy, ctx);
  const seventhSet = seventh ? seventhDays(items) : new Set<string>();

  return items.map((it) => {
    let regular = it.workMinutes;
    let otDaily = 0;
    let otDouble = 0;

    const key = it.dayKey;
    const totalBefore = (dailyTotal.get(key) ?? 0) + it.transitOtMinutes;
    dailyTotal.set(key, totalBefore + it.workMinutes);
    /** Minutos de este item por encima de `threshold` minutos acumulados en el día. */
    const above = (threshold: number) => Math.max(0, Math.min(it.workMinutes, totalBefore + it.workMinutes - threshold));

    if (seventh && seventhSet.has(key)) {
      // P6 séptimo día [CONFIRMAR CON ASESORÍA LEGAL]: nada es regular; los
      // primeros minutos son OT (overtimeFirstMinutes) y lo que excede
      // doubleAfterMinutes es doble tiempo (un hueco entre ambos sigue siendo OT).
      otDouble = above(seventh.doubleAfterMinutes);
      otDaily = it.workMinutes - otDouble;
      return { regular: 0, otDaily, otWeekly: 0, otDouble };
    }

    if (policy.dailyOvertimeAfterMinutes !== null) {
      const used = (dailyUsed.get(key) ?? 0) + it.transitOtMinutes;
      const capacity = Math.max(0, policy.dailyOvertimeAfterMinutes - used);
      regular = Math.min(it.workMinutes, capacity);
      otDaily = it.workMinutes - regular;
      dailyUsed.set(key, used + regular);
      if (doubleAfter !== null) {
        // P6 doble tiempo diario [CONFIRMAR CON ASESORÍA LEGAL].
        otDouble = Math.min(otDaily, above(doubleAfter));
        otDaily -= otDouble;
      }
    }

    let otWeekly = 0;
    if (policy.weeklyOvertimeAfterMinutes !== null) {
      const week = it.weekKey;
      const soFar = weeklyRegular.get(week) ?? 0;
      const capacity = Math.max(0, weeklyThreshold(policy, week, ctx) - soFar - it.transitOtMinutes);
      const weeklyRegularPart = Math.min(regular, capacity);
      otWeekly = regular - weeklyRegularPart;
      regular = weeklyRegularPart;
      weeklyRegular.set(week, soFar + regular + it.transitOtMinutes);
    }

    return { regular, otDaily, otWeekly, otDouble };
  });
}

/** Items v1: una unidad por sesión (atribución al inicio). */
function v1Items(minutes: SessionMinutes[], policy: PayrollPolicy, history: CalendarHistory, sessions: Map<number, SessionRecord>): AllocItem[] {
  return minutes.map((it) => ({
    ...it,
    dayKey: policy.dailyScope === "DAY" ? it.dateString : `S${sessions.get(it.sessionId)?.bookkeeping.splitFromSessionId ?? it.sessionId}`,
    weekKey: workweekStartAt(it.startMs, history),
  }));
}

/** Items v2 (spec v1.3 §5.2 N1): una unidad por sesión × segmento de jornada. */
function segmentItems(session: SessionRecord, company: CompanyPolicy, nowMs: number, history: CalendarHistory): AllocItem[] {
  const segs = computeSegmentMinutes(session, company, nowMs, history);
  if (!segs) return [];
  const totalSpan = segs.reduce((a, x) => a + x.spanMinutes, 0);
  const totalWork = segs.reduce((a, x) => a + x.workMinutes, 0);
  return segs.map((x, i) => ({
    sessionId: session.id,
    dateString: x.segment.dateString,
    siteId: session.siteId,
    startMs: x.segment.startMs,
    spanMinutes: x.spanMinutes,
    lunchMinutes: x.lunchMinutes,
    pauseMinutes: x.pauseMinutes,
    transitPaidMinutes: x.transitPaidMinutes,
    transitOtMinutes: x.transitOtMinutes,
    transitRateMultiplier: x.transitRateMultiplier,
    workMinutes: x.workMinutes,
    warnings: i === 0 && segs.length > 1 && totalSpan > 0 && totalWork === 0 ? [...x.warnings, "NO_WORK_MINUTES"] : x.warnings,
    ...(x.cancelledTransits.length ? { cancelledTransits: x.cancelledTransits } : {}),
    dayKey: String(x.segment.workdayStartMs),
    weekKey: x.segment.weekStartMs,
  }));
}

/**
 * Tarifa por hora de UNA jornada (schema v8): la congelada al iniciarla; si
 * no la tiene (jornada anterior al campo), la tarifa actual de Ajustes como
 * respaldo (`fallback: true`, el statement lo marca con RATE_FALLBACK_CURRENT).
 * Los multiplicadores siguen siendo los de la empresa.
 */
export function sessionRates(session: SessionRecord | undefined, rates: PayrollRates): { rates: PayrollRates; fallback: boolean } {
  const snap = session?.bookkeeping.hourlyRateSnapshot;
  if (typeof snap === "number" && Number.isFinite(snap) && snap >= 0) return { rates: { ...rates, hourlyRate: snap }, fallback: false };
  return { rates, fallback: true };
}

function buildLines(
  it: SessionMinutes,
  a: Allocation,
  rates: PayrollRates,
): PayrollLine[] {
  const base = { sessionId: it.sessionId, dateString: it.dateString, siteId: it.siteId };
  const otRate = rates.hourlyRate * rates.overtimeMultiplier;
  const doubleRate = rates.hourlyRate * (rates.doubleTimeMultiplier ?? 2);
  const transitRate = rates.hourlyRate * it.transitRateMultiplier;
  const lines: PayrollLine[] = [
    { ...base, kind: "REGULAR", minutes: a.regular, rate: rates.hourlyRate, amount: money(a.regular, rates.hourlyRate), warnings: it.warnings },
  ];
  if (a.otDaily > 0)
    lines.push({ ...base, kind: "OVERTIME_DAILY", minutes: a.otDaily, rate: otRate, amount: money(a.otDaily, otRate), warnings: [] });
  if (a.otWeekly > 0)
    lines.push({ ...base, kind: "OVERTIME_WEEKLY", minutes: a.otWeekly, rate: otRate, amount: money(a.otWeekly, otRate), warnings: [] });
  if (a.otDouble > 0)
    lines.push({ ...base, kind: "OVERTIME_DOUBLE", minutes: a.otDouble, rate: doubleRate, amount: money(a.otDouble, doubleRate), warnings: [] });
  const cancelled = it.cancelledTransits ?? [];
  const cancelledMinutes = cancelled.reduce((acc, c) => acc + c.minutes, 0);
  const normalTransit = Math.max(0, it.transitPaidMinutes - cancelledMinutes);
  if (normalTransit > 0)
    lines.push({ ...base, kind: "TRANSIT", minutes: normalTransit, rate: transitRate, amount: money(normalTransit, transitRate), warnings: [] });
  for (const c of cancelled) {
    if (c.minutes <= 0) continue;
    const rate = rates.hourlyRate;
    lines.push({
      ...base,
      kind: "TRANSIT",
      minutes: c.minutes,
      rate,
      amount: money(c.minutes, rate),
      warnings: [],
      transitCancel: { endAtMs: c.endAtMs, note: c.note },
    });
  }
  if (it.lunchMinutes > 0 || it.warnings.includes("LUNCH_DURATION_UNKNOWN"))
    lines.push({ ...base, kind: "LUNCH_DEDUCTION", minutes: it.lunchMinutes, rate: 0, amount: 0, warnings: [] });
  if (it.pauseMinutes > 0)
    lines.push({ ...base, kind: "PAUSE_DEDUCTION", minutes: it.pauseMinutes, rate: 0, amount: 0, warnings: [] });
  return lines;
}

/**
 * Política aplicable a un periodo (spec v1.3 §5.2 N3): la del pack más
 * reciente del periodo si existe (los sellados conservan su política, p. ej.
 * v1); si no, la vigente de la empresa.
 */
export function policyForPeriod(
  packs: readonly { periodStart: number; periodEnd: number; policyId: string; createdAtMs: number }[],
  periodStart: number,
  periodEnd: number,
  companyPolicyId: string,
): string {
  const latest = packs
    .filter((p) => p.periodStart === periodStart && p.periodEnd === periodEnd)
    .sort((a, b) => b.createdAtMs - a.createdAtMs)[0];
  return latest?.policyId ?? companyPolicyId;
}

/**
 * Rollup de integridad. `certified` exige: sin CONFLICT y periodo no tocado
 * por una ruptura de cadena reconocida (spec v1.3 §5.5).
 */
export function rollupIntegrity(sessions: SessionRecord[], opts: { ledgerSegmented?: boolean } = {}): IntegrityRollup {
  const byClass: Record<IntegrityClass, number> = { VALID: 0, MANUAL: 0, AUTO: 0, CONFLICT: 0 };
  for (const s of sessions) byClass[s.integrityClass]++;
  const hasConflict = byClass.CONFLICT > 0;
  // FieldCrypto v1.3 §12: certified = !hasConflict && blockedCount = 0.
  const blockedCount = sessions.filter((s) => (s.bookkeeping.certificationBlockers ?? []).length > 0).length;
  return {
    total: sessions.length,
    byClass,
    hasConflict,
    certified: !hasConflict && blockedCount === 0 && !opts.ledgerSegmented,
    ...(blockedCount > 0 ? { blockedCount } : {}),
  };
}

/** FieldCrypto v1.3 §12: certificable = no CONFLICT y sin bloqueos de certificación. */
export function isCertifiable(s: SessionRecord): boolean {
  return s.integrityClass !== "CONFLICT" && !(s.bookkeeping.certificationBlockers ?? []).length;
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

    const history = companyCalendar(input.company);
    const byId = new Map(input.sessions.map((s) => [s.id, s]));
    let closed: SessionRecord[];
    let items: AllocItem[];
    if (policy.segmentation === "WORKDAY") {
      // v2 (spec v1.3 §5.2 N5): pertenencia por solape; cada statement suma
      // solo los minutos de sus segmentos.
      const overlapping = input.sessions.filter((s) => {
        if (s.bookkeeping.isDeleted) return false;
        const start = s.actualStartAtMs ?? s.declaredStartAtMs;
        const end = sessionEndMs(s, input.nowMs);
        return start <= input.periodEnd && (end > input.periodStart || (end === start && start >= input.periodStart));
      });
      const quarantined = overlapping.filter((s) => s.domainStatus === "CUARENTENA");
      const payable = overlapping.filter((s) => s.domainStatus !== "CUARENTENA");
      const closedAll = payable.filter((s) => s.domainStatus === "CERRADA");
      if (closedAll.length !== payable.length) warnings.push("OPEN_SESSION_EXCLUDED");
      if (quarantined.length) warnings.push("QUARANTINED_SESSION_EXCLUDED");
      items = closedAll
        .flatMap((s) => segmentItems(s, input.company, input.nowMs, history))
        .filter((it) => it.startMs >= input.periodStart && it.startMs <= input.periodEnd)
        .sort((a, b) => a.startMs - b.startMs || a.sessionId - b.sessionId);
      const ids = new Set(items.map((it) => it.sessionId));
      closed = closedAll.filter((s) => ids.has(s.id)).sort((a, b) => (a.actualStartAtMs ?? a.declaredStartAtMs) - (b.actualStartAtMs ?? b.declaredStartAtMs));
    } else {
      const inPeriod = input.sessions.filter((s) => {
        const start = s.actualStartAtMs ?? s.declaredStartAtMs;
        return start >= input.periodStart && start <= input.periodEnd && !s.bookkeeping.isDeleted;
      });
      const quarantined = inPeriod.filter((s) => s.domainStatus === "CUARENTENA");
      const payable = inPeriod.filter((s) => s.domainStatus !== "CUARENTENA");
      closed = payable.filter((s) => s.domainStatus === "CERRADA");
      if (closed.length !== payable.length) warnings.push("OPEN_SESSION_EXCLUDED");
      if (quarantined.length) warnings.push("QUARANTINED_SESSION_EXCLUDED");
      const minutes = closed
        .map((s) => computeSessionMinutes(s, input.company, input.nowMs))
        .filter((x): x is SessionMinutes => x !== null)
        .sort((a, b) => a.startMs - b.startMs);
      items = v1Items(minutes, policy, history, byId);
    }

    const flags = legalFlags(input.company);
    const actx: AllocateCtx = {
      history,
      transitionWeeklyThreshold: flags.transitionWeeklyThreshold,
      caDoubleTime: flags.caDoubleTime,
      caSeventhDay: flags.caSeventhDay,
    };
    const alloc = allocate(items, policy, actx);
    const rules = p6Rules(policy, actx);
    // «Aplicada» solo si produjo minutos. La bandera encendida con 0 min es
    // «activada» y la pinta el PDF, no este campo (entra en el statement).
    const seventhSet = rules.seventh ? seventhDays(items) : new Set<string>();
    const seventhApplied = items.some((it) => seventhSet.has(it.dayKey) && it.workMinutes > 0);
    const doubleApplied =
      rules.doubleAfter !== null && items.some((it, i) => !seventhSet.has(it.dayKey) && alloc[i].otDouble > 0);
    const appliedRules = [...(doubleApplied ? ["CA_DOUBLE_TIME_12H"] : []), ...(seventhApplied ? ["CA_SEVENTH_DAY"] : [])];
    // Cada jornada paga con su propia tarifa (aunque haya varias el mismo día).
    const lines = items.flatMap((it, i) => buildLines(it, alloc[i], sessionRates(byId.get(it.sessionId), input.rates).rates));
    const premium = evaluateDayPremiums({
      items,
      sessions: byId,
      rates: input.rates,
      hourlyRateOf: (id) => sessionRates(byId.get(id), input.rates).rates.hourlyRate,
      splitByWorkday: policy.segmentation === "WORKDAY",
      history,
    });
    lines.push(...premium.lines);
    for (const w of premium.warnings) if (!warnings.includes(w)) warnings.push(w);
    appliedRules.push(...premium.appliedRules);
    const grossCents = lines.reduce((acc, l) => acc + moneyCents(l.minutes, l.rate), 0);

    const sumMin = (kinds: PayrollLine["kind"][]) =>
      lines.filter((l) => kinds.includes(l.kind)).reduce((acc, l) => acc + l.minutes, 0);

    const regularMin = sumMin(["REGULAR"]);
    const otDailyMin = sumMin(["OVERTIME_DAILY"]);
    const otWeeklyMin = sumMin(["OVERTIME_WEEKLY"]);
    const otDoubleMin = sumMin(["OVERTIME_DOUBLE"]);
    const transitMin = sumMin(["TRANSIT"]);
    const lunchMin = sumMin(["LUNCH_DEDUCTION"]);
    const pauseMin = sumMin(["PAUSE_DEDUCTION"]);
    items.forEach((it) =>
      it.warnings.forEach((w) => {
        const tag = `${w}#${it.sessionId}`;
        if (!warnings.includes(tag)) warnings.push(tag);
      }),
    );
    if (ledgerSegmented) warnings.push("LEDGER_CHAIN_SEGMENTED");
    // Marca de tarifa (schema v8): respaldo con la tarifa actual y tarifa 0 nunca silenciosa.
    for (const sess of closed) {
      const r = sessionRates(sess, input.rates);
      if (r.fallback) warnings.push(`RATE_FALLBACK_CURRENT#${sess.id}`);
      if (r.rates.hourlyRate === 0) warnings.push(`HOURLY_RATE_ZERO#${sess.id}`);
    }

    return {
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      lines,
      regularHours: regularMin / 60,
      overtimeHours: (otDailyMin + otWeeklyMin + otDoubleMin) / 60,
      transitHours: transitMin / 60,
      lunchMinutes: lunchMin,
      grossEstimate: grossCents / 100,
      integrityRollup: rollupIntegrity(closed, { ledgerSegmented }),
      policyId: policy.id,
      packHash: null,
      overtimeDailyHours: otDailyMin / 60,
      overtimeWeeklyHours: otWeeklyMin / 60,
      deductionMinutes: lunchMin + pauseMin,
      sessionIds: closed.map((s) => s.id),
      warnings,
      ...(otDoubleMin > 0 ? { overtimeDoubleHours: otDoubleMin / 60 } : {}),
      ...(appliedRules.length ? { appliedRules } : {}),
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
    /** Política del periodo que contiene la sesión (policyForPeriod, §5.2 N3). Por defecto session.policyId. */
    policyId: string = session.policyId,
  ): SessionPayrollPreview | null {
    const policy = getPayrollPolicy(policyId);
    const history = companyCalendar(company);
    let items: AllocItem[];
    if (policy.segmentation === "WORKDAY") {
      items = segmentItems(session, company, nowMs, history);
      if (!items.length) return null;
    } else {
      const it = computeSessionMinutes(session, company, nowMs);
      if (!it) return null;
      items = v1Items([it], policy, history, new Map([[session.id, session]]));
    }
    const flags = legalFlags(company);
    const a = allocate(items, { ...policy, weeklyOvertimeAfterMinutes: null, seventhDayRule: null }, { history, caDoubleTime: flags.caDoubleTime });
    const priced = sessionRates(session, rates).rates;
    const lines = items.flatMap((it, i) => buildLines(it, a[i], priced));
    const premium = evaluateDayPremiums({
      items,
      sessions: new Map([[session.id, session]]),
      rates,
      hourlyRateOf: () => priced.hourlyRate,
      splitByWorkday: policy.segmentation === "WORKDAY",
      history,
    });
    const previewLines = lines.concat(premium.lines);
    const previewCents = previewLines.reduce((acc, l) => acc + moneyCents(l.minutes, l.rate), 0);
    const sum = (f: (x: AllocItem) => number) => items.reduce((acc, x) => acc + f(x), 0);
    return {
      sessionId: session.id,
      netMinutes: sum((x) => x.workMinutes + x.transitPaidMinutes),
      regularMinutes: a.reduce((acc, x) => acc + x.regular, 0),
      overtimeDailyMinutes: a.reduce((acc, x) => acc + x.otDaily + x.otDouble, 0),
      transitMinutes: sum((x) => x.transitPaidMinutes),
      lunchMinutes: sum((x) => x.lunchMinutes),
      grossEstimate: previewCents / 100,
      certified: isCertifiable(session),
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
