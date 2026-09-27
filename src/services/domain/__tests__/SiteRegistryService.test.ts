/** T1 — SiteRegistry: alta no inicia geocerca; archivar no borra visitas. */
import * as Location from "expo-location";
import { PersistenceService } from "../../persistence/PersistenceService";
import { SiteRegistryService } from "../SiteRegistryService";
import { COMPANY, HOUR } from "../../../../test/fixtures/session.fixture";
import { acceptDisclosure, mustDispatch, startAndArrive } from "../../../../test/helpers";
import { time } from "../../../../test/time";

type LocationMock = typeof Location & { __state: { geofences: Map<string, unknown[]> } };

describe("SiteRegistryService", () => {
  beforeEach(() => PersistenceService.init());

  test("alta geocodifica pero NO inicia geocerca", async () => {
    SiteRegistryService.setGeocoder(async () => ({ lat: 34.05, lon: -118.24 }));
    const r = await SiteRegistryService.upsert({ alias: " Obra ", address: "1 Main St", radiusM: 80 }, COMPANY);
    SiteRegistryService.setGeocoder(null);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.site.alias).toBe("Obra");
    expect(r.geocoded).toBe(true);
    expect(SiteRegistryService.isGeofenceReady(r.site)).toBe(true);
    expect((Location as LocationMock).__state.geofences.size).toBe(0);
  });

  test("validaciones: dirección, alias, radio, límite de destinos", async () => {
    expect(await SiteRegistryService.upsert({ alias: "A", address: " " }, COMPANY)).toEqual({ ok: false, code: "ADDRESS_REQUIRED" });
    expect(await SiteRegistryService.upsert({ alias: " ", address: "x" }, COMPANY)).toEqual({ ok: false, code: "ALIAS_REQUIRED" });
    expect(await SiteRegistryService.upsert({ alias: "A", address: "x", radiusM: 0 }, COMPANY)).toEqual({ ok: false, code: "INVALID_RADIUS" });
    expect(await SiteRegistryService.upsert({ id: 99, alias: "A", address: "x" }, COMPANY)).toEqual({ ok: false, code: "SITE_NOT_FOUND" });
    const limited = { ...COMPANY, destinationLimit: 1 };
    expect((await SiteRegistryService.upsert({ alias: "A", address: "x" }, limited)).ok).toBe(true);
    expect(await SiteRegistryService.upsert({ alias: "B", address: "y" }, limited)).toEqual({ ok: false, code: "DESTINATION_LIMIT" });
  });

  test("cambiar la dirección sin geocoder válido borra coordenadas viejas", async () => {
    SiteRegistryService.setGeocoder(async () => ({ lat: 34.05, lon: -118.24 }));
    const r = await SiteRegistryService.upsert({ alias: "A", address: "1 Main St" }, COMPANY);
    if (!r.ok) throw new Error("alta");
    SiteRegistryService.setGeocoder(async () => null);
    const e = await SiteRegistryService.upsert({ id: r.site.id, alias: "A", address: "2 Other St" }, COMPANY);
    SiteRegistryService.setGeocoder(null);
    expect(e.ok && e.site.targetLat).toBeNull();
  });

  test("radio efectivo: propio o el de la política", () => {
    expect(SiteRegistryService.effectiveRadius(null, COMPANY)).toBe(COMPANY.defaultRadiusM);
  });

  test("archivar no borra visitas ni historial", async () => {
    await acceptDisclosure(true);
    SiteRegistryService.setGeocoder(async () => ({ lat: 34.05, lon: -118.24 }));
    const r = await SiteRegistryService.upsert({ alias: "A", address: "1 Main St" }, COMPANY);
    SiteRegistryService.setGeocoder(null);
    if (!r.ok) throw new Error("alta");
    const s = await startAndArrive(r.site.id);
    time.travel(8 * HOUR);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });

    const a = await SiteRegistryService.archive(r.site.id);
    expect(a.ok && a.site.active).toBe(false);
    expect((await PersistenceService.getSession(s.id))?.siteId).toBe(r.site.id);
    expect(await SiteRegistryService.list()).toHaveLength(0);
    expect(await SiteRegistryService.list({ includeArchived: true })).toHaveLength(1);
    expect(await SiteRegistryService.archive(999)).toEqual({ ok: false, code: "SITE_NOT_FOUND" });
  });
});
