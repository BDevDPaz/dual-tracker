/** P3 (spec v1.3 §5.3) — Pausas y almuerzo por segmento, reconstrucción desde el ledger, recorte por MANUAL_PATCH. */
import { companyCalendar } from "../../../utils/companyPolicy";
import { PersistenceService, backfillPausesFromLedger } from "../../persistence/PersistenceService";
import { KV_KEYS } from "../../persistence/schema";
import { computeSessionMinutes } from "../PayrollEngineService";
import { SessionEngineService } from "../SessionEngineService";
import { computeSegmentMinutes, cumulativeMinutes, prorate, segmentInterval } from "../segmentation";
import { COMPANY, HOUR, MIN, makeClosedSession } from "../../../../test/fixtures/session.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../test/helpers";
import { time } from "../../../../test/time";

const H = companyCalendar(COMPANY);
/** Lun 21 sep 2026 22:00 PDT. */
const MON_22 = Date.UTC(2026, 8, 22, 5);

describe("P3 — pausas por segmento", () => {
  beforeEach(() => PersistenceService.init());

  test("pausa 23:50–00:20 partida en 10 + 20 min", () => {
    const s = makeClosedSession(MON_22, 8, {
      totalPausedMs: 30 * MIN,
      lunch: { taken: true, startAtMs: MON_22 + 5 * HOUR, endAtMs: MON_22 + 5 * HOUR + 30 * MIN, deductedMinutes: null },
      bookkeeping: { pauses: [{ startAtMs: MON_22 + HOUR + 50 * MIN, endAtMs: MON_22 + 2 * HOUR + 20 * MIN }] },
    });
    const segs = computeSegmentMinutes(s, COMPANY, MON_22 + 9 * HOUR, H)!;
    expect(segs.map((x) => x.segment.dateString)).toEqual(["2026-09-21", "2026-09-22"]);
    expect(segs.map((x) => x.spanMinutes)).toEqual([120, 360]);
    expect(segs.map((x) => x.pauseMinutes)).toEqual([10, 20]);
    // Almuerzo 03:00–03:30 en J2.
    expect(segs.map((x) => x.lunchMinutes)).toEqual([0, 30]);
    expect(segs.map((x) => x.workMinutes)).toEqual([110, 310]);
    expect(segs.flatMap((x) => x.warnings)).toEqual([]);
  });

  test("sesión de un solo segmento: mismos minutos que computeSessionMinutes", () => {
    const s = makeClosedSession(Date.UTC(2026, 8, 21, 15), 9, {
      totalPausedMs: 17 * MIN + 20_000,
      lunch: { taken: true, startAtMs: null, endAtMs: null, deductedMinutes: 45 },
    });
    const [seg] = computeSegmentMinutes(s, COMPANY, 0, H)!;
    const v1 = computeSessionMinutes(s, COMPANY, 0)!;
    expect([seg.spanMinutes, seg.lunchMinutes, seg.pauseMinutes, seg.workMinutes]).toEqual([v1.spanMinutes, v1.lunchMinutes, v1.pauseMinutes, v1.workMinutes]);
    expect(seg.warnings).toEqual([]);
  });

  test("respaldo: sesión antigua con solo total → prorrateo con advertencia; almuerzo declarado sin hora → LUNCH_PRORATED", () => {
    const s = makeClosedSession(MON_22, 8, {
      totalPausedMs: 40 * MIN,
      lunch: { taken: true, startAtMs: null, endAtMs: null, deductedMinutes: 30 },
      bookkeeping: { pausesSource: "PRORATED" },
    });
    const segs = computeSegmentMinutes(s, COMPANY, 0, H)!;
    // Pesos 120/360: 40 → 10 + 30; 30 → 7 + 22 → resto al primero → 8 + 22.
    expect(segs.map((x) => x.pauseMinutes)).toEqual([10, 30]);
    expect(segs.map((x) => x.lunchMinutes)).toEqual([8, 22]);
    expect(segs[0].warnings).toEqual(expect.arrayContaining(["PAUSE_PRORATED", "LUNCH_PRORATED"]));
  });

  test("helpers: redondeo acumulado y prorrateo con resto al primer segmento", () => {
    const segs = segmentInterval(MON_22, MON_22 + 8 * HOUR, H);
    expect(cumulativeMinutes([[MON_22 + 2 * HOUR - 30_000, MON_22 + 2 * HOUR + 31_000]], segs)).toEqual([1, 0]);
    expect(prorate(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(prorate(0, [5, 5])).toEqual([0, 0]);
  });

  test("registro: LUNCH_START (pausa) agrega { now, null } y RESUME la cierra; total_paused_ms derivado", async () => {
    time.set(Date.UTC(2026, 8, 21, 15));
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    await mustDispatch({ type: "LUNCH_START" });
    time.travel(30 * MIN);
    await mustDispatch({ type: "RESUME" });
    time.travel(HOUR);
    const p0 = time.now();
    const paused = await mustDispatch({ type: "LUNCH_START" });
    expect(paused.bookkeeping.pauses).toEqual([{ startAtMs: p0, endAtMs: null }]);
    time.travel(12 * MIN);
    const resumed = await mustDispatch({ type: "RESUME" });
    expect(resumed.bookkeeping.pauses).toEqual([{ startAtMs: p0, endAtMs: p0 + 12 * MIN }]);
    time.travel(HOUR);
    const p1 = time.now();
    await mustDispatch({ type: "LUNCH_START" });
    time.travel(5 * MIN);
    const closed = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    expect(closed.bookkeeping.pauses).toEqual([
      { startAtMs: p0, endAtMs: p0 + 12 * MIN },
      { startAtMs: p1, endAtMs: p1 + 5 * MIN },
    ]);
    expect(closed.totalPausedMs).toBe(17 * MIN);
    expect((await PersistenceService.getSession(s.id))!.bookkeeping.pauses).toHaveLength(2);
  });

  describe("almuerzo declarado al cerrar", () => {
    test("jornada que cruza el límite: la hora es obligatoria; con hora se guarda el intervalo", async () => {
      time.set(MON_22);
      const { siteA } = await seedWorld();
      const s = await startAndArrive(siteA);
      time.travel(8 * HOUR);
      const r = await SessionEngineService.dispatch(
        { type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 30 },
        "UI",
      );
      expect(r).toMatchObject({ ok: false, code: "LUNCH_START_REQUIRED" });
      const lunchAt = MON_22 + 5 * HOUR;
      const closed = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 30, lunchStartAtMs: lunchAt });
      expect(closed.lunch).toEqual({ taken: true, startAtMs: lunchAt, endAtMs: lunchAt + 30 * MIN, deductedMinutes: 30 });
      expect(closed.id).toBe(s.id);
    });

    test("un solo segmento: no hace falta hora", async () => {
      time.set(Date.UTC(2026, 8, 21, 15));
      const { siteA } = await seedWorld();
      await startAndArrive(siteA);
      time.travel(8 * HOUR);
      const closed = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 30 });
      expect(closed.lunch).toMatchObject({ startAtMs: null, deductedMinutes: 30 });
    });

    test("hora fuera de la jornada → INVALID_TIMES", async () => {
      time.set(MON_22);
      const { siteA } = await seedWorld();
      await startAndArrive(siteA);
      time.travel(8 * HOUR);
      const r = await SessionEngineService.dispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 30, lunchStartAtMs: MON_22 - HOUR }, "UI");
      expect(r).toMatchObject({ ok: false, code: "INVALID_TIMES" });
    });
  });

  describe("migración única desde el ledger", () => {
    async function legacyClosedWithPauses() {
      time.set(Date.UTC(2026, 8, 21, 15));
      const { siteA } = await seedWorld();
      const s = await startAndArrive(siteA);
      await mustDispatch({ type: "LUNCH_START" });
      time.travel(30 * MIN);
      await mustDispatch({ type: "RESUME" });
      time.travel(HOUR);
      await mustDispatch({ type: "LUNCH_START" });
      time.travel(12 * MIN);
      await mustDispatch({ type: "RESUME" });
      time.travel(HOUR);
      await mustDispatch({ type: "LUNCH_START" });
      time.travel(8 * MIN);
      await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
      const db = await PersistenceService.init();
      // Simula una sesión anterior a pauses_json.
      await db.runAsync(`UPDATE sessions SET pauses_json = '[]', pauses_source = 'RECORDED' WHERE id = ?`, [s.id]);
      await db.runAsync(`DELETE FROM app_kv WHERE key = ?`, [KV_KEYS.PAUSES_BACKFILL]);
      return { id: s.id, db };
    }

    test("coincidente (±60 s) → LEDGER con intervalos (la pausa abierta al cierre se cierra en end_ms)", async () => {
      const { id, db } = await legacyClosedWithPauses();
      expect(await backfillPausesFromLedger(db)).toEqual({ ledger: 1, prorated: 0 });
      const s = (await PersistenceService.getSession(id))!;
      expect(s.bookkeeping.pausesSource).toBe("LEDGER");
      expect(s.bookkeeping.pauses!.map((p) => (p.endAtMs! - p.startAtMs) / MIN)).toEqual([12, 8]);
      // Idempotente: segunda pasada no hace nada.
      expect(await backfillPausesFromLedger(db)).toEqual({ ledger: 0, prorated: 0 });
    });

    test("discrepante → PRORATED, sin intervalos, y el motor lo marca con advertencia al segmentar", async () => {
      const { id, db } = await legacyClosedWithPauses();
      await db.runAsync(`UPDATE sessions SET total_paused_ms = total_paused_ms + 300000 WHERE id = ?`, [id]);
      expect(await backfillPausesFromLedger(db)).toEqual({ ledger: 0, prorated: 1 });
      const s = (await PersistenceService.getSession(id))!;
      expect(s.bookkeeping.pausesSource).toBe("PRORATED");
      expect(s.bookkeeping.pauses).toBeUndefined();
    });
  });

  test("MANUAL_PATCH recorta pausas y almuerzo al nuevo intervalo, lo deja en el asiento y marca PAUSE_CLIPPED", async () => {
    time.set(Date.UTC(2026, 8, 21, 15));
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    const start = s.actualStartAtMs!;
    time.travel(HOUR);
    await mustDispatch({ type: "LUNCH_START" });
    time.travel(30 * MIN);
    await mustDispatch({ type: "RESUME" });
    time.travel(5 * HOUR);
    const p0 = time.now();
    await mustDispatch({ type: "LUNCH_START" });
    time.travel(20 * MIN);
    await mustDispatch({ type: "RESUME" });
    time.travel(HOUR);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    // Nuevo intervalo: empieza a mitad del almuerzo y termina a mitad de la pausa.
    const newStart = start + HOUR + 10 * MIN;
    const newEnd = p0 + 5 * MIN;
    const patched = await mustDispatch({ type: "MANUAL_PATCH", sessionId: s.id, declaredStartAtMs: newStart, endAtMs: newEnd, note: "Ajuste" });
    expect(patched.lunch).toMatchObject({ startAtMs: newStart, endAtMs: start + HOUR + 30 * MIN });
    expect(patched.bookkeeping.pauses).toEqual([{ startAtMs: p0, endAtMs: newEnd }]);
    expect(patched.totalPausedMs).toBe(5 * MIN);
    expect(patched.bookkeeping.breaksClipped).toBe(true);
    const entry = (await PersistenceService.listLedger()).filter((e) => e.intent === "MANUAL_PATCH").pop()!;
    expect(JSON.parse(entry.payloadJson).data.clippedBreaks).toEqual([
      { kind: "LUNCH", before: { startAtMs: start + HOUR, endAtMs: start + HOUR + 30 * MIN }, after: { startAtMs: newStart, endAtMs: start + HOUR + 30 * MIN } },
      { kind: "PAUSE", before: { startAtMs: p0, endAtMs: p0 + 20 * MIN }, after: { startAtMs: p0, endAtMs: newEnd } },
    ]);
    const segs = computeSegmentMinutes((await PersistenceService.getSession(s.id))!, COMPANY, time.now(), H)!;
    expect(segs[0].warnings).toContain("PAUSE_CLIPPED");
  });
});
