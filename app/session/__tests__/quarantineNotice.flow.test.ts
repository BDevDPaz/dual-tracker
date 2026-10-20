/** Detalle e historial: una jornada en cuarentena se avisa y no se paga. */
import { t } from "../../../src/i18n";
import { PayrollEngineService } from "../../../src/services/domain/PayrollEngineService";
import { PersistenceService } from "../../../src/services/persistence/PersistenceService";
import { COMPANY, HOUR } from "../../../test/fixtures/session.fixture";
import { getWeekEnd, getWeekStart } from "../../../src/utils/dateUtils";
import { seedWorld, startAndArrive } from "../../../test/helpers";
import { time } from "../../../test/time";

describe("app/session cuarentena", () => {
  test("el aviso existe en es y en, y la jornada no entra en el statement", async () => {
    expect(t("session.quarantineNotice", {}, "es")).toMatch(/cuarentena/);
    expect(t("session.quarantineNotice", {}, "en")).toMatch(/quarantined/);
    const { siteA } = await seedWorld();
    const session = await startAndArrive(siteA);
    const db = await PersistenceService.init();
    await db.runAsync(`UPDATE sessions SET domain_status = 'ACTIVE' WHERE id = ?`, [session.id]);
    const read = await PersistenceService.getSession(session.id);
    expect(read?.domainStatus).toBe("CUARENTENA");
    const statement = PayrollEngineService.buildStatement({
      periodStart: getWeekStart(time.now()),
      periodEnd: getWeekEnd(time.now()),
      sessions: [read!],
      rates: { hourlyRate: 20, overtimeMultiplier: 1.5 },
      company: COMPANY,
      policyId: COMPANY.overtimePolicyId,
      nowMs: time.now() + HOUR,
    });
    expect(statement.sessionIds).toEqual([]);
    expect(statement.grossEstimate).toBe(0);
  });
});
