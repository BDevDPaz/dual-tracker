/** C7 (spec FieldCryptoService v1.3 §16) — PACK_SHARED, Store.packs.sharedIds, selectBackupAdvice, EXPORT_PACK. */
import type { DualTrackerState, EvidencePack } from "../../../core/contracts";
import { selectBackupAdvice } from "../../../core/selectors";
import { Store } from "../../../core/store";
import { createInitialState } from "../../../core/store/initialState";
import { getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { routeIntent } from "../../application/intentRouter";
import { IntegrityLedgerService } from "../../domain/IntegrityLedgerService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { EvidencePackService } from "../EvidencePackService";
import { HOUR, MONDAY_8AM, makeClosedSession } from "../../../../test/fixtures/session.fixture";
import { makeEnter } from "../../../../test/fixtures/spatial.fixture";
import { mustDispatch, seedWorld } from "../../../../test/helpers";
import { time } from "../../../../test/time";

const WEEK = 7 * 24 * HOUR;
const week = (ms: number) => ({ periodStart: getWeekStart(ms), periodEnd: getWeekEnd(ms) });

async function workDay(startMs: number, siteId: number): Promise<void> {
  time.set(startMs);
  const s = await mustDispatch({ type: "START_DAY", siteId });
  await mustDispatch({ type: "ARRIVAL_CONFIRMED", fact: makeEnter({ sessionId: s.id, siteId, timestampMs: time.now() }) }, "GEOFENCE");
  time.travel(8 * HOUR);
  await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 0 });
}

async function sharedEntries() {
  return (await PersistenceService.listLedger({ intent: "PACK_SHARED" })).map((e) => JSON.parse(e.payloadJson) as { reason: string; data: Record<string, unknown> });
}

describe("C7 — registro de exportación (PACK_SHARED)", () => {
  test("shareEmployee y shareEmployer dejan PACK_SHARED {packId, target} y actualizan Store.packs.sharedIds", async () => {
    const { siteA } = await seedWorld();
    await workDay(MONDAY_8AM, siteA);
    time.set(MONDAY_8AM + WEEK);
    const r = await EvidencePackService.seal(week(MONDAY_8AM));
    if (!r.ok) throw new Error(String(r.code));
    expect(Store.getState().packs.sharedIds).toEqual([]);
    expect(await EvidencePackService.shareEmployee(r.data.id)).toEqual({ ok: true });
    expect(await EvidencePackService.shareEmployer(r.data.id)).toEqual({ ok: true });
    const entries = await sharedEntries();
    expect(entries.map((e) => [e.data.packId, e.data.target, e.data.ledgerPayloadVersion])).toEqual([
      [r.data.id, "EMPLOYEE", 2],
      [r.data.id, "EMPLOYER", 2],
    ]);
    expect(Store.getState().packs.sharedIds).toEqual([r.data.id]);
    expect(await IntegrityLedgerService.sharedPackIds()).toEqual([r.data.id]);
    expect((await IntegrityLedgerService.verify()).valid).toBe(true);
  });

  test("si no se pudo compartir (pack inexistente) no hay asiento", async () => {
    expect((await EvidencePackService.shareEmployee("nope")).ok).toBe(false);
    expect(await sharedEntries()).toEqual([]);
  });

  test("EXPORT_PACK sella si falta y comparte; con pack existente lo reutiliza", async () => {
    const { siteA } = await seedWorld();
    await workDay(MONDAY_8AM, siteA);
    time.set(MONDAY_8AM + WEEK);
    const p = week(MONDAY_8AM);
    const first = await routeIntent({ type: "EXPORT_PACK", ...p });
    expect(first.ok).toBe(true);
    const packs = await PersistenceService.listPacks();
    expect(packs).toHaveLength(1);
    expect(Store.getState().packs.sharedIds).toEqual([packs[0].id]);
    const again = await routeIntent({ type: "EXPORT_PACK", ...p });
    expect(again.ok).toBe(true);
    expect(await PersistenceService.listPacks()).toHaveLength(1);
    expect((await sharedEntries()).length).toBe(2);
    expect(selectBackupAdvice(Store.getState(), time.now()).next).toBeNull();
  });
});

