/** Jornada huérfana: Revisar, sin inventar horas. */
import { IntegrityLedgerService } from "../IntegrityLedgerService";
import { SessionEngineService } from "../SessionEngineService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { reviewAbandonedSession } from "../../runtime/orphanSession";
import { touchHeartbeat } from "../../runtime/heartbeat";
import { MIN } from "../../../../test/fixtures/session.fixture";
import { SITE_LAT, SITE_LON } from "../../../../test/fixtures/spatial.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../test/helpers";
import { LocationMock } from "../../../../test/runtimeHarness";
import { time } from "../../../../test/time";

async function abandon() {
  const { siteA } = await seedWorld();
  const session = await startAndArrive(siteA);
  await touchHeartbeat();
  time.travel(50 * MIN);
  LocationMock.__setPosition(SITE_LAT + 0.05, SITE_LON, 10);
  expect(await reviewAbandonedSession()).toBe("marked");
  return session;
}

describe("jornada huérfana", () => {
  test("sin nota no cierra; confirmar el fin usa la hora del operario", async () => {
    const session = await abandon();
    const rejected = await SessionEngineService.dispatch({ type: "CONFIRM_ORPHAN_END", endAtMs: time.now() - MIN, note: "   " }, "UI");
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.code).toBe("NOTE_REQUIRED");
    const future = await SessionEngineService.dispatch({ type: "CONFIRM_ORPHAN_END", endAtMs: time.now() + 3 * MIN, note: "me fui" }, "UI");
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.code).toBe("FUTURE_TIME");
    expect((await PersistenceService.getSession(session.id))!.endAtMs).toBeNull();
    const end = time.now() - 10 * MIN;
    const closed = await mustDispatch({ type: "CONFIRM_ORPHAN_END", endAtMs: end, note: "me fui a las diez" });
    expect(closed.domainStatus).toBe("CERRADA");
    expect(closed.endAtMs).toBe(end);
    expect(closed.integrityClass).toBe("MANUAL");
    expect(closed.bookkeeping.integrityReason).toBe("ORPHAN_END_CONFIRMED");
    expect(closed.bookkeeping.manualNote).toContain("me fui");
    const ledger = await IntegrityLedgerService.listForSession(session.id);
    expect(ledger.map((e) => e.intent)).toContain("MARK_ORPHAN");
    expect(ledger.map((e) => e.intent)).toContain("CONFIRM_ORPHAN_END");
  });

  test("seguir trabajando no inventa un fin y el cierre automático no aplica", async () => {
    const session = await abandon();
    const auto = await SessionEngineService.dispatch({ type: "AUTO_CLOSE", cause: "MAX_OPEN_12H", confirmedOutside: true }, "WATCHDOG");
    expect(auto.ok).toBe(false);
    const open = await mustDispatch({ type: "CONTINUE_ORPHAN" });
    expect(open.domainStatus).toBe("ACTIVA");
    expect(open.endAtMs).toBeNull();
    expect(open.integrityClass).toBe("MANUAL");
    expect(open.bookkeeping.integrityReason).toBe("ORPHAN_CONTINUED");
    expect((await PersistenceService.getSession(session.id))!.endAtMs).toBeNull();
  });

  test("sin heartbeat previo no marca abandono", async () => {
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(13 * 60 * MIN);
    LocationMock.__setPosition(SITE_LAT + 0.05, SITE_LON, 10);
    expect(await reviewAbandonedSession()).toBe("clear");
  });
});
