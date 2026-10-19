import { retentionPhase, trailPointPhase } from "../retentionRules";

const DAY = 24 * 60 * 60 * 1000;

describe("retentionRules", () => {
  const period = { periodStart: 0, periodEnd: 10 * DAY };

  test("sin exportar no se puede expurgar, aunque hayan pasado los días", () => {
    expect(retentionPhase(period.periodEnd + 400 * DAY, 30, period, false).phase).toBe("UNEXPORTED");
  });

  test("exportado y aún dentro del plazo se retiene", () => {
    const status = retentionPhase(period.periodEnd + 10 * DAY, 30, period, true);
    expect(status.phase).toBe("RETAINING");
    expect(status.eligibleAtMs).toBe(period.periodEnd + 30 * DAY);
  });

  test("exportado y plazo cumplido se puede expurgar", () => {
    expect(retentionPhase(period.periodEnd + 30 * DAY, 30, period, true).phase).toBe("ELIGIBLE");
  });

  test("un punto sin periodo que lo cubra no se expurga; si uno de los que lo cubren retiene, tampoco", () => {
    const ts = 5 * DAY;
    const now = period.periodEnd + 400 * DAY;
    expect(trailPointPhase(ts, [], now, 30)).toBe("UNEXPORTED");
    const young = { periodStart: 0, periodEnd: now };
    expect(trailPointPhase(ts, [period, young], now, 30)).toBe("RETAINING");
    expect(trailPointPhase(ts, [period], period.periodEnd + 400 * DAY, 30)).toBe("ELIGIBLE");
  });
});
