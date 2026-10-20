/** Hoy: cerrar con almuerzo declarado. Lo emite el modal de cierre. */
import { routeIntent } from "../../../src/services/application/intentRouter";
import { PersistenceService } from "../../../src/services/persistence/PersistenceService";
import { HOUR } from "../../../test/fixtures/session.fixture";
import { seedWorld, startAndArrive } from "../../../test/helpers";
import { time } from "../../../test/time";

describe("app/(tabs) cerrar con almuerzo", () => {
  test("CLOSE_DAY guarda los minutos de almuerzo que caben en la jornada", async () => {
    const { siteA } = await seedWorld();
    const session = await startAndArrive(siteA);
    time.travel(8 * HOUR);
    const closed = await routeIntent({ type: "CLOSE_DAY", lunchDeductedMinutes: 30 });
    expect(closed.ok).toBe(true);
    const stored = await PersistenceService.getSession(session.id);
    expect(stored?.domainStatus).toBe("CERRADA");
    expect(stored?.lunch.deductedMinutes).toBe(30);
  });
});