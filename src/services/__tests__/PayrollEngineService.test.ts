import { payrollEngineService, CALIFORNIA_DAILY_OT_WEEKLY_40 } from "../PayrollEngineService";
import type { SessionRecord } from "../../core/contracts/domain";

function makeSession(opts: {
  startMs: number;
  endMs: number;
  lunchTaken?: boolean;
  lunchDeductedMinutes?: number | null;
  totalPausedMs?: number;
  transitMinutes?: number;
  transitCountsForOvertime?: boolean;
  dateString?: string;
}): SessionRecord {
  const {
    startMs,
    endMs,
    lunchTaken = false,
    lunchDeductedMinutes = null,
    totalPausedMs = 0,
    transitMinutes = 0,
    transitCountsForOvertime = false,
    dateString = "2026-09-26",
  } = opts;

  const transitSegments =
    transitMinutes > 0
      ? [
          {
            id: "seg_1",
            startAtMs: endMs,
            endAtMs: endMs + transitMinutes * 60000,
            isPaid: true,
            countsForOvertime: transitCountsForOvertime,
          },
        ]
      : [];

  return {
    declaredStartAtMs: startMs,
    actualStartAtMs: startMs,
    endAtMs: endMs,
    totalPausedMs,
    lunch: {
      taken: lunchTaken,
      deductedMinutes: lunchDeductedMinutes,
      startAtMs: null,
      endAtMs: null,
    },
    transitSegments,
    dateString,
    domainStatus: "CERRADA",
    isDeleted: false,
    integrityClass: "VALID",
  } as unknown as SessionRecord;
}

const H = 3600000;
const DAY_START = Date.parse("2026-09-26T09:00:00Z");
const PERIOD_START = Date.parse("2026-09-26T00:00:00Z");
const PERIOD_END = Date.parse("2026-09-26T23:59:59Z");

describe("PayrollEngineService", () => {
  const policy = CALIFORNIA_DAILY_OT_WEEKLY_40;

  it("8h regular genera $160 sin overtime", async () => {
    const session = makeSession({
      startMs: DAY_START,
      endMs: DAY_START + 8 * H,
    });

    const statement = await payrollEngineService.computeStatement({
      sessions: [session],
      policy,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });

    expect(statement.regularHours).toBeCloseTo(8, 5);
    expect(statement.overtimeHours).toBeCloseTo(0, 5);
    expect(statement.grossEstimate).toBeCloseTo(160, 5);
    expect(statement.lines.find((l) => l.kind === "REGULAR")).toBeDefined();
    // expo-crypto no tiene nativo en Jest, solo verificamos tipo
    expect(typeof statement.packHash).toBe("string");
    expect(statement.policyId).toBe(policy.policyId);
  });

  it("10h genera 8h regular + 2h overtime x1.5 = $220", async () => {
    const session = makeSession({
      startMs: DAY_START,
      endMs: DAY_START + 10 * H,
    });

    const statement = await payrollEngineService.computeStatement({
      sessions: [session],
      policy,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });

    expect(statement.regularHours).toBeCloseTo(8, 5);
    expect(statement.overtimeHours).toBeCloseTo(2, 5);
    // 8*20 + 2*20*1.5 = 160 + 60 = 220
    expect(statement.grossEstimate).toBeCloseTo(220, 5);

    const otDaily = statement.lines.find((l) => l.kind === "OVERTIME_DAILY");
    expect(otDaily).toBeDefined();
    expect(otDaily?.minutes).toBe(120);
  });

  it("descuenta almuerzo 60min no remunerado como línea auditable", async () => {
    const session = makeSession({
      startMs: DAY_START,
      endMs: DAY_START + 9 * H,
      lunchTaken: true,
      lunchDeductedMinutes: 60,
    });

    const statement = await payrollEngineService.computeStatement({
      sessions: [session],
      policy,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });

    // 9h bruto - 1h almuerzo = 8h regular
    expect(statement.regularHours).toBeCloseTo(8, 5);
    expect(statement.lunchMinutes).toBe(60);
    expect(statement.grossEstimate).toBeCloseTo(160, 5);

    const lunchLine = statement.lines.find((l) => l.kind === "LUNCH_UNPAID");
    expect(lunchLine).toBeDefined();
    expect(lunchLine?.amount).toBe(0);
  });

  it("suma tránsito remunerado sin contaminar overtime diario", async () => {
    const session = makeSession({
      startMs: DAY_START,
      endMs: DAY_START + 8 * H,
      transitMinutes: 60,
      transitCountsForOvertime: false,
    });

    const statement = await payrollEngineService.computeStatement({
      sessions: [session],
      policy,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });

    expect(statement.regularHours).toBeCloseTo(8, 5);
    expect(statement.transitHours).toBeCloseTo(1, 5);
    // 8*20 + 1*20 = 180
    expect(statement.grossEstimate).toBeCloseTo(180, 5);

    const transitLine = statement.lines.find((l) => l.kind === "TRANSIT_PAID");
    expect(transitLine).toBeDefined();
  });

  it("ignora sesiones no cerradas o eliminadas", async () => {
    const openSession = {
      ...makeSession({ startMs: DAY_START, endMs: DAY_START + 8 * H }),
      domainStatus: "ACTIVA",
    } as unknown as SessionRecord;

    const deletedSession = {
      ...makeSession({ startMs: DAY_START, endMs: DAY_START + 8 * H }),
      isDeleted: true,
    } as unknown as SessionRecord;

    const statement = await payrollEngineService.computeStatement({
      sessions: [openSession, deletedSession],
      policy,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });

    expect(statement.regularHours).toBeCloseTo(0, 5);
    expect(statement.grossEstimate).toBeCloseTo(0, 5);
    expect(statement.lines.length).toBe(0);
  });

  it("recalculateWithNewPolicy exige policyId distinto", async () => {
    const session = makeSession({
      startMs: DAY_START,
      endMs: DAY_START + 8 * H,
    });

    const prev = await payrollEngineService.computeStatement({
      sessions: [session],
      policy,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });

    await expect(
      payrollEngineService.recalculateWithNewPolicy({
        previousStatement: prev,
        sessions: [session],
        newPolicy: policy,
      }),
    ).rejects.toThrow(/policyId distinto/);
  });
});