describe("C7 — selectBackupAdvice", () => {
  const pack = (id: string, ms: number, createdAtMs = ms + WEEK): EvidencePack =>
    ({ id, manifest: { ...week(ms) }, statement: {}, evidence: {}, createdAtMs }) as unknown as EvidencePack;

  function stateWith(o: { sessions?: ReturnType<typeof makeClosedSession>[]; packs?: EvidencePack[]; sharedIds?: string[] }): DualTrackerState {
    const s = createInitialState();
    const byId = Object.fromEntries((o.sessions ?? []).map((x) => [String(x.id), x]));
    const packs = o.packs ?? [];
    return {
      ...s,
      sessions: { ...s.sessions, byId, order: Object.keys(byId).map(Number) },
      packs: { byId: Object.fromEntries(packs.map((p) => [p.id, p])), order: packs.map((p) => p.id), sharedIds: o.sharedIds ?? [] },
    };
  }

  test("vacío: nada que recomendar", () => {
    expect(selectBackupAdvice(stateWith({}), MONDAY_8AM)).toEqual({ unsharedPacks: [], unpackedPeriod: null, pendingPeriods: 0, next: null });
  });

  test("packs sin PACK_SHARED + periodo cerrado más reciente sin pack; la semana en curso no cuenta", () => {
    const now = MONDAY_8AM + 3 * WEEK + HOUR;
    const sessions = [
      makeClosedSession(MONDAY_8AM, 8, { id: 1 }), // semana 0: con pack compartido
      makeClosedSession(MONDAY_8AM + WEEK, 8, { id: 2 }), // semana 1: con pack sin compartir
      makeClosedSession(MONDAY_8AM + 2 * WEEK, 8, { id: 3 }), // semana 2: sin pack → recomendada
      makeClosedSession(MONDAY_8AM + 3 * WEEK - 2 * HOUR, 1, { id: 5, bookkeeping: { isDeleted: true } }),
      makeClosedSession(now - 2 * HOUR, 1, { id: 4 }), // semana en curso: aún no cerrada
    ];
    const packs = [pack("p0", MONDAY_8AM), pack("p1", MONDAY_8AM + WEEK)];
    const a = selectBackupAdvice(stateWith({ sessions, packs, sharedIds: ["p0"] }), now);
    expect(a.unsharedPacks.map((p) => p.id)).toEqual(["p1"]);
    expect(a.unpackedPeriod).toEqual(week(MONDAY_8AM + 2 * WEEK));
    expect(a.pendingPeriods).toBe(2);
    expect(a.next).toEqual(week(MONDAY_8AM + 2 * WEEK));
  });

  test("todo compartido y sellado → pendingPeriods 0", () => {
    const now = MONDAY_8AM + WEEK + HOUR;
    const a = selectBackupAdvice(stateWith({ sessions: [makeClosedSession(MONDAY_8AM, 8, { id: 1 })], packs: [pack("p0", MONDAY_8AM)], sharedIds: ["p0"] }), now);
    expect(a.pendingPeriods).toBe(0);
    expect(a.next).toBeNull();
  });

  test("solo packs sin compartir → next = periodo del más reciente", () => {
    const a = selectBackupAdvice(stateWith({ packs: [pack("p0", MONDAY_8AM), pack("p1", MONDAY_8AM + WEEK)] }), MONDAY_8AM + 3 * WEEK);
    expect(a.unsharedPacks.map((p) => p.id)).toEqual(["p1", "p0"]);
    expect(a.next).toEqual(week(MONDAY_8AM + WEEK));
    expect(a.pendingPeriods).toBe(2);
  });
});
