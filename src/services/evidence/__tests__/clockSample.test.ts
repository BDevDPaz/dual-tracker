import { IntegrityLedgerService } from "../../domain/IntegrityLedgerService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { MIN } from "../../../../test/fixtures/session.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../test/helpers";
import { time } from "../../../../test/time";
import { clockDriftConfirmed, observeClock, type DriftProbe } from "../clockSample";
import { CLOCK_DRIFT_CONFIRM_SPAN_MS, CLOCK_DRIFT_THRESHOLD_MS, CLOCK_SAMPLE_MIN_INTERVAL_MS, TimeAuthorityService } from "../TimeAuthorityService";

function headerAt(ms: number) {
  return { headers: { get: (k: string) => (k.toLowerCase() === "date" ? new Date(ms).toUTCString() : null) } };
}

function clockRows(sessionId: number) {
  return IntegrityLedgerService.listForSession(sessionId).then((rows) => rows.filter((e) => e.intent === "CLOCK_SAMPLED"));
}

describe("clockDriftConfirmed", () => {
  const t0 = 1_700_000_000_000;
  const drift = CLOCK_DRIFT_THRESHOLD_MS + MIN;

  test("una ráfaga o un vaivén no confirman; tres lecturas estables sí", () => {
    const burst: DriftProbe[] = [
      { atMs: t0, driftMs: drift },
      { atMs: t0 + 1_000, driftMs: drift },
      { atMs: t0 + 2_000, driftMs: drift },
    ];
    expect(clockDriftConfirmed(burst)).toBe(false);
    const mixed: DriftProbe[] = [
      { atMs: t0, driftMs: drift },
      { atMs: t0 + CLOCK_DRIFT_CONFIRM_SPAN_MS, driftMs: MIN },
      { atMs: t0 + CLOCK_DRIFT_CONFIRM_SPAN_MS * 2, driftMs: drift },
    ];
    expect(clockDriftConfirmed(mixed)).toBe(false);
    const steady: DriftProbe[] = [
      { atMs: t0, driftMs: drift },
      { atMs: t0 + CLOCK_SAMPLE_MIN_INTERVAL_MS, driftMs: drift + 1_000 },
      { atMs: t0 + CLOCK_SAMPLE_MIN_INTERVAL_MS * 2, driftMs: drift - 1_000 },
    ];
    expect(clockDriftConfirmed(steady)).toBe(true);
  });
});

describe("observeClock", () => {
  test("una sola muestra por encima del umbral no deja la jornada en Revisar", async () => {
    const { siteA } = await seedWorld();
    const session = await startAndArrive(siteA);
    TimeAuthorityService.__setFetch(async () => headerAt(time.now() - 4 * MIN));
    await observeClock("GEOFENCE");
    const ledger = await clockRows(session.id);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].reason).toBe("CLOCK_SAMPLE");
    const after = (await PersistenceService.getSession(session.id))!;
    expect(after.integrityClass).toBe("VALID");
    expect(after.bookkeeping.integrityReason).not.toBe("CLOCK_DRIFT");
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
    expect(await clockRows(session.id)).toHaveLength(0);
  });

  test("prueba de campo: la ráfaga de las 16:10 no anota deriva ni quita VALIDADA", async () => {
    const { siteA } = await seedWorld();
    const session = await startAndArrive(siteA);
    let n = 0;
    TimeAuthorityService.__setFetch(async () => {
      n += 1;
      const offset = n % 5 === 0 ? MIN : 4 * MIN;
      return headerAt(time.now() - offset);
    });
    for (let i = 0; i < 35; i++) await observeClock(i % 2 === 0 ? "GEOFENCE" : "FOREGROUND");
    const ledger = await IntegrityLedgerService.listForSession(session.id);
    const sampled = ledger.filter((e) => e.intent === "CLOCK_SAMPLED");
    expect(sampled.length).toBeLessThanOrEqual(1);
    expect(sampled.some((e) => e.reason === "CLOCK_DRIFT")).toBe(false);
    expect(ledger.some((e) => e.intent === "INTEGRITY_DEGRADE")).toBe(false);
    expect((await PersistenceService.getSession(session.id))!.integrityClass).toBe("VALID");
    expect(n).toBeLessThanOrEqual(2);
  });

  test("deriva coherente se anota una vez y, con ubicación buena, la jornada sigue VALIDADA", async () => {
    const { siteA } = await seedWorld();
    const session = await startAndArrive(siteA);
    TimeAuthorityService.__setFetch(async () => headerAt(time.now() - 4 * MIN));
    for (let i = 0; i < 3; i++) {
      if (i > 0) time.travel(CLOCK_SAMPLE_MIN_INTERVAL_MS);
      await observeClock("GEOFENCE");
    }
    time.travel(CLOCK_SAMPLE_MIN_INTERVAL_MS);
    await observeClock("WATCHDOG");
    time.travel(CLOCK_SAMPLE_MIN_INTERVAL_MS);
    await observeClock("FOREGROUND");
    const ledger = await IntegrityLedgerService.listForSession(session.id);
    const drift = ledger.filter((e) => e.intent === "CLOCK_SAMPLED" && e.reason === "CLOCK_DRIFT");
    expect(drift).toHaveLength(1);
    expect(JSON.parse(drift[0].payloadJson).data.warningOnly).toBe(true);
    expect(ledger.some((e) => e.intent === "INTEGRITY_DEGRADE")).toBe(false);
    const closed = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    expect(closed.integrityClass).toBe("VALID");
    expect(closed.bookkeeping.integrityReason).not.toBe("CLOCK_DRIFT");
  });

  test("sin llegada, la misma deriva coherente sí deja la jornada en Revisar", async () => {
    const { siteA } = await seedWorld();
    const session = await mustDispatch({ type: "START_DAY", siteId: siteA });
    TimeAuthorityService.__setFetch(async () => headerAt(time.now() - 4 * MIN));
    for (let i = 0; i < 3; i++) {
      if (i > 0) time.travel(CLOCK_SAMPLE_MIN_INTERVAL_MS);
      await observeClock("GEOFENCE");
    }
    const ledger = await IntegrityLedgerService.listForSession(session.id);
    expect(ledger.filter((e) => e.reason === "CLOCK_DRIFT" && e.intent === "CLOCK_SAMPLED")).toHaveLength(1);
    expect(ledger.some((e) => e.intent === "INTEGRITY_DEGRADE")).toBe(true);
    expect((await PersistenceService.getSession(session.id))!.integrityClass).toBe("CONFLICT");
  });

  test("una RTT alta no cuenta como muestra ni como deriva", async () => {
    const { siteA } = await seedWorld();
    const session = await startAndArrive(siteA);
    TimeAuthorityService.__setFetch(async () => {
      time.travel(3_000);
      return headerAt(time.now() - 4 * MIN);
    });
    await observeClock("GEOFENCE");
    time.travel(CLOCK_SAMPLE_MIN_INTERVAL_MS);
    await observeClock("GEOFENCE");
    time.travel(CLOCK_SAMPLE_MIN_INTERVAL_MS);
    await observeClock("GEOFENCE");
    expect(await clockRows(session.id)).toHaveLength(0);
    expect((await PersistenceService.getSession(session.id))!.integrityClass).toBe("VALID");
  });
});
