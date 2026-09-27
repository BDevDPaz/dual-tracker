/**
 * Casos de uso: cambio de calendario laboral (spec v1.3 §5.1) [CONFIRMAR CON ASESORÍA LEGAL].
 * ============================================================================
 *  - Solo prospectivo: entra en vigor en E = fin de la semana laboral (bajo el
 *    calendario vigente) que contiene el instante de solicitud T. La semana en
 *    curso se liquida entera con el calendario anterior.
 *  - Rechazo CALENDAR_CHANGE_CONFLICTS_SEALED si existe un pack con periodEnd > E.
 *  - Si E no es un inicio de semana del calendario nuevo, [E, E′) es un periodo
 *    de transición ("T" + fecha) con cubeta semanal propia.
 *  - Asiento CALENDAR_CHANGED en la MISMA transacción que el guardado de settings.
 *  - Anulación (CALENDAR_CHANGE_CANCELLED) solo antes de E.
 *  - Decisión propia (no en la spec): con un cambio pendiente, otro se rechaza
 *    con CALENDAR_CHANGE_PENDING (hay que anular primero): evita historiales
 *    con dos entradas futuras.
 */
import type { CalendarEntry, IntentResult, SettingsSnapshot } from "../../../core/contracts";
import { StoreActions } from "../../../core/store";
import { companyCalendar, pendingCalendarChange } from "../../../utils/companyPolicy";
import { calendarAt, isTransitionPeriodAt, isValidCalendar, workweekEndAt } from "../../../utils/dateUtils";
import { IntegrityLedgerService } from "../../domain/IntegrityLedgerService";
import { TimeAuthorityService } from "../../evidence/TimeAuthorityService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { SettingsService } from "../../persistence/SettingsService";

type Cal = Pick<CalendarEntry, "workdayStartMinutes" | "workweekStartDay">;

export interface CalendarChangeData {
  from: Cal;
  to: Cal;
  requestedAtMs: number;
  effectiveFromMs: number;
  transition: { startMs: number; endMs: number } | null;
}

const pick = (c: CalendarEntry): Cal => ({ workdayStartMinutes: c.workdayStartMinutes, workweekStartDay: c.workweekStartDay });

export async function requestCalendarChange(settings: SettingsSnapshot, to: Cal): Promise<IntentResult<{ settings: SettingsSnapshot; change: CalendarChangeData | null }>> {
  if (!isValidCalendar(to)) return { ok: false, code: "INVALID_VALUE" };
  const T = TimeAuthorityService.now();
  const history = companyCalendar(settings.company);
  if (pendingCalendarChange(settings.company, T)) return { ok: false, code: "CALENDAR_CHANGE_PENDING" };
  const current = calendarAt(T, history);
  if (current.workdayStartMinutes === to.workdayStartMinutes && current.workweekStartDay === to.workweekStartDay) {
    return { ok: true, data: { settings, change: null } };
  }
  const E = workweekEndAt(T, history) + 1;
  const packs = await PersistenceService.listPacks();
  if (packs.some((p) => p.statement.periodEnd > E || p.manifest.periodEnd > E)) {
    return { ok: false, code: "CALENDAR_CHANGE_CONFLICTS_SEALED" };
  }
  const entry: CalendarEntry = { effectiveFromMs: E, ...to };
  const nextHistory = [...history, entry];
  const transition = isTransitionPeriodAt(E, nextHistory) ? { startMs: E, endMs: workweekEndAt(E, nextHistory) + 1 } : null;
  const change: CalendarChangeData = { from: pick(current), to: { ...to }, requestedAtMs: T, effectiveFromMs: E, transition };
  const next: SettingsSnapshot = { ...settings, company: { ...settings.company, calendarHistory: nextHistory } };
  await PersistenceService.transaction(async (db) => {
    await SettingsService.saveCompany(next.company, db);
    await IntegrityLedgerService.append(
      {
        sessionId: null,
        actor: "USER",
        intent: "CALENDAR_CHANGED",
        fromState: null,
        toState: null,
        reason: "ADMIN_CALENDAR_CHANGE",
        timestampMs: T,
        integrityClass: null,
        data: change,
      },
      db,
    );
  });
  StoreActions.settingsReplaced(next);
  return { ok: true, data: { settings: next, change } };
}

export async function cancelCalendarChange(settings: SettingsSnapshot): Promise<IntentResult<{ settings: SettingsSnapshot }>> {
  const now = TimeAuthorityService.now();
  const history = companyCalendar(settings.company);
  const pending = pendingCalendarChange(settings.company, now);
  if (!pending) {
    const last = history[history.length - 1];
    return { ok: false, code: last && last.effectiveFromMs > 0 ? "CALENDAR_CHANGE_ALREADY_EFFECTIVE" : "NO_PENDING_CALENDAR_CHANGE" };
  }
  const nextHistory = history.filter((e) => e !== pending);
  const next: SettingsSnapshot = { ...settings, company: { ...settings.company, calendarHistory: nextHistory } };
  await PersistenceService.transaction(async (db) => {
    await SettingsService.saveCompany(next.company, db);
    await IntegrityLedgerService.append(
      {
        sessionId: null,
        actor: "USER",
        intent: "CALENDAR_CHANGE_CANCELLED",
        fromState: null,
        toState: null,
        reason: "ADMIN_CALENDAR_CHANGE_CANCELLED",
        timestampMs: now,
        integrityClass: null,
        data: { cancelled: pending, cancelledAtMs: now },
      },
      db,
    );
  });
  StoreActions.settingsReplaced(next);
  return { ok: true, data: { settings: next } };
}
