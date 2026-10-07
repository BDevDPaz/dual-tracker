/**
 * Cursor semanal del Historial.
 * Si el operario no eligió otra semana, el cursor sigue a la semana que
 * contiene `nowMs` (medianoche / cambio de calendario). Si navegó con las
 * flechas, se queda donde lo dejó hasta que vuelva a la semana en curso.
 */
import { getWeekStart, type CalendarHistory } from "../../utils/dateUtils";

export function resolveWeekCursor(input: {
  weekStart: number;
  nowMs: number;
  pinned: boolean;
  history?: CalendarHistory | null;
}): number {
  if (input.pinned) return input.weekStart;
  const current = getWeekStart(input.nowMs, input.history);
  return Number.isFinite(current) ? current : input.weekStart;
}
