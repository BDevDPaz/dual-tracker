/** El historial sigue la semana en curso salvo que el operario haya navegado. */
import { HOUR, MONDAY_8AM } from "../../../../test/fixtures/session.fixture";
import { getWeekStart } from "../../../utils/dateUtils";
import { resolveWeekCursor } from "../weekCursor";

const WEEK = 7 * 24 * HOUR;

describe("resolveWeekCursor", () => {
  test("sin anclar, el cursor salta al cruce de semana", () => {
    const current = getWeekStart(MONDAY_8AM);
    expect(resolveWeekCursor({ weekStart: current, nowMs: MONDAY_8AM, pinned: false })).toBe(current);
    const later = MONDAY_8AM + WEEK;
    expect(resolveWeekCursor({ weekStart: current, nowMs: later, pinned: false })).toBe(getWeekStart(later));
    expect(getWeekStart(later)).not.toBe(current);
  });

  test("anclado, se queda en la semana elegida aunque cambie el día", () => {
    const current = getWeekStart(MONDAY_8AM);
    const later = MONDAY_8AM + WEEK;
    expect(resolveWeekCursor({ weekStart: current, nowMs: later, pinned: true })).toBe(current);
  });
});
