/** T1 — TransitPolicy: A→B pagado o no según política; sin destino no inventa tránsito. */
import { getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { PersistenceService } from "../../persistence/PersistenceService";
import { PayrollEngineService } from "../PayrollEngineService";
import { SessionEngineService } from "../SessionEngineService";
import { TransitPolicyService } from "../TransitPolicyService";
import { COMPANY, HOUR, MIN, MONDAY_8AM, RATES, makeSegment } from "../../../../test/fixtures/session.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../test/helpers";
import { time } from "../../../../test/time";

describe("TransitPolicyService", () => {
  test("decide: pagado/no pagado y multiplicador según CompanyPolicy; cancelado nunca paga", () => {
    const seg = makeSegment();
    expect(TransitPolicyService.decide(seg, { ...COMPANY, transitPaid: true, transitRateMultiplier: 1, transitCountsTowardOvertime: true })).toEqual({ paid: true, rateMultiplier: 1, countsTowardOvertime: true });
    expect(TransitPolicyService.decide(seg, { ...COMPANY, transitPaid: false, transitCountsTowardOvertime: true }).countsTowardOvertime).toBe(false);
    expect(TransitPolicyService.decide({ ...seg, cancelled: true }, COMPANY).paid).toBe(false);
    expect(TransitPolicyService.decide({ ...seg, cancelled: true, paid: true, rateMultiplier: 1 }, COMPANY)).toEqual({
      paid: true,
      rateMultiplier: 1,
      countsTowardOvertime: false,
    });
    expect(TransitPolicyService.segmentMinutes({ ...seg, cancelled: true, paid: true, endAtMs: seg.startAtMs + 24 * MIN }, seg.startAtMs + 30 * MIN)).toBe(24);
    expect(TransitPolicyService.decide({ ...seg, paid: true, rateMultiplier: 1, countsTowardOvertime: true }, { ...COMPANY, transitPaid: false }).paid).toBe(true);
    expect(TransitPolicyService.decide({ ...seg, paid: false }, { ...COMPANY, transitPaid: true }).paid).toBe(false);
  });

  test("boundedMinutes ignora el tramo que cae fuera de la jornada", () => {
    const seg = makeSegment({ startAtMs: MONDAY_8AM, endAtMs: MONDAY_8AM + 40 * MIN });
    expect(TransitPolicyService.boundedMinutes(seg, MONDAY_8AM + 10 * MIN, MONDAY_8AM + 25 * MIN)).toBe(15);
    expect(TransitPolicyService.boundedMinutes(seg, MONDAY_8AM + 50 * MIN, MONDAY_8AM + 60 * MIN)).toBe(0);
  });

  test("segmentMinutes: abierto cuenta hasta now; cancelado = 0", () => {
    const seg = makeSegment({ endAtMs: null });
    expect(TransitPolicyService.segmentMinutes(seg, seg.startAtMs + 25 * MIN)).toBe(25);
    expect(TransitPolicyService.segmentMinutes({ ...seg, cancelled: true }, seg.startAtMs + 25 * MIN)).toBe(0);
  });

  test("validateStart exige destino distinto del origen", () => {
    expect(TransitPolicyService.validateStart(1, null)).toEqual({ ok: false, code: "SITE_REQUIRED" });
    expect(TransitPolicyService.validateStart(1, 1)).toEqual({ ok: false, code: "SITE_REQUIRED" });
    expect(TransitPolicyService.validateStart(1, 2)).toEqual({ ok: true });
  });

  test("[obligatorio #6] TRASLADO sin siteId destino no genera horas pagables", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(2 * HOUR);
    const r = await SessionEngineService.dispatch({ type: "TRANSFER_START", toSiteId: 0 }, "UI");
    expect(r).toMatchObject({ ok: false, code: "SITE_REQUIRED" });
    const still = (await PersistenceService.getSession(s.id))!;
    expect(still.domainStatus).toBe("ACTIVA");
    expect(still.transitSegments).toHaveLength(0);

    time.travel(HOUR);
    const closed = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    const st = PayrollEngineService.buildStatement({
      periodStart: getWeekStart(closed.declaredStartAtMs), periodEnd: getWeekEnd(closed.declaredStartAtMs),
      sessions: [closed], rates: RATES, company: COMPANY, policyId: COMPANY.overtimePolicyId, nowMs: time.now(),
    });
    expect(st.transitHours).toBe(0);
    expect(st.lines.filter((l) => l.kind === "TRANSIT")).toHaveLength(0);
  });

  test("A→B con destino válido crea tramo y la llegada lo cierra", async () => {
    const { siteA, siteB } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(HOUR);
    const t = await mustDispatch({ type: "TRANSFER_START", toSiteId: siteB });
    expect(t.domainStatus).toBe("TRASLADO");
    time.travel(20 * MIN);
    const a = await mustDispatch({ type: "ARRIVAL_CONFIRMED" });
    expect(a.siteId).toBe(siteB);
    expect(TransitPolicyService.segmentMinutes(a.transitSegments[0], time.now())).toBe(20);
  });
});
