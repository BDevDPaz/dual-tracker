/** P5 (spec v1.3 §5.5) — Ruptura del ledger: incidente, reconocimiento con PIN, verificación por segmentos, sello. */
import { APP_VERSION } from "../../../../constants/app";
import { GENESIS_HASH } from "../../../../core/contracts";
import { Store } from "../../../../core/store";
import { getWeekEnd, getWeekStart } from "../../../../utils/dateUtils";
import { IntegrityLedgerService, LEDGER_KV } from "../../../domain/IntegrityLedgerService";
import { chainHash } from "../../../evidence/HashChain";
import { EvidencePackService } from "../../../evidence/EvidencePackService";
import { PersistenceService } from "../../../persistence/PersistenceService";
import { SecurityService } from "../../../runtime/SecurityService";
import { acknowledgeLedgerBreak, checkLedgerIntegrity, exportLedgerIncident } from "../ledgerIntegrity";
import { HOUR } from "../../../../../test/fixtures/session.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../../test/helpers";
import { time } from "../../../../../test/time";

const PIN = "481236";

async function closedDay(siteId: number) {
  await startAndArrive(siteId);
  time.travel(9 * HOUR);
  await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 60 });
  return { periodStart: getWeekStart(time.now()), periodEnd: getWeekEnd(time.now()) };
}

/** Manipula un asiento (solo en la BD de test: el trigger append-only se retira aquí). */
async function tamper(id: number) {
  const db = await PersistenceService.init();
  await db.execAsync(`DROP TRIGGER IF EXISTS trg_ledger_no_update`);
  await db.runAsync(`UPDATE ledger_entries SET reason = reason || '_X', payload_json = payload_json || ' ' WHERE id = ?`, [id]);
}

async function world() {
  const { siteA } = await seedWorld();
  const week = await closedDay(siteA);
  const entries = await PersistenceService.listLedger();
  return { siteA, week, entries };
}

