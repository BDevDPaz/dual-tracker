/** Apagado del teléfono: latido → reinicio, sin inventar la hora si no hay reloj de arranque. */
import { deviceOffGap, powerOffsFromLedger } from "../deviceOffGap";

const T = 1_700_000_000_000;

describe("deviceOffGap", () => {
  test("el reinicio posterior al latido es el apagado", () => {
    const gap = deviceOffGap(T, { nowMs: T + 25 * 60_000, uptimeMs: 5 * 60_000 });
    expect(gap.deviceOffMs).toBe(20 * 60_000);
    expect(gap.gapMs).toBe(25 * 60_000);
    expect(gap.bootAtMs).toBe(T + 20 * 60_000);
  });

  test("si el teléfono siguió encendido no hay apagado", () => {
    const gap = deviceOffGap(T, { nowMs: T + 20 * 60_000, uptimeMs: 6 * 60 * 60_000 });
    expect(gap.deviceOffMs).toBeNull();
    expect(gap.gapMs).toBe(20 * 60_000);
    expect(gap.bootAtMs).toBeLessThan(T);
  });

  test("sin reloj de arranque se anota el hueco y no se inventa el reinicio", () => {
    const gap = deviceOffGap(T, { nowMs: T + 20 * 60_000, uptimeMs: null });
    expect(gap).toMatchObject({ gapMs: 20 * 60_000, bootAtMs: null, deviceOffMs: null });
  });

  test("el libro viejo, sin resumedAtMs, igual se lee", () => {
    const [note] = powerOffsFromLedger([
      {
        sessionId: 4,
        intent: "OS_KILL",
        payloadJson: JSON.stringify({ data: { lastHeartbeatMs: T, gapMs: 20 * 60_000 } }),
      },
      { sessionId: 4, intent: "CLOSE_DAY", payloadJson: "{}" },
    ]);
    expect(note).toMatchObject({ sessionId: 4, resumedAtMs: T + 20 * 60_000, deviceOffMs: null });
  });
});