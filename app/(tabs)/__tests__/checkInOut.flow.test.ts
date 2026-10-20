/** Hoy: iniciar jornada, llegada y cierre. Es lo que emite app/(tabs)/index.tsx. */
import { routeIntent } from "../../../src/services/application/intentRouter";
import { PersistenceService } from "../../../src/services/persistence/PersistenceService";
import { HOUR } from "../../../test/fixtures/session.fixture";
import { makeEnter } from "../../../test/fixtures/spatial.fixture";
import { mustDispatch, seedWorld } from "../../../test/helpers";
import { time } from "../../../test/time";

describe("app/(tabs) fichar", () => {
  test("START_DAY deja ESPERANDO, la llegada ACTIVA y CLOSE_DAY cierra", async () => {
    const { siteA } = await seedWorld();
    const started = await routeIntent({ type: "START_DAY", siteId: siteA });
    expect(started.ok).toBe(true);
    const open = await PersistenceService.getOpenSession();
    expect(open?.domainStatus).toBe("ESPERANDO");
    time.travel(10 * 60_000);
    await mustDispatch({ type: "ARRIVAL_CONFIRMED", fact: makeEnter({ sessionId: open!.id, siteId: siteA, timestampMs: time.now() }) }, "GEOFENCE");
    expect((await PersistenceService.getOpenSession())?.domainStatus).toBe("ACTIVA");
    time.travel(8 * HOUR);
    const closed = await routeIntent({ type: "CLOSE_DAY", lunchDeductedMinutes: 0 });
    expect(closed.ok).toBe(true);
    expect(await PersistenceService.getOpenSession()).toBeNull();
    expect((await PersistenceService.getSession(open!.id))?.domainStatus).toBe("CERRADA");
  });
});
