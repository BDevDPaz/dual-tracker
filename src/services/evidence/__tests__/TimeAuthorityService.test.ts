/** T3 — TimeAuthority: now() inyectable; deriva > umbral marca CLOCK_DRIFT y bloquea VALID. */
import { SessionEngineService } from "../../domain/SessionEngineService";
import { CLOCK_DRIFT_THRESHOLD_MS, TimeAuthorityService } from "../TimeAuthorityService";
import { HOUR, MIN } from "../../../../test/fixtures/session.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../test/helpers";
import { FIXED_EPOCH_ISO, time } from "../../../../test/time";

describe("TimeAuthorityService", () => {
  test("now() es la época fija inyectada por setup y avanza con time.travel/time.set", () => {
    expect(TimeAuthorityService.nowIso()).toBe(FIXED_EPOCH_ISO);
    time.travel(90 * MIN);
    expect(TimeAuthorityService.nowIso()).toBe("2026-09-26T16:30:00.000Z");
    time.set("2026-09-26T17:30:00.000Z");
    expect(TimeAuthorityService.now()).toBe(Date.parse("2026-09-26T17:30:00.000Z"));
    expect(TimeAuthorityService.todayDateString()).toBe("2026-09-26"); // 10:30 PDT
    expect(TimeAuthorityService.toDateString(Date.parse("2026-09-27T06:00:00Z"))).toBe("2026-09-26"); // 23:00 PDT
  });

  test("viajar en el tiempo no es deriva; saltar la pared sí", () => {
    time.travel(5 * HOUR);
    expect(TimeAuthorityService.currentDriftMs()).toBe(0);
    time.jumpWall(-2 * MIN);
    expect(TimeAuthorityService.currentDriftMs()).toBe(2 * MIN);
    expect(TimeAuthorityService.isDriftExceeded()).toBe(false);
    TimeAuthorityService.reanchor();
    expect(TimeAuthorityService.currentDriftMs()).toBe(0);
  });

  test("[obligatorio #8] deriva de 4 min marca CLOCK_DRIFT y bloquea VALID", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    expect(s.integrityClass).toBe("VALID");
    time.travel(6 * HOUR);
    time.jumpWall(4 * MIN); // el usuario adelanta el reloj 4 min
    expect(TimeAuthorityService.currentDriftMs()).toBe(4 * MIN);
    expect(TimeAuthorityService.isDriftExceeded()).toBe(true);
    expect(4 * MIN).toBeGreaterThan(CLOCK_DRIFT_THRESHOLD_MS);

    const closed = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    expect(closed.integrityClass).not.toBe("VALID");
    expect(closed.integrityClass).toBe("CONFLICT");
    expect(closed.bookkeeping.integrityReason).toBe("CLOCK_DRIFT");
  });

  test("[obligatorio #8] con deriva, una jornada nueva nace CONFLICT(CLOCK_DRIFT)", async () => {
    const { siteA } = await seedWorld();
    time.jumpWall(-4 * MIN);
    const s = await mustDispatch({ type: "START_DAY", siteId: siteA });
    expect(s.integrityClass).toBe("CONFLICT");
    expect(s.bookkeeping.integrityReason).toBe("CLOCK_DRIFT");
  });

  test("deriva por debajo del umbral (2 min) mantiene VALID", async () => {
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(6 * HOUR);
    time.jumpWall(2 * MIN);
    expect((await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" })).integrityClass).toBe("VALID");
  });

  test("INTEGRITY_DEGRADE(CLOCK_DRIFT) sobre jornada abierta (ruta de onForeground)", async () => {
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    const r = await SessionEngineService.dispatch({ type: "INTEGRITY_DEGRADE", cause: "CLOCK_DRIFT" }, "SYSTEM");
    expect(r.ok && r.data?.session.integrityClass).toBe("CONFLICT");
  });

  test("checkReferenceTime: sin URL → null; con cabecera Date calcula el desfase", async () => {
    TimeAuthorityService.configureReference(null);
    expect(await TimeAuthorityService.checkReferenceTime()).toBeNull();
    const ref = new Date(time.now() - 5 * MIN).toUTCString();
    const header = (value: string | null) => ({ headers: { get: (k: string) => (k.toLowerCase() === "date" ? value : null) } });
    TimeAuthorityService.__setFetch(async () => header(ref));
    TimeAuthorityService.configureReference("https://example.test");
    expect(await TimeAuthorityService.checkReferenceTime()).toBe(5 * MIN);
    expect(TimeAuthorityService.isDriftExceeded()).toBe(true);
    TimeAuthorityService.__setFetch(async () => {
      throw new Error("offline");
    });
    expect(await TimeAuthorityService.checkReferenceTime()).toBeNull();
    expect(TimeAuthorityService.isDriftExceeded()).toBe(false);
    TimeAuthorityService.__setFetch(async () => header(new Date(time.now()).toUTCString()));
    expect(await TimeAuthorityService.checkReferenceTime()).toBe(0);
    TimeAuthorityService.configureReference(null);
  });

  test("dos hosts que concuerdan marcan deriva; el desacuerdo y la caída no bloquean", async () => {
    const header = (ms: number) => ({ headers: { get: (k: string) => (k.toLowerCase() === "date" ? new Date(ms).toUTCString() : null) } });
    TimeAuthorityService.__setFetch(async () => header(time.now() - 4 * MIN));
    const agreed = await TimeAuthorityService.sampleTrustedTime();
    expect(agreed.agreed).toBe(true);
    expect(agreed.offline).toBe(false);
    expect(agreed.driftMs).toBe(4 * MIN);
    expect(TimeAuthorityService.isDriftExceeded()).toBe(true);

    TimeAuthorityService.__setFetch(async (url) => header(url.includes("cloudflare") ? time.now() - 4 * MIN : time.now()));
    const split = await TimeAuthorityService.sampleTrustedTime();
    expect(split.agreed).toBe(false);
    expect(split.offline).toBe(false);
    expect(TimeAuthorityService.isNetworkSampleOnline()).toBe(false);
    expect(TimeAuthorityService.isDriftExceeded()).toBe(false);

    TimeAuthorityService.__setFetch(async () => {
      throw new Error("offline");
    });
    const offline = await TimeAuthorityService.sampleTrustedTime();
    expect(offline.offline).toBe(true);
    expect(offline.agreed).toBe(false);
    expect(TimeAuthorityService.isDriftExceeded()).toBe(false);
  });
});
