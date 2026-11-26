/**
 * INTENDED REPO PATH:
 *   src/services/application/__tests__/upsertStartDayGeocodeFailure.test.ts
 *
 * Bug "sin destino" — Dual Tracker, main en 9198eb1.
 * Flujo completo por routeIntent, sin APK y sin UI:
 *   UPSERT_SITE (dirección manual) -> START_DAY -> intento de geocerca.
 *
 * Hallazgo que documenta (verificado en el código, no inventado):
 *  - routeIntent UPSERT_SITE devuelve { ok: true, data: site } sin el
 *    flag `geocoded`. La UI no puede saber desde ahí si se geocodificó.
 *  - routeIntent START_DAY descarta `geofenceReady`:
 *      const { result } = await startDay(...); return report(result);
 *    Solo el caso de uso directo startDay() devuelve geofenceReady.
 *  - startDay() con un sitio sin coordenadas abre la jornada en
 *    ESPERANDO (eso ya lo cubre startDay.test.ts) y
 *    GeofenceRuntimeService.startMonitoring() devuelve false sin
 *    registrar ninguna geocerca.
 *
 * Cómo correrlo (en el repo, sin APK):
 *   npm run test:domain -- upsertStartDayGeocodeFailure
 *   npm test -- upsertStartDayGeocodeFailure
 */
import type { Site } from "../../../core/contracts";
import { GEOFENCE_TASK_NAME } from "../../../constants/geolocation";
import { PersistenceService } from "../../persistence/PersistenceService";
import { SiteRegistryService } from "../../domain/SiteRegistryService";
import { GeofenceRuntimeService } from "../../runtime/GeofenceRuntimeService";
import { routeIntent } from "../intentRouter";
import { startDay } from "../useCases/startDay";
import { __state as locationState } from "../../../../test/mocks/expo-location";
import { LocationMock } from "../../../../test/runtimeHarness";
import { acceptDisclosure } from "../../../../test/helpers";

describe("UPSERT_SITE + START_DAY con dirección manual sin geocodificar", () => {
  beforeEach(async () => {
    await acceptDisclosure(true);
    // Cable real, como en src/core/boot.ts.
    SiteRegistryService.setGeocoder((address) =>
      GeofenceRuntimeService.geocodeAddress(address),
    );
    // El mock de expo-location empieza en []: sin resultados.
    locationState.geocode = [];
  });

  afterEach(() => {
    SiteRegistryService.setGeocoder(null);
  });

  async function createManualSite(): Promise<Site> {
    const created = await routeIntent({
      type: "UPSERT_SITE",
      // Igual que el alta rápida de DailySetupModal: alias, dirección
      // y cliente, sin radio (el radio efectivo cae al de la empresa).
      site: { alias: "Obra Manual", address: "Calle 1, Los Angeles, CA", clientName: null },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("UPSERT_SITE rechazado");
    return created.data as Site;
  }

  test("UPSERT_SITE con dirección manual sin geocodificar guarda el sitio sin coordenadas", async () => {
    const site = await createManualSite();

    expect(site.targetLat).toBeNull();
    expect(site.targetLon).toBeNull();
    expect(SiteRegistryService.isGeofenceReady(site)).toBe(false);
    expect((await PersistenceService.getSite(site.id))?.address).toBe(
      "Calle 1, Los Angeles, CA",
    );
    // El router no expone si se geocodificó: el flag `geocoded` de
    // SiteRegistryService.upsert se pierde en routeIntent.
    expect(site).not.toHaveProperty("geocoded");
  });

  test("START_DAY con ese sitio abre la jornada en ESPERANDO pero la geocerca no se arma", async () => {
    const site = await createManualSite();

    const started = await routeIntent({ type: "START_DAY", siteId: site.id });
    expect(started.ok).toBe(true);
    // routeIntent descarta geofenceReady: la UI no lo recibe por aquí.
    expect(started).not.toHaveProperty("geofenceReady");

    const session = await PersistenceService.getOpenSession();
    expect(session?.siteId).toBe(site.id);
    expect(session?.domainStatus).toBe("ESPERANDO");

    expect(await GeofenceRuntimeService.startMonitoring(session!.id, site.id)).toBe(false);
    expect(LocationMock.__state.geofences.has(GEOFENCE_TASK_NAME)).toBe(false);
  });

  test("startDay directo sí devuelve geofenceReady: false con el mismo sitio", async () => {
    const site = await createManualSite();

    const { result, geofenceReady } = await startDay({ siteId: site.id });

    expect(result.ok).toBe(true);
    expect(geofenceReady).toBe(false);
    expect(result.ok && result.data?.session.domainStatus).toBe("ESPERANDO");
    expect(result.ok && result.data?.session.siteId).toBe(site.id);
  });

  test("con geocoder que resuelve, UPSERT + START_DAY dejan la geocerca armable (control)", async () => {
    locationState.geocode = [{ latitude: 34.05, longitude: -118.24 }];

    const site = await createManualSite();
    expect(site.targetLat).toBeCloseTo(34.05, 4);
    expect(site.targetLon).toBeCloseTo(-118.24, 4);
    expect(SiteRegistryService.isGeofenceReady(site)).toBe(true);

    const { result, geofenceReady } = await startDay({ siteId: site.id });
    expect(result.ok).toBe(true);
    expect(geofenceReady).toBe(true);

    const session = await PersistenceService.getOpenSession();
    expect(await GeofenceRuntimeService.startMonitoring(session!.id, site.id)).toBe(true);
    expect(LocationMock.__state.geofences.has(GEOFENCE_TASK_NAME)).toBe(true);
    const regions = LocationMock.__state.geofences.get(GEOFENCE_TASK_NAME) as {
      latitude: number;
      longitude: number;
    }[];
    expect(regions?.[0]?.latitude).toBeCloseTo(34.05, 4);
    expect(regions?.[0]?.longitude).toBeCloseTo(-118.24, 4);
  });
});
