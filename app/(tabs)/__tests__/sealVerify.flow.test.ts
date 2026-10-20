/** Reportes: sellar y verificar. Lo emite app/(tabs)/reports.tsx. */
import { routeIntent } from "../../../src/services/application/intentRouter";
import { EvidencePackService } from "../../../src/services/evidence/EvidencePackService";
import { HOUR } from "../../../test/fixtures/session.fixture";
import { getWeekEnd, getWeekStart } from "../../../src/utils/dateUtils";
import { mustDispatch, seedWorld, startAndArrive } from "../../../test/helpers";
import { time } from "../../../test/time";

describe("app/(tabs) sellar", () => {
  test("SEAL_PACK deja un expediente que verify acepta", async () => {
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(8 * HOUR);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    const periodStart = getWeekStart(time.now());
    const periodEnd = getWeekEnd(time.now());
    const sealed = await routeIntent({ type: "SEAL_PACK", periodStart, periodEnd });
    expect(sealed.ok).toBe(true);
    if (!sealed.ok || !sealed.data || typeof sealed.data !== "object" || !("id" in sealed.data)) throw new Error("sin pack");
    const pack = await EvidencePackService.get(String(sealed.data.id));
    expect(pack).not.toBeNull();
    expect((await EvidencePackService.verify(pack!)).valid).toBe(true);
  });
});
