/** T4 — PersistenceService sobre SQLite en memoria (sql.js) — "dos rangos no se pisan". */
import { PersistenceService } from "../PersistenceService";
import { SessionEngineService } from "../../domain/SessionEngineService";
import { HOUR, MIN, MONDAY_8AM, makeClosedSession, makeSegment, makeSession } from "../../../../test/fixtures/session.fixture";
import { makeBreadcrumb } from "../../../../test/fixtures/spatial.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../test/helpers";
import { time } from "../../../../test/time";

describe("PersistenceService", () => {
  beforeEach(() => PersistenceService.init());

  describe("checkOverlap", () => {
    beforeEach(async () => {
      await PersistenceService.insertSession(makeClosedSession(MONDAY_8AM, 8)); // 08:00–16:00
    });
    test("dos rangos que se cruzan → solape", async () => {
      expect(await PersistenceService.checkOverlap(MONDAY_8AM + 7 * HOUR, MONDAY_8AM + 10 * HOUR, null)).toBe(true);
      expect(await PersistenceService.checkOverlap(MONDAY_8AM - HOUR, MONDAY_8AM + MIN, null)).toBe(true);
      expect(await PersistenceService.checkOverlap(MONDAY_8AM + HOUR, MONDAY_8AM + 2 * HOUR, null)).toBe(true); // contenido
      expect(await PersistenceService.checkOverlap(MONDAY_8AM - HOUR, null, null)).toBe(true); // abierto hacia adelante
    });
    test("rangos contiguos o disjuntos no se pisan", async () => {
      expect(await PersistenceService.checkOverlap(MONDAY_8AM + 8 * HOUR, MONDAY_8AM + 9 * HOUR, null)).toBe(false);
      expect(await PersistenceService.checkOverlap(MONDAY_8AM - 2 * HOUR, MONDAY_8AM, null)).toBe(false);
    });
    test("se excluye la propia sesión, las borradas y las canceladas", async () => {
      expect(await PersistenceService.checkOverlap(MONDAY_8AM, MONDAY_8AM + HOUR, 1)).toBe(false);
      await PersistenceService.insertSession(makeClosedSession(MONDAY_8AM + 24 * HOUR, 8, { bookkeeping: { isDeleted: true } }));
      await PersistenceService.insertSession(makeClosedSession(MONDAY_8AM + 48 * HOUR, 8, { bookkeeping: { cancelled: true } }));
      expect(await PersistenceService.checkOverlap(MONDAY_8AM + 25 * HOUR, MONDAY_8AM + 26 * HOUR, null)).toBe(false);
      expect(await PersistenceService.checkOverlap(MONDAY_8AM + 49 * HOUR, MONDAY_8AM + 50 * HOUR, null)).toBe(false);
    });
  });

  test("MANUAL_PATCH que pisa otra jornada se rechaza con OVERLAP", async () => {
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(4 * HOUR);
    const first = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    time.travel(HOUR);
    await startAndArrive(siteA);
    time.travel(2 * HOUR);
    const second = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    const r = await SessionEngineService.dispatch(
      { type: "MANUAL_PATCH", sessionId: second.id, declaredStartAtMs: first.endAtMs! - 30 * MIN, endAtMs: second.endAtMs, note: "x" },
      "UI",
    );
    expect(r).toMatchObject({ ok: false, code: "OVERLAP" });
  });

  test("ida y vuelta de SessionRecord conserva todos los campos", async () => {
    const s = makeClosedSession(MONDAY_8AM, 8, {
      transitSegments: [makeSegment()],
      lunch: { taken: true, startAtMs: MONDAY_8AM + 4 * HOUR, endAtMs: MONDAY_8AM + 4.5 * HOUR, deductedMinutes: null },
      integrityClass: "MANUAL",
      bookkeeping: { manualNote: "nota privada", integrityReason: "MANUAL_PATCH", original: { declaredStartAtMs: 1, actualStartAtMs: 2, endAtMs: 3, capturedAtMs: 4 } },
    });
    const id = await PersistenceService.insertSession(s);
    expect(await PersistenceService.getSession(id)).toEqual({ ...s, id });
  });

  test("solo una jornada abierta; listSessions por rango y sin borradas", async () => {
    await PersistenceService.insertSession(makeClosedSession(MONDAY_8AM, 8));
    const openId = await PersistenceService.insertSession(makeSession({ declaredStartAtMs: MONDAY_8AM + 24 * HOUR }));
    await PersistenceService.insertSession(makeClosedSession(MONDAY_8AM + 48 * HOUR, 8, { bookkeeping: { isDeleted: true } }));
    expect((await PersistenceService.getOpenSession())?.id).toBe(openId);
    expect(await PersistenceService.countOpenSessions()).toBe(1);
    expect(await PersistenceService.listSessions({ from: MONDAY_8AM, to: MONDAY_8AM + 72 * HOUR })).toHaveLength(2);
    expect(await PersistenceService.listSessions({ includeDeleted: true })).toHaveLength(3);
  });

  test("hechos espaciales: coordenadas selladas en columna, legibles al mapear", async () => {
    const db = await PersistenceService.init();
    await PersistenceService.insertSpatialFact(makeBreadcrumb({ speedMps: 1.5 }));
    const raw = await db.getFirstAsync<Record<string, unknown>>(`SELECT * FROM spatial_facts`);
    expect(Object.keys(raw!)).not.toContain("lat");
    const [f] = await PersistenceService.listSpatialFacts(1);
    expect(f).toMatchObject({ type: "BREADCRUMB", lat: 34.0522, lon: -118.2437, reliable: true });
    expect(await PersistenceService.lastSpatialFactAt()).toBe(f.timestampMs);
  });

  test("transacción: un fallo revierte todo", async () => {
    await expect(
      PersistenceService.transaction(async (db) => {
        await PersistenceService.insertSession(makeSession(), db);
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    expect(await PersistenceService.countOpenSessions()).toBe(0);
  });

  test("KV y cola offline", async () => {
    await PersistenceService.setKv("k", { a: 1 });
    expect(await PersistenceService.getKv("k")).toEqual({ a: 1 });
    await PersistenceService.deleteKv("k");
    expect(await PersistenceService.getKv("k")).toBeNull();
    const id = await PersistenceService.enqueueOffline("P1");
    await PersistenceService.updateOffline(id, "FAILED", "net");
    expect(await PersistenceService.listOffline("FAILED")).toMatchObject([{ packId: "P1", attempts: 1, lastError: "net" }]);
  });

  test("init es idempotente (misma conexión)", async () => {
    const a = await PersistenceService.init();
    const b = await PersistenceService.init();
    expect(a).toBe(b);
    expect(PersistenceService.isReady()).toBe(true);
  });
});
