/** C3 (spec v1.3 §13) — payload v2 del ledger: sin notas en claro, noteDigest HMAC, cadena mixta v1/v2. */
import { GENESIS_HASH } from "../../../core/contracts";
import { canonicalJson } from "../../../utils/canonicalJson";
import { chainHash } from "../../evidence/HashChain";
import { FieldCryptoService } from "../../persistence/FieldCryptoService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { IntegrityLedgerService } from "../IntegrityLedgerService";
import { HOUR } from "../../../../test/fixtures/session.fixture";
import { makeEnter } from "../../../../test/fixtures/spatial.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../test/helpers";
import { time } from "../../../../test/time";

const NOTE = "Me retrasé por una cita médica";

describe("C3 — ledger payload v2", () => {
  beforeEach(() => IntegrityLedgerService.setNoteDigester((n) => FieldCryptoService.noteDigest(n)));
  afterEach(() => IntegrityLedgerService.setNoteDigester(null));

  test("START_DAY con nota, ADD_NOTE y MANUAL_PATCH: sin campo note y con noteDigest; ledgerPayloadVersion = 2", async () => {
    const { siteA } = await seedWorld();
    const s = await mustDispatch({ type: "START_DAY", siteId: siteA, note: NOTE });
    await mustDispatch({ type: "ARRIVAL_CONFIRMED", fact: makeEnter({ sessionId: s.id, siteId: siteA, timestampMs: time.now() }) }, "GEOFENCE");
    time.travel(8 * HOUR);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 0 });
    await mustDispatch({ type: "ADD_NOTE", sessionId: s.id, note: NOTE });
    await mustDispatch({ type: "MANUAL_PATCH", sessionId: s.id, declaredStartAtMs: s.declaredStartAtMs + 60_000, endAtMs: time.now(), note: NOTE });
    const ledger = await PersistenceService.listLedger();
    const raw = ledger.map((e) => e.payloadJson).join("\n");
    expect(raw).not.toContain(NOTE);
    const expected = await FieldCryptoService.noteDigest(NOTE);
    expect(expected).toMatch(/^hmac-sha256:v1:k1:/);
    const withNote = ledger.map((e) => JSON.parse(e.payloadJson).data).filter((d) => "noteDigest" in d);
    expect(withNote.length).toBeGreaterThanOrEqual(3);
    for (const d of withNote) {
      expect(d).not.toHaveProperty("note");
      expect(d.noteDigest).toBe(expected);
    }
    for (const e of ledger) expect(JSON.parse(e.payloadJson).data.ledgerPayloadVersion).toBe(2);
    // La nota vive solo en sessions.manual_note_sealed (cifrada).
    expect((await PersistenceService.getSession(s.id))!.bookkeeping.manualNote).toBe(NOTE);
  });

  test("sin digester (Jest por defecto) o sin clave: noteDigest null, la nota tampoco se escribe", async () => {
    IntegrityLedgerService.setNoteDigester(null);
    const { siteA } = await seedWorld();
    await mustDispatch({ type: "START_DAY", siteId: siteA, note: NOTE });
    const [e] = await PersistenceService.listLedger({ intent: "START_DAY" });
    const d = JSON.parse(e.payloadJson).data;
    expect(d.noteDigest).toBeNull();
    expect(e.payloadJson).not.toContain(NOTE);
  });

  test("defensa en profundidad: append redacta un campo note aunque lo pase un llamador", async () => {
    await PersistenceService.init();
    await IntegrityLedgerService.append({ sessionId: null, actor: "SYSTEM", intent: "LEDGER_BREAK_EXPORTED", fromState: null, toState: null, reason: "T", timestampMs: time.now(), integrityClass: null, data: { note: NOTE } });
    const [e] = await PersistenceService.listLedger({ intent: "LEDGER_BREAK_EXPORTED" });
    expect(e.payloadJson).not.toContain(NOTE);
    expect(JSON.parse(e.payloadJson).data).toEqual({ ledgerPayloadVersion: 2, noteDigest: await FieldCryptoService.noteDigest(NOTE) });
  });

  test("cadena mixta: asientos v1 (con nota en claro, inmutables) + v2 verifica sin clave", async () => {
    await PersistenceService.init();
    // Asiento v1 legado, escrito tal como lo hacía 8df2b9a.
    const payloadJson = canonicalJson({ sessionId: 1, actor: "USER", intent: "ADD_NOTE", fromState: "CERRADA", toState: "CERRADA", reason: "NOTE", timestampMs: 1, integrityClass: "VALID", data: { type: "ADD_NOTE", sessionId: 1, note: "nota v1" } });
    await PersistenceService.insertLedgerEntry({ sessionId: 1, actor: "USER", intent: "ADD_NOTE", fromState: "CERRADA", toState: "CERRADA", reason: "NOTE", timestampMs: 1, integrityClass: "VALID", prevHash: GENESIS_HASH, hash: await chainHash(GENESIS_HASH, payloadJson), payloadJson });
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    FieldCryptoService.__resetForTests(); // sin clave en memoria: verify no la necesita
    const v = await IntegrityLedgerService.verify();
    expect(v.valid).toBe(true);
    expect((await PersistenceService.listLedger())[0].payloadJson).toContain("nota v1"); // v1 intacto
  });
});
