/** Hoy: almuerzo y reanudación. Los emite app/(tabs)/index.tsx. */
import { routeIntent } from "../../../src/services/application/intentRouter";
import { PersistenceService } from "../../../src/services/persistence/PersistenceService";
import { HOUR } from "../../../test/fixtures/session.fixture";
import { seedWorld, startAndArrive } from "../../../test/helpers";
import { time } from "../../../test/time";

describe("app/(tabs) almuerzo", () => {
  test("START_LUNCH pasa a PAUSADA y RESUME vuelve a ACTIVA", async () => {
    const { siteA } = await seedWorld();
    const session = await startAndArrive(siteA);
    time.travel(4 * HOUR);
    expect((await routeIntent({ type: "START_LUNCH" })).ok).toBe(true);
    expect((await PersistenceService.getSession(session.id))?.domainStatus).toBe("PAUSADA");
    time.travel(30 * 60_000);
    expect((await routeIntent({ type: "RESUME" })).ok).toBe(true);
    expect((await PersistenceService.getSession(session.id))?.domainStatus).toBe("ACTIVA");
  });
});
