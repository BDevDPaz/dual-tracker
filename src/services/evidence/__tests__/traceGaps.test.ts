/** Huecos de miga: retención si el punto medio ya se puede expurgar; si no, registro. */
import { BREADCRUMB_PROFILES, BREADCRUMB_GAP_FACTOR } from "../../../config/provisional";
import { classifyBreadcrumbGaps } from "../traceGaps";

const DAY = 24 * 60 * 60 * 1000;
const quiet = BREADCRUMB_PROFILES.ON_SITE.timeIntervalMs * BREADCRUMB_GAP_FACTOR;

describe("huecos del rastro", () => {
  const now = 1_700_000_000_000;

  test("un intervalo corto no es hueco", () => {
    const gaps = classifyBreadcrumbGaps(
      [{ timestampMs: 0 }, { timestampMs: quiet }],
      [],
      now,
      90,
    );
    expect(gaps).toEqual([]);
  });

  test("sin expediente el hueco es de registro", () => {
    const gaps = classifyBreadcrumbGaps(
      [{ timestampMs: 0 }, { timestampMs: quiet + 1 }],
      [],
      now,
      90,
    );
    expect(gaps).toEqual([{ afterIndex: 1, kind: "recording", fromMs: 0, toMs: quiet + 1 }]);
  });

  test("un periodo exportado y ya vencido es hueco de retención", () => {
    const periodEnd = now - 100 * DAY;
    const from = periodEnd - 60 * 60 * 1000;
    const to = from + quiet + 1;
    const gaps = classifyBreadcrumbGaps(
      [{ timestampMs: from }, { timestampMs: to }],
      [{ periodStart: from - 1000, periodEnd }],
      now,
      90,
    );
    expect(gaps[0].kind).toBe("retention");
  });
});
