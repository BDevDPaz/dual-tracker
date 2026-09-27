/** T1 — IntegrityLedger: append-only, hash encadenado, MANUAL no borra el asiento GPS. */
import { GENESIS_HASH } from "../../../core/contracts";
import { verifyChain } from "../../evidence/HashChain";
import { PersistenceService } from "../../persistence/PersistenceService";
import { IntegrityLedgerService } from "../IntegrityLedgerService";
import { HOUR, MIN, makeClosedSession, MONDAY_8AM } from "../../../../test/fixtures/session.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../test/helpers";
import { time } from "../../../../test/time";

const draft = (reason: string) => ({
  sessionId: 1,
  actor: "SYSTEM" as const,
  intent: "OS_KILL" as const,
  fromState: null,
  toState: null,
  reason,
  timestampMs: time.now(),
  integrityClass: null,
});

describe("IntegrityLedgerService", () => {
  beforeEach(() => PersistenceService.init());

  test("hash encadenado desde GENESIS y verify() íntegro", async () => {
    const a = await IntegrityLedgerService.append(draft("A"));
    const b = await IntegrityLedgerService.append(draft("B"));
    expect(a.prevHash).toBe(GENESIS_HASH);
    expect(b.prevHash).toBe(a.hash);
    expect(await IntegrityLedgerService.verify()).toEqual({ valid: true, brokenAtId: null, head: b.hash });
  });

  test("append-only: UPDATE y DELETE sobre integrity_ledger fallan", async () => {
    const db = await PersistenceService.init();
    const a = await IntegrityLedgerService.append(draft("A"));
    await expect(db.runAsync(`UPDATE ledger_entries SET reason = 'X' WHERE id = ?`, [a.id])).rejects.toThrow(/append-only/);
    await expect(db.runAsync(`DELETE FROM ledger_entries WHERE id = ?`, [a.id])).rejects.toThrow(/append-only/);
    expect((await IntegrityLedgerService.listForSession(1))[0].reason).toBe("A");
  });

  test("verify detecta la manipulación del primer asiento roto", async () => {
    const a = await IntegrityLedgerService.append(draft("A"));
    const b = await IntegrityLedgerService.append(draft("B"));
    expect(await verifyChain([a, { ...b, payloadJson: b.payloadJson.replace('"B"', '"Z"') }])).toBe(1);
    expect(await verifyChain([{ ...a, prevHash: "0".repeat(63) + "1" }, b])).toBe(0);
  });

  test("[obligatorio #7] PATCH_SESSION añade asiento MANUAL y conserva AUTO_CHECKIN", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(8 * HOUR);
    const closed = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    const before = await IntegrityLedgerService.listForSession(s.id);
    const autoCheckin = before.find((e) => e.reason === "AUTO_CHECKIN_GEOFENCE_ENTRY")!;
    expect(autoCheckin).toMatchObject({ actor: "GEOFENCE", intent: "ARRIVAL_CONFIRMED", toState: "ACTIVA" });

    time.travel(HOUR);
    const patched = await mustDispatch({
      type: "MANUAL_PATCH",
      sessionId: s.id,
      declaredStartAtMs: closed.actualStartAtMs! - 15 * MIN,
      endAtMs: closed.endAtMs,
      note: "Llegué antes; el GPS tardó",
    });
    expect(patched.integrityClass).toBe("MANUAL");

    const after = await IntegrityLedgerService.listForSession(s.id);
    expect(after).toHaveLength(before.length + 1);
    expect(after).toContainEqual(autoCheckin); // mismo id, mismo hash: intacto
    expect(after[after.length - 1]).toMatchObject({ intent: "MANUAL_PATCH", actor: "USER", integrityClass: "MANUAL", reason: "MANUAL_PATCH_WITH_NOTE" });
    expect((await IntegrityLedgerService.verify()).valid).toBe(true);
    // El registro conserva el horario original capturado por GPS.
    expect(patched.bookkeeping.original?.actualStartAtMs).toBe(closed.actualStartAtMs);
  });

  test("el asiento de hechos espaciales omite lat/lon del payload (minimización)", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    const arrival = (await IntegrityLedgerService.listForSession(s.id)).find((e) => e.intent === "ARRIVAL_CONFIRMED")!;
    expect(arrival.payloadJson).not.toMatch(/"lat"|"lon"/);
  });

  test("summarize incluye conflictos y la cabeza de la cadena", async () => {
    await IntegrityLedgerService.append(draft("A"));
    const conflict = makeClosedSession(MONDAY_8AM, 8, { integrityClass: "CONFLICT", bookkeeping: { integrityReason: "CLOCK_DRIFT" } });
    const sum = await IntegrityLedgerService.summarize([conflict], 0, time.now() + 1, []);
    expect(sum.ledgerEntryCount).toBe(1);
    expect(sum.ledgerChainValid).toBe(true);
    expect(sum.conflicts).toEqual([{ sessionId: 1, reason: "CLOCK_DRIFT" }]);
    expect(await IntegrityLedgerService.listForPeriod(0, time.now() + 1)).toHaveLength(1);
  });
});
