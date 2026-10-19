import { IntegrityLedgerService } from "../../domain/IntegrityLedgerService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { MIN } from "../../../../test/fixtures/session.fixture";
import { seedWorld, startAndArrive } from "../../../../test/helpers";
import { time } from "../../../../test/time";
import { observeClock } from "../clockSample";
import { TimeAuthorityService } from "../TimeAuthorityService";

describe("observeClock", () => {
  test("con acuerdo por encima del umbral anota CLOCK_SAMPLED y deja la jornada en Revisar", async () => {
    const { siteA } = await seedWorld();
    const session = await startAndArrive(siteA);
    TimeAuthorityService.__setFetch(async () => ({
      headers: { get: (k: string) => (k.toLowerCase() === "date" ? new Date(time.now() - 4 * MIN).toUTCString() : null) },
    }));
    await observeClock("GEOFENCE");
    const ledger = await IntegrityLedgerService.listForSession(session.id);
    expect(ledger.some((e) => e.intent === "CLOCK_SAMPLED")).toBe(true);
    expect((await PersistenceService.getSession(session.id))!.bookkeeping.integrityReason).toBe("CLOCK_DRIFT");
  });

  test("sin red no degrada la jornada", async () => {
    const { siteA } = await seedWorld();
    const session = await startAndArrive(siteA);
    TimeAuthorityService.__setFetch(async () => {
      throw new Error("offline");
    });
    await observeClock("BREADCRUMB");
    expect((await PersistenceService.getSession(session.id))!.integrityClass).toBe("VALID");
    expect(TimeAuthorityService.isDriftExceeded()).toBe(false);
  });
});
