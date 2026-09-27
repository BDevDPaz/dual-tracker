/** T1 — ConcurrencyGuard: dos CLOSE_DAY sobre la misma jornada, uno entra y el otro falla explícitamente. */
import { PersistenceService } from "../../persistence/PersistenceService";
import { KV_KEYS } from "../../persistence/schema";
import { ConcurrencyGuardService, MutexBusyError } from "../ConcurrencyGuardService";
import { IntegrityLedgerService } from "../IntegrityLedgerService";
import { SessionEngineService } from "../SessionEngineService";
import { HOUR } from "../../../../test/fixtures/session.fixture";
import { seedWorld, startAndArrive } from "../../../../test/helpers";
import { time } from "../../../../test/time";

describe("ConcurrencyGuardService", () => {
  test("[obligatorio #3] dos CLOSE_DAY simultáneos: uno cierra, el otro choca con el mutex", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(8 * HOUR);
    const [a, b] = await Promise.all([
      SessionEngineService.dispatch({ type: "CLOSE_DAY", mode: "MANUAL" }, "UI"),
      SessionEngineService.dispatch({ type: "CLOSE_DAY", mode: "MANUAL" }, "NOTIFICATION"),
    ]);
    expect(a.ok).toBe(true);
    expect(b).toMatchObject({ ok: false, code: "MUTEX_BUSY", detail: "UI" });
    const closes = (await IntegrityLedgerService.listForSession(s.id)).filter((e) => e.intent === "CLOSE_DAY");
    expect(closes).toHaveLength(1);
  });

  test("[obligatorio #3] un segundo CLOSE_DAY posterior sobre la misma jornada se rechaza", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(8 * HOUR);
    expect((await SessionEngineService.dispatch({ type: "CLOSE_DAY", mode: "MANUAL" }, "UI")).ok).toBe(true);
    time.travel(1000);
    const second = await SessionEngineService.dispatch({ type: "CLOSE_DAY", mode: "MANUAL" }, "UI");
    expect(second).toMatchObject({ ok: false, code: "NO_OPEN_SESSION" });
    expect((await PersistenceService.getSession(s.id))?.endAtMs).toBe(time.now() - 1000);
  });

  test("lease persistido por otro runtime (tarea en background) bloquea con MUTEX_BUSY", async () => {
    await PersistenceService.init();
    await PersistenceService.setKv(`${KV_KEYS.MUTEX_PREFIX}session`, { owner: "rt-other", origin: "GEOFENCE", label: "EXIT_DETECTED", expiresAtMs: time.now() + 10_000 });
    const r = await SessionEngineService.dispatch({ type: "CLOSE_DAY", mode: "MANUAL" }, "UI");
    expect(r).toMatchObject({ ok: false, code: "MUTEX_BUSY", detail: "GEOFENCE" });
  });

  test("lease caducado de otro runtime no bloquea", async () => {
    await PersistenceService.init();
    await PersistenceService.setKv(`${KV_KEYS.MUTEX_PREFIX}k`, { owner: "rt-other", origin: "GEOFENCE", label: "x", expiresAtMs: time.now() - 1 });
    await expect(ConcurrencyGuardService.withLock("k", "UI", "t", async () => 42)).resolves.toBe(42);
  });

  test("withLock libera el candado aunque el trabajo lance", async () => {
    await PersistenceService.init();
    await expect(
      ConcurrencyGuardService.withLock("k", "UI", "t", async () => {
        expect(ConcurrencyGuardService.isHeld("k")).toBe(true);
        throw new Error("fallo");
      }),
    ).rejects.toThrow("fallo");
    expect(ConcurrencyGuardService.isHeld("k")).toBe(false);
    await expect(ConcurrencyGuardService.withLock("k", "UI", "t", async () => "ok")).resolves.toBe("ok");
  });

  test("anidar el mismo candado es un rechazo explícito (MutexBusyError), no una espera", async () => {
    await PersistenceService.init();
    await expect(
      ConcurrencyGuardService.withLock("k", "UI", "outer", () => ConcurrencyGuardService.withLock("k", "WATCHDOG", "inner", async () => 1)),
    ).rejects.toBeInstanceOf(MutexBusyError);
  });
});
