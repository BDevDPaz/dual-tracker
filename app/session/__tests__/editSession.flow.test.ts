/** Detalle de sesión: editar horas con nota. Lo emite app/session/[id].tsx. */
import { routeIntent } from "../../../src/services/application/intentRouter";
import { PersistenceService } from "../../../src/services/persistence/PersistenceService";
import { HOUR } from "../../../test/fixtures/session.fixture";
import { seedWorld, startAndArrive } from "../../../test/helpers";
import { time } from "../../../test/time";

describe("app/session editar", () => {
  test("PATCH_SESSION mueve el fin y deja nota", async () => {
    const { siteA } = await seedWorld();
    const session = await startAndArrive(siteA);
    const start = session.actualStartAtMs ?? session.declaredStartAtMs;
    time.travel(8 * HOUR);
    expect((await routeIntent({ type: "CLOSE_DAY", lunchDeductedMinutes: 0 })).ok).toBe(true);
    const end = start + 7 * HOUR;
    const patched = await routeIntent({
      type: "PATCH_SESSION",
      sessionId: session.id,
      declaredStartAtMs: start,
      endAtMs: end,
      note: "salí una hora antes",
    });
    expect(patched.ok).toBe(true);
    const stored = await PersistenceService.getSession(session.id);
    expect(stored?.endAtMs).toBe(end);
    expect(stored?.bookkeeping.manualNote).toBe("salí una hora antes");
    expect(stored?.integrityClass).toBe("MANUAL");
  });
});
