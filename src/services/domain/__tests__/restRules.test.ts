/** N20 y E29 — descanso pagado y prima si al cerrar no se tomó. */
import * as Notifications from "expo-notifications";
import { setLanguage } from "../../../i18n";
import type { SessionRecord } from "../../../core/contracts";
import { getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { applyRestAcknowledgement, planMealRestNotices } from "../caPremiums";
import { PayrollEngineService } from "../PayrollEngineService";
import { transition } from "../sessionMachine";
import { NotificationService } from "../../runtime/NotificationService";
import { NOTIFICATION_ACTIONS } from "../../../constants/notifications";
import { CA_POLICY_ID, COMPANY, HOUR, MIN, MONDAY_8AM, RATES, makeClosedSession, makeCtx, makeSession } from "../../../../test/fixtures/session.fixture";

const DAY = 24 * HOUR;

function statement(sessions: SessionRecord[]) {
  return PayrollEngineService.buildStatement({
    periodStart: getWeekStart(MONDAY_8AM),
    periodEnd: getWeekEnd(MONDAY_8AM),
    sessions,
    rates: RATES,
    company: COMPANY,
    policyId: CA_POLICY_ID,
    nowMs: MONDAY_8AM + 7 * DAY,
  });
}

describe("descanso", () => {
  test("N20 el aviso sale a las 3 h 30 y «Lo tomé» no descuenta nada", () => {
    const at = planMealRestNotices({
      nowMs: MONDAY_8AM + 210 * MIN,
      workedMinutes: 210,
      mealAlreadyStarted: true,
      restAcknowledged: false,
      formatTime: () => "",
    });
    expect(at.map((n) => n.code)).toEqual(["N20"]);
    const before = planMealRestNotices({
      nowMs: MONDAY_8AM,
      workedMinutes: 209,
      mealAlreadyStarted: true,
      restAcknowledged: false,
      formatTime: () => "",
    });
    expect(before).toHaveLength(0);

    const open = makeSession({
      totalPausedMs: 5 * MIN,
      bookkeeping: { pauses: [{ startAtMs: MONDAY_8AM, endAtMs: MONDAY_8AM + 5 * MIN }] },
    });
    const acked = applyRestAcknowledgement(open);
    expect(acked.totalPausedMs).toBe(open.totalPausedMs);
    expect(acked.bookkeeping.pauses).toEqual(open.bookkeeping.pauses);
    expect(acked.bookkeeping.compliance?.restBreaksTaken).toBe(true);

    const step = transition(open, { type: "ACK_REST", taken: true }, makeCtx({ nowMs: MONDAY_8AM + 4 * HOUR }));
    expect(step.ok).toBe(true);
    if (!step.ok) return;
    expect(step.next.totalPausedMs).toBe(5 * MIN);
    expect(step.next.bookkeeping.pauses).toEqual(open.bookkeeping.pauses);
    expect(step.next.domainStatus).toBe("ACTIVA");
  });

  test("N20 el aviso programado trae el texto y el botón no cambia los minutos", async () => {
    setLanguage("es");
    NotificationService.__resetForTests();
    const got: { type?: string }[] = [];
    await NotificationService.init({
      intent: async (intent) => {
        got.push(intent);
      },
      ui: () => {},
    });
    await NotificationService.scheduleMealRestNotices({
      sessionId: 4,
      nowMs: MONDAY_8AM + 210 * MIN,
      workedMinutes: 210,
      mealAlreadyStarted: true,
      restAcknowledged: false,
    });
    const scheduled = (Notifications as unknown as { __state: { scheduled: { content: { body?: string; categoryIdentifier?: string } }[] } }).__state.scheduled;
    expect(scheduled.some((n) => n.content.body === "Te toca un descanso de 10 minutos.")).toBe(true);

    (Notifications as unknown as { __emit: (r: unknown) => void }).__emit({
      actionIdentifier: NOTIFICATION_ACTIONS.REST_TAKEN,
      notification: { request: { identifier: "n", content: { data: { sessionId: 4, kind: "N20" } } } },
    });
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(got).toContainEqual({ type: "ACK_REST", taken: true });
  });

  test("E29 contestar que no se tomó al cierre genera una prima de descanso", () => {
    const missed = statement([makeClosedSession(MONDAY_8AM, 8, { bookkeeping: { compliance: { restBreaksTaken: false } } })]);
    const rest = missed.lines.filter((l) => l.kind === "REST_PREMIUM");
    expect(rest).toHaveLength(1);
    expect(rest[0].minutes).toBe(60);
    expect(rest[0].rate).toBe(20);
    expect(missed.regularHours).toBe(8);
    expect(missed.overtimeHours).toBe(0);

    const taken = statement([makeClosedSession(MONDAY_8AM, 8, { bookkeeping: { compliance: { restBreaksTaken: true } } })]);
    expect(taken.lines.some((l) => l.kind === "REST_PREMIUM")).toBe(false);
    const omitted = statement([makeClosedSession(MONDAY_8AM, 8)]);
    expect(omitted.lines.some((l) => l.kind === "REST_PREMIUM")).toBe(false);
    const short = statement([makeClosedSession(MONDAY_8AM, 200 / 60, { bookkeeping: { compliance: { restBreaksTaken: false } } })]);
    expect(short.lines.some((l) => l.kind === "REST_PREMIUM")).toBe(false);
  });
});