describe("P5 — LEDGER_BREAK_ACKNOWLEDGED", () => {
  beforeEach(async () => {
    await PersistenceService.init();
    const pr = await SecurityService.setPin(PIN);
    if (!pr.ok) throw new Error("setPin " + pr.code);
  });

  test("la ruptura abre un incidente con los campos exactos y persiste en KV", async () => {
    const { entries } = await world();
    const target = entries[2];
    await tamper(target.id);
    const tampered = (await PersistenceService.listLedger()).find((e) => e.id === target.id)!;
    const { incident } = await checkLedgerIntegrity("FULL");
    const last = entries[entries.length - 1];
    expect(incident).toEqual({
      breakAtId: target.id,
      lastGoodId: entries[1].id,
      lastGoodHash: entries[1].hash,
      observedPrevHash: target.prevHash,
      observedHash: target.hash,
      recomputedHash: await chainHash(entries[1].hash, tampered.payloadJson),
      detectedAtMs: time.now(),
      headAtDetection: { id: last.id, hash: last.hash },
    });
    expect(await PersistenceService.getKv(LEDGER_KV.BROKEN)).toEqual(incident);
    expect(Store.getState().health.ledger.broken).toEqual(incident);
    // Una segunda detección conserva el incidente original (detectedAtMs).
    time.travel(HOUR);
    expect((await checkLedgerIntegrity("INCREMENTAL")).incident).toEqual(incident);
  });

  test("ruptura en el primer asiento: lastGoodId null y lastGoodHash = GENESIS", async () => {
    const { entries } = await world();
    await tamper(entries[0].id);
    const { incident } = await checkLedgerIntegrity("FULL");
    expect(incident).toMatchObject({ breakAtId: entries[0].id, lastGoodId: null, lastGoodHash: GENESIS_HASH });
  });

  test("con incidente abierto el sello se rechaza con LEDGER_BROKEN, también con allowUncertified", async () => {
    const { entries, week } = await world();
    await tamper(entries[1].id);
    const r1 = await EvidencePackService.seal(week);
    const r2 = await EvidencePackService.seal({ ...week, allowUncertified: true });
    expect(r1).toMatchObject({ ok: false, code: "LEDGER_BROKEN" });
    expect(r2).toMatchObject({ ok: false, code: "LEDGER_BROKEN" });
    // El sello detectó y registró el incidente por sí mismo (verificación completa previa).
    expect(await IntegrityLedgerService.getIncident()).toMatchObject({ breakAtId: entries[1].id });
  });

  test("la jornada abierta se degrada a CONFLICT con LEDGER_CHAIN_BROKEN", async () => {
    const { siteA } = await seedWorld();
    const open = await startAndArrive(siteA);
    const entries = await PersistenceService.listLedger();
    await tamper(entries[0].id);
    await checkLedgerIntegrity("FULL");
    const s = (await PersistenceService.getSession(open.id))!;
    expect(s.integrityClass).toBe("CONFLICT");
    expect(s.bookkeeping.integrityReason).toBe("LEDGER_CHAIN_BROKEN");
  });

  test("reconocimiento: PIN incorrecto o incidente distinto se rechazan; el correcto abre un segmento", async () => {
    const { entries } = await world();
    const target = entries[1];
    await tamper(target.id);
    const { incident } = await checkLedgerIntegrity("FULL");
    expect(await acknowledgeLedgerBreak("0000", incident!)).toMatchObject({ ok: false, code: "ADMIN_DENIED" });
    expect(await acknowledgeLedgerBreak(PIN, { ...incident!, observedHash: "f".repeat(64) })).toMatchObject({
      ok: false,
      code: "LEDGER_INCIDENT_MISMATCH",
    });
    expect(await IntegrityLedgerService.getIncident()).toEqual(incident);

    const ok = await acknowledgeLedgerBreak(PIN, incident!);
    expect(ok.ok).toBe(true);
    const ack = (await PersistenceService.listLedger({ intent: "LEDGER_BREAK_ACKNOWLEDGED" }))[0];
    expect(ack.sessionId).toBeNull();
    const data = JSON.parse(ack.payloadJson).data;
    expect(data).toMatchObject({
      breakAtId: target.id,
      lastGoodId: entries[0].id,
      lastGoodHash: entries[0].hash,
      observedPrevHash: target.prevHash,
      observedHash: target.hash,
      recomputedHash: incident!.recomputedHash,
      headAtAckId: entries[entries.length - 1].id,
      headAtAckHash: entries[entries.length - 1].hash,
      incidentHash: await IntegrityLedgerService.incidentHash(incident!),
      acknowledgedAtMs: time.now(),
    });
    expect(await IntegrityLedgerService.getIncident()).toBeNull();
    const v = await IntegrityLedgerService.verify();
    expect(v.valid).toBe(true);
    expect(v.quarantinedIds).toEqual([target.id]);
    expect(v.acknowledgedBreaks).toBe(1);
    expect(v.segments).toHaveLength(2);
    expect(v.segments[0]).toMatchObject({ fromId: entries[0].id, toId: entries[0].id, anchor: GENESIS_HASH });
    expect(v.segments[1]).toMatchObject({ fromId: entries[2].id, anchor: target.hash, valid: true });
    expect(Store.getState().health.ledger).toEqual({ broken: null, acknowledgedBreaks: 1 });
    // Sin incidente: un segundo reconocimiento no procede.
    expect(await acknowledgeLedgerBreak(PIN, incident!)).toMatchObject({ ok: false, code: "NO_LEDGER_INCIDENT" });
  });

  test("periodo tocado: solo no certificado; un periodo posterior vuelve a certificar", async () => {
    const { siteA, entries, week } = await world();
    await tamper(entries[1].id);
    const { incident } = await checkLedgerIntegrity("FULL");
    expect((await acknowledgeLedgerBreak(PIN, incident!)).ok).toBe(true);

    expect(await EvidencePackService.seal(week)).toMatchObject({ ok: false, code: "PERIOD_NOT_CERTIFIABLE" });
    const r = await EvidencePackService.seal({ ...week, allowUncertified: true });
    if (!r.ok) throw new Error(r.code);
    expect(r.data.manifest.certified).toBe(false);
    expect(r.data.statement.integrityRollup.certified).toBe(false);
    expect(r.data.statement.warnings).toContain("LEDGER_CHAIN_SEGMENTED");

    time.travel(7 * 24 * HOUR - 10 * HOUR);
    const next = await closedDay(siteA);
    const r2 = await EvidencePackService.seal(next);
    if (!r2.ok) throw new Error(r2.code);
    expect(r2.data.manifest.certified).toBe(true);
    expect(await EvidencePackService.verify(r2.data)).toMatchObject({ valid: true });
  });

  test("una segunda ruptura tras el reconocimiento abre un incidente nuevo", async () => {
    const { siteA, entries } = await world();
    await tamper(entries[1].id);
    const first = (await checkLedgerIntegrity("FULL")).incident!;
    await acknowledgeLedgerBreak(PIN, first);
    time.travel(14 * HOUR);
    await closedDay(siteA);
    const later = (await PersistenceService.listLedger()).filter((e) => e.id > entries[entries.length - 1].id + 1);
    await tamper(later[1].id);
    expect((await checkLedgerIntegrity("INCREMENTAL")).incident).toMatchObject({ breakAtId: later[1].id });
    const full = await IntegrityLedgerService.verify();
    expect(full).toMatchObject({ valid: false, brokenAtId: later[1].id, acknowledgedBreaks: 1 });
  });

  test("informe de incidente reproducible y asiento LEDGER_BREAK_EXPORTED", async () => {
    const { entries } = await world();
    await tamper(entries[2].id);
    await checkLedgerIntegrity("FULL");
    const a = await IntegrityLedgerService.buildIncidentReport(APP_VERSION);
    const b = await IntegrityLedgerService.buildIncidentReport(APP_VERSION);
    expect(a.sha256).toBe(b.sha256);
    expect(a.report.rows.breakAt?.id).toBe(entries[2].id);
    expect(a.report.rows.lastGood?.id).toBe(entries[1].id);
    const r = await exportLedgerIncident();
    expect(r.ok).toBe(true);
    const exp = (await PersistenceService.listLedger({ intent: "LEDGER_BREAK_EXPORTED" }))[0];
    expect(JSON.parse(exp.payloadJson).data).toEqual({ reportSha256: a.sha256, ledgerPayloadVersion: 2 });
  });
});
