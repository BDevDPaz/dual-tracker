/** Porción visible de una jornada que cruza la semana. */
import { fromWallClock, getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { COMPANY, makeClosedSession } from "../../../../test/fixtures/session.fixture";
import { companyCalendar } from "../../../utils/companyPolicy";
import { periodSliceOf } from "../periodSlice";

const H = companyCalendar(COMPANY);

describe("periodSliceOf", () => {
  test("dom 18 oct 19:50 → lun 19 oct 00:25 se parte en 19:50–00:00 y 00:00–00:25", () => {
    const start = fromWallClock(2026, 10, 18, 19, 50);
    const end = fromWallClock(2026, 10, 19, 0, 25);
    const s = makeClosedSession(start, 0, { endAtMs: end, id: 9 });
    const w1s = getWeekStart(start);
    const w1e = getWeekEnd(start);
    const w2s = getWeekStart(end);
    const w2e = getWeekEnd(end);
    const a = periodSliceOf(s, w1s, w1e, H, end)!;
    const b = periodSliceOf(s, w2s, w2e, H, end)!;
    expect(a.displayStartMs).toBe(start);
    expect(a.displayEndMs).toBe(w2s);
    expect(a.continuesFromMs).toBeNull();
    expect(a.continuesUntilMs).toBe(end);
    expect(b.displayStartMs).toBe(w2s);
    expect(b.displayEndMs).toBe(end);
    expect(b.continuesFromMs).toBe(start);
    expect(b.continuesUntilMs).toBeNull();
    expect(a.zeroDuration).toBe(false);
    expect(b.zeroDuration).toBe(false);
  });

  test("un cierre en el mismo minuto es duración cero", () => {
    const t = fromWallClock(2026, 10, 18, 16, 45);
    const s = makeClosedSession(t, 0, { endAtMs: t + 20_000 });
    const slice = periodSliceOf(s, getWeekStart(t), getWeekEnd(t), H, t)!;
    expect(slice.zeroDuration).toBe(true);
    expect(slice.continuesFromMs).toBeNull();
  });
});
