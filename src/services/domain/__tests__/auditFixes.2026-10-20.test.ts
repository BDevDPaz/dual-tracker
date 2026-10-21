/**
 * Regresión de la auditoría 2026-10-20 (A1–A4, A6–A10).
 * A5 queda pendiente a propósito: no hay caso aquí.
 */
import { getPublicKey, sign } from "@noble/ed25519";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import * as Crypto from "expo-crypto";
import * as Location from "expo-location";
import { setLanguage, tLineKind } from "../../../i18n";
import { DEFAULT_EXIT_DEBOUNCE_MS } from "../../../config/provisional";
import { KV_KEYS } from "../../persistence/schema";
import { PersistenceService } from "../../persistence/PersistenceService";
import { KeyStore } from "../../persistence/keyStore";
import { b64urlEncode, utf8 } from "../../persistence/cryptoCodec";
import { TimeAuthorityService } from "../../evidence/TimeAuthorityService";
import { EvidencePackService, computeContentHash, packHashBody, statementForHash } from "../../evidence/EvidencePackService";
import { sha256Hex } from "../../evidence/HashChain";
import { signedMessage } from "../../evidence/packSignature";
import { canonicalJson } from "../../../utils/canonicalJson";
import { getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { combineWeekStatements } from "../../../utils/reportRange";
import { IntegrityLedgerService, LEDGER_KV } from "../IntegrityLedgerService";
import { acknowledgeLedgerBreak, checkLedgerIntegrity } from "../../application/useCases/ledgerIntegrity";
import { previewPayroll } from "../../application/useCases/generateWeeklyPayroll";
import { SecurityService } from "../../runtime/SecurityService";
import { GeofenceRuntimeService, geofenceIdentifier } from "../../runtime/GeofenceRuntimeService";
import { computeSegmentMinutes } from "../segmentation";
import { transition } from "../sessionMachine";
import { FixedLunchError, FutureTimestampError, fixedLunchExceedsSession } from "../sessionTimeGuard";
import { SessionEngineService } from "../SessionEngineService";
import { COMPANY, HOUR, MIN, makeClosedSession, makeCtx, makeSession } from "../../../../test/fixtures/session.fixture";
import { makeStatement } from "../../../../test/fixtures/payroll.fixture";
import { SITE_LAT, SITE_LON, makeExit } from "../../../../test/fixtures/spatial.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../test/helpers";
import { LocationMock } from "../../../../test/runtimeHarness";
import { time } from "../../../../test/time";
import type { EvidencePack, PayrollStatement } from "../../../core/contracts";

async function tamperPayload(id: number) {
  const db = await PersistenceService.init();
  await db.execAsync(`DROP TRIGGER IF EXISTS trg_ledger_no_update`);
  await db.runAsync(`UPDATE ledger_entries SET payload_json = payload_json || ' ' WHERE id = ?`, [id]);
}

async function closedWeek() {
  const { siteA } = await seedWorld();
  await startAndArrive(siteA);
  time.travel(8 * HOUR);
  await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
  return { periodStart: getWeekStart(time.now()), periodEnd: getWeekEnd(time.now()) };
}

async function sealWeek() {
  const period = await closedWeek();
  const sealed = await EvidencePackService.seal(period);
  if (!sealed.ok || !sealed.data) throw new Error("seal");
  return { period, pack: sealed.data };
}

describe("auditoría 2026-10-20", () => {
  test("A1: un sello idempotente no reutiliza el pack si el ledger está roto", async () => {
    const { period, pack } = await sealWeek();
    const entries = await PersistenceService.listLedger();
    await tamperPayload(entries[0].id);
    const again = await EvidencePackService.seal(period);
    expect(again).toMatchObject({ ok: false, code: "LEDGER_BROKEN" });
    expect(await IntegrityLedgerService.verify()).toMatchObject({ valid: false, brokenAtId: entries[0].id });
    const fresh = await EvidencePackService.describeFreshness(period.periodStart, period.periodEnd);
    expect(fresh.matches).toBe(false);
    expect(fresh.latestPackId).toBe(pack.id);
  });

  test("A2: quitar la firma o firmar con otra clave no verifica; el pack original sí", async () => {
    const { pack } = await sealWeek();
    expect(await EvidencePackService.verify(pack)).toEqual({ valid: true, legacy: false, scheme: "Ed25519", failures: [], identity: "device", identityNote: null });

    const line = pack.statement.lines[0];
    const statement: PayrollStatement = {
      ...pack.statement,
      regularHours: pack.statement.regularHours + 5,
      grossEstimate: pack.statement.grossEstimate + 100,
      lines: [{ ...line, minutes: line.minutes + 300, amount: line.amount + 100 }, ...pack.statement.lines.slice(1)],
    };
    const statementHash = await sha256Hex(canonicalJson({ ...statementForHash(statement), packHash: null }));
    const contentHash = await computeContentHash(statement, pack.evidence);
    const { packHash: _old, files, signature: _sig, ...rest } = pack.manifest;
    const body = packHashBody({ ...rest, statementHash, contentHash });
    const packHash = await sha256Hex(canonicalJson(body));
    const rewritten: EvidencePack = {
      ...pack,
      statement: { ...statement, packHash },
      manifest: { ...rest, statementHash, contentHash, packHash, files },
    };
    expect(await EvidencePackService.verify(rewritten)).toMatchObject({ valid: false, scheme: "unsigned-v1" });
    expect((await EvidencePackService.verify(rewritten)).failures).toContain("SIGNATURE_MISSING");

    const seed = Crypto.getRandomBytes(32);
    const publicKey = getPublicKey(seed);
    const keyId = `ed25519:${bytesToHex(sha256(publicKey)).slice(0, 16)}`;
    const value = sign(utf8.encode(signedMessage(body, packHash)), seed);
    const forged: EvidencePack = {
      ...rewritten,
      manifest: {
        ...rewritten.manifest,
        signature: { algorithm: "Ed25519", keyId, publicKey: b64urlEncode(publicKey), value: b64urlEncode(value) },
      },
    };
    const foreign = await EvidencePackService.verify(forged);
    expect(foreign.valid).toBe(false);
    expect(foreign.failures).toContain("SIGNATURE_KEY");
    expect(await EvidencePackService.verify(pack)).toEqual({ valid: true, legacy: false, scheme: "Ed25519", failures: [], identity: "device", identityNote: null });
  });

  test("A2: un sello sin llavero (PACK_UNSIGNED) sigue verificando", async () => {
    KeyStore.__setFailure(new Error("keystore caído"));
    const period = await closedWeek();
    const sealed = await EvidencePackService.seal({ ...period, allowUncertified: true });
    KeyStore.__setFailure(null);
    if (!sealed.ok || !sealed.data) throw new Error("seal");
    expect(sealed.data.manifest.signature).toBeUndefined();
    expect(sealed.data.manifest.sealWarnings?.map((w) => w.code)).toContain("PACK_UNSIGNED");
    expect(await EvidencePackService.verify(sealed.data)).toMatchObject({ valid: true, scheme: "unsigned-v1", failures: [] });
  });

  test("A3: la verificación incremental ve un payload alterado en el prefijo ya marcado", async () => {
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(HOUR);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    const entries = await PersistenceService.listLedger();
    const healthy = await checkLedgerIntegrity("FULL");
    expect(healthy.verification.valid).toBe(true);
    expect(healthy.incident).toBeNull();
    expect(await PersistenceService.getKv(LEDGER_KV.VERIFIED_THROUGH)).toMatchObject({ id: entries[entries.length - 1].id });

    await tamperPayload(entries[0].id);
    const inc = await checkLedgerIntegrity("INCREMENTAL");
    expect(inc.verification.valid).toBe(false);
    expect(inc.verification.brokenAtId).toBe(entries[0].id);
    expect(inc.incident?.breakAtId).toBe(entries[0].id);
    expect((await IntegrityLedgerService.verify()).valid).toBe(false);
  });

  test("A4: el cierre automático no guarda un fin posterior al techo", async () => {
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(2 * HOUR);
    TimeAuthorityService.reanchor();
    time.jumpWall(30 * MIN);
    const exitAt = time.now();
    await mustDispatch({ type: "EXIT_DETECTED", fact: makeExit({ timestampMs: exitAt }) }, "GEOFENCE");
    time.jumpWall(-30 * MIN);
    TimeAuthorityService.reanchor();
    const ceiling = TimeAuthorityService.futureCeiling();
    expect(exitAt).toBeGreaterThan(ceiling);

    const manual = await SessionEngineService.dispatch({ type: "CLOSE_DAY", mode: "MANUAL" }, "UI");
    expect(manual).toMatchObject({ ok: false, code: "FUTURE_TIME" });

    const closed = await mustDispatch(
      { type: "AUTO_CLOSE", cause: "EXIT_DECISION_EXPIRED", confirmedOutside: false },
      "WATCHDOG",
    );
    expect(closed.endAtMs).not.toBeNull();
    expect(closed.endAtMs!).toBeLessThanOrEqual(TimeAuthorityService.futureCeiling());
    expect(closed.endAtMs!).toBeLessThan(exitAt);
    expect(closed.domainStatus).toBe("CERRADA");
  });

  test("A4: el repositorio no hereda un firstExit futuro como hora de fin", async () => {
    time.jumpWall(30 * MIN);
    TimeAuthorityService.reanchor();
    const exitAt = time.now();
    const start = exitAt - 2 * HOUR;
    const id = await PersistenceService.insertSession(
      makeSession({
        declaredStartAtMs: start,
        actualStartAtMs: start,
        domainStatus: "SALIDA",
        bookkeeping: { firstExitAtMs: exitAt, firstExitReliable: false },
      }),
    );
    time.jumpWall(-30 * MIN);
    TimeAuthorityService.reanchor();
    const stored = (await PersistenceService.getSession(id))!;
    expect(stored.bookkeeping.firstExitAtMs!).toBeGreaterThan(TimeAuthorityService.futureCeiling());
    await expect(
      PersistenceService.updateSession({ ...stored, endAtMs: stored.bookkeeping.firstExitAtMs, domainStatus: "CERRADA" }),
    ).rejects.toBeInstanceOf(FutureTimestampError);
    expect((await PersistenceService.getSession(id))!.endAtMs).toBeNull();
  });

  test("A6: la salida en la banda unknown no se queda colgada y un EXIT posterior no se tira", async () => {
    GeofenceRuntimeService.__resetForTests();
    const { siteA } = await seedWorld();
    const session = await startAndArrive(siteA);
    time.travel(3 * HOUR);
    LocationMock.__setPosition(SITE_LAT + 0.0011, SITE_LON, 10);
    const now = time.now();
    await PersistenceService.setKv(KV_KEYS.PENDING_EXIT, {
      sessionId: session.id,
      siteId: siteA,
      firstExitAtMs: now - 3 * MIN,
      reliable: true,
      reason: null,
      strikes: 3,
    });

    expect(await GeofenceRuntimeService.checkPendingExit()).toBe(false);
    expect((await PersistenceService.getSession(session.id))!.domainStatus).toBe("ACTIVA");
    expect(await GeofenceRuntimeService.getPendingExit()).toMatchObject({ strikes: 3 });

    await GeofenceRuntimeService.handleGeofenceEvent(Location.GeofencingEventType.Exit, {
      identifier: geofenceIdentifier(session.id, siteA),
      latitude: SITE_LAT,
      longitude: SITE_LON,
      radius: 100,
    });
    expect((await PersistenceService.getSession(session.id))!.domainStatus).toBe("ACTIVA");
    expect((await GeofenceRuntimeService.getPendingExit())!.strikes).toBeGreaterThan(3);

    time.travel(DEFAULT_EXIT_DEBOUNCE_MS);
    expect(await GeofenceRuntimeService.checkPendingExit()).toBe(true);
    expect((await PersistenceService.getSession(session.id))!.domainStatus).toBe("SALIDA");
    GeofenceRuntimeService.__resetForTests();
  });

  test("A7: el preview marca la cadena segmentada y la suma de semanas no la certifica ni duplica la sesión", async () => {
    await SecurityService.setPin("481236");
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(8 * HOUR);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    const week = { periodStart: getWeekStart(time.now()), periodEnd: getWeekEnd(time.now()) };
    const entries = await PersistenceService.listLedger();
    await tamperPayload(entries[1].id);
    const { incident } = await checkLedgerIntegrity("FULL");
    expect((await acknowledgeLedgerBreak("481236", incident!)).ok).toBe(true);

    const preview = await previewPayroll(week.periodStart, week.periodEnd);
    expect(preview.integrityRollup.certified).toBe(false);
    expect(preview.warnings).toContain("LEDGER_CHAIN_SEGMENTED");

    const sealed = await EvidencePackService.seal({ ...week, allowUncertified: true });
    if (!sealed.ok) throw new Error(sealed.code);
    expect(sealed.data.statement.integrityRollup.certified).toBe(false);

    const other = makeStatement({ sessionIds: [7] });
    other.integrityRollup = { total: 1, byClass: { VALID: 1, MANUAL: 0, AUTO: 0, CONFLICT: 0 }, hasConflict: false, certified: true };
    other.sessionClasses = [{ id: 7, integrityClass: "VALID" }];
    const segmented = makeStatement({ sessionIds: [7] });
    segmented.integrityRollup = { ...other.integrityRollup, certified: false };
    segmented.warnings = ["LEDGER_CHAIN_SEGMENTED"];
    segmented.sessionClasses = [{ id: 7, integrityClass: "VALID" }];
    const combined = combineWeekStatements([segmented, other]);
    expect(combined!.integrityRollup.certified).toBe(false);
    expect(combined!.integrityRollup.byClass.VALID).toBe(1);
    expect(combined!.sessionIds).toEqual([7]);
  });

  test("A8: una pausa no se etiqueta como almuerzo", () => {
    setLanguage("es");
    expect(tLineKind("PAUSE_DEDUCTION")).toBe("Pausa");
    expect(tLineKind("LUNCH_DEDUCTION")).toBe("Almuerzo");
    setLanguage("en");
    expect(tLineKind("PAUSE_DEDUCTION")).toBe("Break");
    expect(tLineKind("LUNCH_DEDUCTION")).toBe("Lunch");
  });

  test("A9: el almuerzo fijo no cabe si las pausas ya ocuparon la jornada", async () => {
    const start = time.now() - 2 * HOUR;
    const end = start + 60 * MIN;
    const lunch = { taken: true, startAtMs: null, endAtMs: null, deductedMinutes: 55 };
    expect(fixedLunchExceedsSession(lunch, start, end, 10)).toBe(true);
    expect(fixedLunchExceedsSession({ ...lunch, deductedMinutes: 50 }, start, end, 10)).toBe(false);

    const open = makeSession({
      declaredStartAtMs: start,
      actualStartAtMs: start,
      domainStatus: "ACTIVA",
      totalPausedMs: 10 * MIN,
    });
    const rejected = transition(open, { type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 55 }, makeCtx({ nowMs: end, actor: "USER", company: COMPANY }));
    expect(rejected).toMatchObject({ ok: false, code: "INVALID_TIMES", detail: "LUNCH_EXCEEDS_SESSION" });

    const bad = makeClosedSession(start, 0, {
      endAtMs: end,
      totalPausedMs: 10 * MIN,
      lunch,
    });
    await expect(PersistenceService.insertSession(bad)).rejects.toBeInstanceOf(FixedLunchError);
    const id = await PersistenceService.insertSession(makeClosedSession(start, 0, { endAtMs: end, totalPausedMs: 10 * MIN, lunch: { ...lunch, deductedMinutes: 50 } }));
    const stored = (await PersistenceService.getSession(id))!;
    await expect(PersistenceService.updateSession({ ...stored, lunch })).rejects.toBeInstanceOf(FixedLunchError);
    expect((await PersistenceService.getSession(id))!.lunch.deductedMinutes).toBe(50);
  });

  test("A10: el almuerzo fijo que no cabe en el primer tramo se descuenta del siguiente", () => {
    const start = Date.UTC(2026, 8, 22, 6, 50);
    const session = makeClosedSession(start, 0, {
      endAtMs: start + 490 * MIN,
      totalPausedMs: 10 * MIN,
      lunch: { taken: true, startAtMs: null, endAtMs: null, deductedMinutes: 60 },
      bookkeeping: { pauses: [{ startAtMs: start, endAtMs: start + 10 * MIN }], pausesSource: "RECORDED" },
    });
    const segs = computeSegmentMinutes(session, COMPANY, start + 490 * MIN)!;
    const work = segs.reduce((sum, seg) => sum + seg.workMinutes, 0);
    const lunchMin = segs.reduce((sum, seg) => sum + seg.lunchMinutes, 0);
    expect(lunchMin).toBe(60);
    expect(work).toBe(420);
  });
});
