/** T3 — TraceRecorder: no graba fuera de ACTIVA/TRASLADO; accuracy > radio = unreliable. */
import type { SpatialFact } from "../../../core/contracts";
import type { RawLocationSample } from "../TraceRecorderService";
import { TraceRecorderService } from "../TraceRecorderService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { seedSite } from "../../../../test/helpers";
import { MIN, MONDAY_8AM, makeSession } from "../../../../test/fixtures/session.fixture";
import { SITE_LAT, SITE_LON, makeBreadcrumb, makeEnter, makeExit } from "../../../../test/fixtures/spatial.fixture";

const sample = (o: Partial<RawLocationSample> = {}): RawLocationSample => ({
  lat: SITE_LAT, lon: SITE_LON, accuracyM: 10, speedMps: 0, altitudeM: 0, timestampMs: MONDAY_8AM, source: "gps", ...o,
});
const opts = { mode: "BREADCRUMB" as const, radiusM: 100, battery: 0.8 };

describe("TraceRecorderService", () => {
  let sunk: SpatialFact[];
  beforeEach(() => {
    sunk = [];
    TraceRecorderService.setSink(async (f) => {
      sunk.push(f);
      return sunk.length;
    });
  });
  afterEach(() => TraceRecorderService.setSink(null));

  test("shouldRecord: solo BREADCRUMB en ACTIVA/TRASLADO", () => {
    expect(TraceRecorderService.shouldRecord("ACTIVA", "BREADCRUMB")).toBe(true);
    expect(TraceRecorderService.shouldRecord("TRASLADO", "BREADCRUMB")).toBe(true);
    for (const st of ["NO_INICIADA", "ESPERANDO", "PAUSADA", "SALIDA", "CERRADA"] as const) {
      expect(TraceRecorderService.shouldRecord(st, "BREADCRUMB")).toBe(false);
    }
    expect(TraceRecorderService.shouldRecord("ACTIVA", "PERIMETER")).toBe(false);
  });

  test("[obligatorio #9] status CERRADA ignora breadcrumb", async () => {
    const closed = makeSession({ domainStatus: "CERRADA", endAtMs: MONDAY_8AM + 8 * 60 * MIN });
    const r = await TraceRecorderService.ingest(closed, [sample(), sample({ timestampMs: MONDAY_8AM + MIN })], opts);
    expect(r).toEqual({ stored: 0, skipped: 2 });
    expect(sunk).toHaveLength(0);
  });

  test("ACTIVA graba miga; accuracy > radio queda unreliable", async () => {
    const r = await TraceRecorderService.ingest(makeSession(), [sample(), sample({ accuracyM: 250 }), sample({ lat: 999 })], opts);
    expect(r).toEqual({ stored: 2, skipped: 1 });
    expect(sunk.map((f) => [f.type, f.reliable, f.reason])).toEqual([
      ["BREADCRUMB", true, null],
      ["BREADCRUMB", false, "ACCURACY_GT_RADIUS"],
    ]);
  });

  test("fuera de rastro, una pérdida de precisión se registra como ACCURACY_DROP sin coordenadas", async () => {
    const waiting = makeSession({ domainStatus: "ESPERANDO" });
    await TraceRecorderService.ingest(waiting, [sample({ accuracyM: null })], opts);
    expect(sunk).toHaveLength(1);
    expect(sunk[0]).toMatchObject({ type: "ACCURACY_DROP", lat: null, lon: null, reliable: false });
  });

  test("profileFor: sin muestreo en CERRADA/NO_INICIADA; el almuerzo no graba pero el servicio tiene perfil", () => {
    expect(TraceRecorderService.profileFor("CERRADA", "BREADCRUMB")).toBeNull();
    expect(TraceRecorderService.profileFor("NO_INICIADA", "BREADCRUMB")).toBeNull();
    expect(TraceRecorderService.profileFor("TRASLADO", "PERIMETER")).not.toBeNull();
    expect(TraceRecorderService.profileFor("SALIDA", "PERIMETER")).not.toBeNull();
    expect(TraceRecorderService.profileFor("PAUSADA", "BREADCRUMB")).not.toBeNull();
    expect(TraceRecorderService.shouldRecord("PAUSADA", "BREADCRUMB")).toBe(false);
  });

  test("en sitio la distancia es 0 para que el reloj muestree quieto; la batería baja alarga el intervalo", () => {
    const onSite = TraceRecorderService.profileFor("ACTIVA", "BREADCRUMB")!;
    expect(onSite.distanceIntervalM).toBe(0);
    expect(onSite.timeIntervalMs).toBeGreaterThan(0);
    const low = TraceRecorderService.profileFor("ACTIVA", "BREADCRUMB", 0.1)!;
    expect(low.timeIntervalMs).toBe(onSite.timeIntervalMs * 3);
    expect(low.distanceIntervalM).toBe(0);
    const mid = TraceRecorderService.profileFor("ACTIVA", "BREADCRUMB", 0.3)!;
    expect(mid.timeIntervalMs).toBe(onSite.timeIntervalMs * 2);
    expect(TraceRecorderService.profileFor("ACTIVA", "BREADCRUMB", 0.8)!.timeIntervalMs).toBe(onSite.timeIntervalMs);
  });

  test("summarize y distanceMeters sobre persistencia real", async () => {
    await PersistenceService.init();
    await seedSite();
    await PersistenceService.insertSession(makeSession({ endAtMs: MONDAY_8AM + 8 * 60 * MIN, domainStatus: "CERRADA" }));
    TraceRecorderService.setSink(null);
    await PersistenceService.insertSpatialFact(makeEnter());
    await PersistenceService.insertSpatialFact(makeBreadcrumb({ timestampMs: MONDAY_8AM + MIN }));
    await PersistenceService.insertSpatialFact(makeBreadcrumb({ timestampMs: MONDAY_8AM + 11 * MIN, lat: SITE_LAT + 0.001 }));
    await PersistenceService.insertSpatialFact(makeExit({ timestampMs: MONDAY_8AM + 12 * MIN, reliable: false, reason: "ACCURACY_OVER_RADIUS" }));
    const sum = await TraceRecorderService.summarize(makeSession());
    expect(sum).toMatchObject({ pointCount: 2, unreliableCount: 1, dwellBySite: [{ siteId: 1, minutes: 10 }] });
    expect(sum.enterExit.map((e) => e.type)).toEqual(["ENTER", "EXIT"]);
    const pts = await TraceRecorderService.listForSession(1);
    expect(TraceRecorderService.distanceMeters(pts)).toBeGreaterThan(100);
    expect(TraceRecorderService.distanceMeters(pts)).toBeLessThan(120);
  });

  test("purgeExpired no borra sin expediente y, con periodo sellado y plazo cumplido, borra la miga", async () => {
    await PersistenceService.init();
    await seedSite();
    await PersistenceService.insertSession(makeSession({ domainStatus: "CERRADA", endAtMs: MONDAY_8AM }));
    TraceRecorderService.setSink(null);
    const old = Date.parse("2026-01-01T00:00:00Z");
    await PersistenceService.insertSpatialFact(makeEnter({ timestampMs: old }));
    await PersistenceService.insertSpatialFact(makeBreadcrumb({ timestampMs: old }));
    expect(await TraceRecorderService.purgeExpired(30)).toBe(0);
    expect((await PersistenceService.listSpatialFacts(1)).map((f) => f.type)).toEqual(["ENTER", "BREADCRUMB"]);

    const periodEnd = old + 1000;
    await PersistenceService.insertPack({
      id: "pack-old",
      manifest: {
        manifestVersion: 4,
        packId: "pack-old",
        periodStart: old - 1000,
        periodEnd,
        sealedAtMs: periodEnd,
        policyId: "CA_DAILY8_WEEKLY40_v2",
        sessionIds: [1],
        statementHash: "s",
        evidenceHash: "e",
        contentHash: "c",
        packHash: "p",
        certified: true,
        sealWarnings: [],
        files: [],
      },
      statement: {} as never,
      evidence: {} as never,
      employeePdfUri: null,
      employerPdfUri: null,
      manifestUri: null,
      createdAtMs: periodEnd,
    });
    expect(await TraceRecorderService.purgeExpired(30)).toBe(1);
    expect((await PersistenceService.listSpatialFacts(1)).map((f) => f.type)).toEqual(["ENTER"]);
    const ledger = await PersistenceService.listLedger({ intent: "TRACE_PURGED" });
    expect(ledger).toHaveLength(1);
  });
});
