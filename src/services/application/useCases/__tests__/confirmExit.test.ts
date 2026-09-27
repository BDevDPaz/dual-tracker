/** T2 — caso de uso confirmExit: cierra en la primera salida, no en el toque. */
import { confirmExit } from "../confirmExit";
import { HOUR, MIN } from "../../../../../test/fixtures/session.fixture";
import { makeExit } from "../../../../../test/fixtures/spatial.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../../test/helpers";
import { time } from "../../../../../test/time";

describe("useCase confirmExit", () => {
  test("SALIDA + confirmación → CERRADA en firstExit con almuerzo declarado", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(9 * HOUR);
    const exitAt = time.now();
    await mustDispatch({ type: "EXIT_DETECTED", fact: makeExit({ sessionId: s.id, timestampMs: exitAt }) }, "GEOFENCE");
    time.travel(25 * MIN);
    const r = await confirmExit(60);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data?.session).toMatchObject({ domainStatus: "CERRADA", endAtMs: exitAt });
    expect(r.data?.preview).toMatchObject({ lunchMinutes: 60, regularMinutes: 480, overtimeDailyMinutes: 0 });
  });

  test("lunch null: se usa el almuerzo real si lo hubo y nunca se suponen 60 min", async () => {
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(4 * HOUR);
    await mustDispatch({ type: "LUNCH_START" });
    time.travel(30 * MIN);
    await mustDispatch({ type: "RESUME" });
    time.travel(4 * HOUR);
    const r = await confirmExit(null);
    expect(r.ok && r.data?.preview?.lunchMinutes).toBe(30);
  });

  test("lunch null sin almuerzo registrado → 0 min deducidos", async () => {
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(9 * HOUR);
    const r = await confirmExit(undefined);
    expect(r.ok && r.data?.preview?.lunchMinutes).toBe(0);
    expect(r.ok && r.data?.session.lunch.deductedMinutes).toBeNull();
  });

  test("sin jornada abierta → NO_OPEN_SESSION", async () => {
    await seedWorld();
    expect(await confirmExit(0)).toMatchObject({ ok: false, code: "NO_OPEN_SESSION" });
  });
});
