/**
 * Almuerzo sin pago: una deducción por dayKey de nómina, no por jornada.
 * ============================================================================
 * El dayKey es el de PayrollEngineService:
 *  - v1 (sesión): `bookkeeping.dateString` (jornada local, toDateString).
 *  - v2 (WORKDAY): inicio de la jornada del calendario donde cae el almuerzo
 *    (`String(workdayStartMs)`), en la zona de la política.
 * No usa la sesión ni la medianoche UTC.
 *
 * Cuenta como almuerzo del día (lunchUsedToday) si deductibleLunchMinutes
 * descuenta algo: pausa Almuerzo con duración real ≥ 30 min, o minutos
 * declarados en el cierre (30/45/60). Una pausa < 30 min no cuenta.
 * Varias jornadas del mismo dayKey conservan solo la primera.
 */
import type { CompanyPolicy, SessionRecord } from "../../core/contracts";
import { companyCalendar, companyTimezone } from "../../utils/companyPolicy";
import { withCorporateZone, workdayStartAt } from "../../utils/dateUtils";
import { getPayrollPolicy } from "./payrollPolicies";
import { deductibleLunchMinutes } from "./segmentation";

const MIN = 60_000;

export interface DayLunch {
  sessionId: number;
  dayKey: string;
  minutes: number;
  startAtMs: number | null;
  endAtMs: number | null;
}

function payable(session: SessionRecord): boolean {
  return !session.bookkeeping.isDeleted && !session.bookkeeping.cancelled && session.domainStatus !== "CUARENTENA";
}

/** Clave diaria que usaría la nómina para el almuerzo de esta jornada. */
export function payrollDayKey(session: SessionRecord, company: CompanyPolicy, nowMs: number, policyId: string): string {
  const policy = getPayrollPolicy(policyId);
  if (policy.segmentation === "WORKDAY") {
    const anchor = session.lunch.startAtMs ?? session.actualStartAtMs ?? session.declaredStartAtMs ?? nowMs;
    const zone = session.bookkeeping.recordedTimeZone ?? companyTimezone(company);
    return withCorporateZone(zone, () => String(workdayStartAt(anchor, companyCalendar(company))));
  }
  if (policy.dailyScope === "DAY") return session.bookkeeping.dateString;
  return `S${session.bookkeeping.splitFromSessionId ?? session.id}`;
}

/**
 * Almuerzo que esta jornada aportaría al día. null si no se descuenta
 * (pausa < 30 min, interrumpida, o sin declaración).
 */
export function qualifyingLunch(session: SessionRecord, nowMs: number): Omit<DayLunch, "dayKey"> | null {
  if (!payable(session)) return null;
  const l = session.lunch;
  const interrupted = Boolean(l.interrupted || session.bookkeeping.compliance?.mealInterrupted);
  const open = Boolean(l.startAtMs != null && l.endAtMs == null && session.domainStatus === "PAUSADA");
  const endAtMs = open ? nowMs : l.endAtMs;
  const start = session.actualStartAtMs ?? session.declaredStartAtMs;
  const end = session.endAtMs ?? nowMs;
  const span = Math.max(0, Math.round((Math.max(end, start) - start) / MIN));
  const pause = Math.max(0, Math.round(session.totalPausedMs / MIN));
  const deducted = deductibleLunchMinutes({ ...l, endAtMs, interrupted }, span, pause, nowMs, open);
  if (deducted.unknown || deducted.minutes <= 0) return null;
  return { sessionId: session.id, minutes: deducted.minutes, startAtMs: l.startAtMs, endAtMs };
}

/** Primera deducción del dayKey (por inicio del almuerzo, luego por id). */
export function lunchOnDay(
  sessions: readonly SessionRecord[],
  dayKey: string,
  company: CompanyPolicy,
  nowMs: number,
  policyId: string,
): DayLunch | null {
  const hits: { at: number; lunch: DayLunch }[] = [];
  for (const session of sessions) {
    const hit = qualifyingLunch(session, nowMs);
    if (!hit) continue;
    const key = payrollDayKey(session, company, nowMs, policyId);
    if (key !== dayKey) continue;
    const at = hit.startAtMs ?? session.actualStartAtMs ?? session.declaredStartAtMs;
    hits.push({ at, lunch: { ...hit, dayKey: key } });
  }
  hits.sort((a, b) => a.at - b.at || a.lunch.sessionId - b.lunch.sessionId);
  return hits[0]?.lunch ?? null;
}

/** true si ese dayKey ya tiene el almuerzo del día. Es lunchUsedToday. */
export function lunchUsedOnDay(
  sessions: readonly SessionRecord[],
  dayKey: string,
  company: CompanyPolicy,
  nowMs: number,
  policyId: string,
): boolean {
  return lunchOnDay(sessions, dayKey, company, nowMs, policyId) != null;
}

/** Al cerrar: I2 si el día ya descontó; si no, I1. */
export function lunchPromptForClose(used: DayLunch | null): "I1" | "I2" {
  return used ? "I2" : "I1";
}

/**
 * Copias para el motor: en cada dayKey solo la primera jornada cerrada
 * conserva el almuerzo principal. La segunda comida (compliance.secondMeal)
 * no se toca. No muta los registros de entrada.
 */
export function withOneLunchPerDay(
  sessions: readonly SessionRecord[],
  company: CompanyPolicy,
  nowMs: number,
  policyId: string,
): SessionRecord[] {
  const groups = new Map<string, { at: number; id: number }[]>();
  for (const session of sessions) {
    if (session.domainStatus !== "CERRADA") continue;
    const hit = qualifyingLunch(session, nowMs);
    if (!hit) continue;
    const key = payrollDayKey(session, company, nowMs, policyId);
    const at = hit.startAtMs ?? session.actualStartAtMs ?? session.declaredStartAtMs;
    const list = groups.get(key) ?? [];
    list.push({ at, id: session.id });
    groups.set(key, list);
  }
  const drop = new Set<number>();
  for (const list of groups.values()) {
    list.sort((a, b) => a.at - b.at || a.id - b.id);
    for (const row of list.slice(1)) drop.add(row.id);
  }
  if (!drop.size) return [...sessions];
  return sessions.map((session) =>
    drop.has(session.id)
      ? { ...session, lunch: { taken: false, startAtMs: null, endAtMs: null, deductedMinutes: 0 } }
      : session,
  );
}
