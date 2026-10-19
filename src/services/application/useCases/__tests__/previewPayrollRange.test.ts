/** Dos semanas de 40 h no se funden en una sola bolsa de horas extra. */
import { PersistenceService } from "../../../persistence/PersistenceService";
import { HOUR, MONDAY_8AM, makeClosedSession } from "../../../../../test/fixtures/session.fixture";
import { getWeekEnd, getWeekStart, shiftWeek } from "../../../../utils/dateUtils";
import { combineWeekStatements } from "../../../../utils/reportRange";
import { previewPayrollRange } from "../generateWeeklyPayroll";

describe("previewPayrollRange", () => {
  beforeEach(() => PersistenceService.init());

  test("cada semana laboral pasa por el motor por separado", async () => {
    const week1 = getWeekStart(MONDAY_8AM);
    const week2 = shiftWeek(week1, 1);
    for (const start of [week1, week2]) {
      for (let day = 0; day < 5; day++) {
        await PersistenceService.insertSession(makeClosedSession(start + day * 24 * HOUR + 15 * HOUR, 8));
      }
    }
    const end = getWeekEnd(week2);
    const preview = await previewPayrollRange(week1, end);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.data.weeks).toHaveLength(2);
    for (const week of preview.data.weeks) {
      expect(week.statement.regularHours).toBe(40);
      expect(week.statement.overtimeHours).toBe(0);
      expect(week.end - week.start).toBeLessThan(8 * 24 * HOUR);
    }
    const combined = combineWeekStatements(preview.data.weeks.map((w) => w.statement));
    expect(combined!.regularHours).toBe(80);
    expect(combined!.overtimeHours).toBe(0);
  });
});
