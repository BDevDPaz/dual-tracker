/**
 * Auditoría de jornadas (PR3) con el motor real: el loader junta ledger,
 * sello recalculado y huella de la última nota; el selector puro decide.
 */
import { selectSessionAudit } from "../../../../core/selectors";
import { IntegrityLedgerService } from "../../../domain/IntegrityLedgerService";
import { FieldCryptoService } from "../../../persistence/FieldCryptoService";
import { PersistenceService } from "../../../persistence/PersistenceService";
import { loadPeriodAuditInputs, loadSessionAuditInputs, recomputeSessionSeal } from "../sessionAudit";
import { HOUR } from "../../../../../test/fixtures/session.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../../test/helpers";
import { time } from "../../../../../test/time";

beforeEach(() => IntegrityLedgerService.setNoteDigester((n) => FieldCryptoService.noteDigest(n)));
afterEach(() => IntegrityLedgerService.setNoteDigester(null));

async function closedDay() {
  const { siteA } = await seedWorld();
  const s = await startAndArrive(siteA);
  time.travel(8 * HOUR);
  await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 0 });
  return s;
}

describe("auditoría de jornada · motor real", () => {
  test("jornada cerrada: llegada por geocerca, sello correcto y sin ediciones", async () => {
    const s = await closedDay();
    const session = (await PersistenceService.getSession(s.id))!;
    const inputs = await loadSessionAuditInputs(session);
    const a = selectSessionAudit(session, inputs);
    expect(a.arrival?.origin).toBe("GEOFENCE");
    expect(a.seal.status).toBe("OK");
    expect(a.seal.eventsAfter).toBe(0);
    expect(a.counts.edits).toBe(0);
    expect(a.rows.map((r) => r.intent)).toEqual(expect.arrayContaining(["START_DAY", "ARRIVAL_CONFIRMED", "CLOSE_DAY", "SESSION_SEALED"]));
  });

  test("dos ediciones tras cerrar: la última nota se lee, la anterior queda «no registrado», el sello sigue y cuenta lo posterior", async () => {
    const s = await closedDay();
    const start = s.declaredStartAtMs;
    await mustDispatch({ type: "MANUAL_PATCH", sessionId: s.id, declaredStartAtMs: start + 5 * 60_000, endAtMs: time.now(), note: "Primera corrección" });
    await mustDispatch({ type: "MANUAL_PATCH", sessionId: s.id, declaredStartAtMs: start + 10 * 60_000, endAtMs: time.now(), note: "Corrección final" });
    const session = (await PersistenceService.getSession(s.id))!;
    const a = selectSessionAudit(session, await loadSessionAuditInputs(session));
    const edits = a.rows.filter((r) => r.kind === "EDIT");
    expect(edits).toHaveLength(2);
    expect(edits[0].note).toEqual({ status: "DIGEST_ONLY" });
    expect(edits[0].detail.after?.declaredStartAtMs).toBe(start + 5 * 60_000);
    expect(edits[1].note).toEqual({ status: "READABLE", text: "Corrección final" });
    expect(edits[1].detail.before?.declaredStartAtMs).toBe(start + 5 * 60_000);
    expect(a.notRecorded).toContain("PRIOR_REASONS");
    expect(a.seal.status).toBe("OK");
    expect(a.seal.eventsAfter).toBe(2);
    expect(a.original?.declaredStartAtMs).toBe(start);
  });

  test("el sello recalculado cambia si cambia un eslabón previo", async () => {
    const s = await closedDay();
    const ledger = await IntegrityLedgerService.listForSession(s.id);
    const ok = await recomputeSessionSeal(ledger);
    const tampered = ledger.map((e, i) => (i === 0 ? { ...e, hash: "0".repeat(64) } : e));
    expect(await recomputeSessionSeal(tampered)).not.toBe(ok);
    const session = (await PersistenceService.getSession(s.id))!;
    expect(selectSessionAudit(session, { ...(await loadSessionAuditInputs(session)), ledger: tampered, recomputedSealHash: await recomputeSessionSeal(tampered) }).seal.status).toBe("MISMATCH");
  });

  test("periodo: una entrada por jornada", async () => {
    const s = await closedDay();
    const session = (await PersistenceService.getSession(s.id))!;
    const map = await loadPeriodAuditInputs([session]);
    expect([...map.keys()]).toEqual([s.id]);
    expect(map.get(s.id)!.ledger.length).toBeGreaterThan(0);
  });
});
