/** T5 — sessionWatchdog.task: jornada > 12 h propone AUTO_CLOSE, nunca VALID. */
import { IntegrityLedgerService } from "../../../domain/IntegrityLedgerService";
import { PersistenceService } from "../../../persistence/PersistenceService";
import { runSessionWatchdog } from "../sessionWatchdog.task";
import { HOUR, MIN } from "../../../../../test/fixtures/session.fixture";
import { touchHeartbeat } from "../../heartbeat";
import { SITE_LAT, SITE_LON } from "../../../../../test/fixtures/spatial.fixture";
import { seedWorld, startAndArrive } from "../../../../../test/helpers";
import { LocationMock, watchStatusWrites } from "../../../../../test/runtimeHarness";
import { time } from "../../../../../test/time";

describe("sessionWatchdog.task", () => {
  test("[obligatorio #12] 13 h abiertas → propone AUTO_CLOSE(MAX_OPEN_12H) con integridad distinta de VALID", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(13 * HOUR);
    const w = watchStatusWrites();
    await runSessionWatchdog();
    expect(w.dispatch).toHaveBeenCalledWith({ type: "AUTO_CLOSE", cause: "MAX_OPEN_12H", confirmedOutside: false }, "WATCHDOG");
    const closed = (await PersistenceService.getSession(s.id))!;
    expect(closed.domainStatus).toBe("CERRADA");
    expect(closed.integrityClass).not.toBe("VALID");
    expect(closed.integrityClass).toBe("CONFLICT"); // sin fix que confirme que está fuera
    expect(closed.bookkeeping.integrityReason).toBe("AUTO_CLOSE_12H");
    expect(closed.endAtMs).toBe(closed.actualStartAtMs! + 12 * HOUR);
    const close = (await IntegrityLedgerService.listForSession(s.id)).find((e) => e.intent === "AUTO_CLOSE");
    expect(close).toMatchObject({ actor: "WATCHDOG", reason: "AUTO_CLOSE_MAX_OPEN_12H" });
  });

  test("13 h con fix fiable fuera del sitio → clase AUTO (sigue sin ser VALID)", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(13 * HOUR);
    LocationMock.__setPosition(SITE_LAT + 0.05, SITE_LON, 10);
    await runSessionWatchdog();
    expect((await PersistenceService.getSession(s.id))?.integrityClass).toBe("AUTO");
  });

  test("hueco de heartbeat fuera del sitio → Revisar, sin cerrar", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    await touchHeartbeat();
    time.travel(50 * MIN);
    LocationMock.__setPosition(SITE_LAT + 0.05, SITE_LON, 10);
    await runSessionWatchdog();
    const after = (await PersistenceService.getSession(s.id))!;
    expect(after.domainStatus).toBe("ACTIVA");
    expect(after.integrityClass).toBe("CONFLICT");
    expect(after.bookkeeping.integrityReason).toBe("ORPHAN_SESSION");
    expect(after.endAtMs).toBeNull();
    time.travel(13 * HOUR);
    await runSessionWatchdog();
    const still = (await PersistenceService.getSession(s.id))!;
    expect(still.domainStatus).toBe("ACTIVA");
    expect(still.endAtMs).toBeNull();
  });

  test("hueco de heartbeat dentro del sitio y 13 h → sigue el AUTO_CLOSE", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    await touchHeartbeat();
    time.travel(13 * HOUR);
    LocationMock.__setPosition(SITE_LAT, SITE_LON, 10);
    await runSessionWatchdog();
    const closed = (await PersistenceService.getSession(s.id))!;
    expect(closed.domainStatus).toBe("CERRADA");
    expect(closed.bookkeeping.integrityReason).not.toBe("ORPHAN_SESSION");
  });

  test("11 h abiertas: no hace nada", async () => {
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(11 * HOUR);
    const w = watchStatusWrites();
    await runSessionWatchdog();
    expect(w.dispatch).not.toHaveBeenCalled();
  });

  test("servicios de ubicación apagados → hecho PROVIDER_LOSS (no cierra)", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    LocationMock.__state.servicesEnabled = false;
    await runSessionWatchdog();
    expect(await PersistenceService.listSpatialFacts(s.id, ["PROVIDER_LOSS"])).toHaveLength(1);
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ACTIVA");
  });

  test("sin jornada abierta no hace nada", async () => {
    await seedWorld();
    const w = watchStatusWrites();
    await runSessionWatchdog();
    expect(w.dispatch).not.toHaveBeenCalled();
  });
});
