/**
 * INTENDED REPO PATH:
 *   src/services/domain/__tests__/siteGeocodeFailure.test.ts
 *
 * Bug "sin destino" — Dual Tracker, main en 9198eb1.
 * Reproduce el fallo de geocodificación con dirección manual, sin APK:
 * el mock de expo-location (test/mocks/expo-location.ts) devuelve
 * `__state.geocode = []` por defecto, así que GeofenceRuntimeService
 * .geocodeAddress devuelve null, igual que en el teléfono cuando
 * Location.geocodeAsync no encuentra la dirección.
 *
 * Lo que verifica:
 *  1. Con geocoder sin resultados, el alta guarda el sitio (ok: true)
 *     pero sin coordenadas y con geocoded: false.
 *  2. Con geocoder que resuelve, el alta guarda coordenadas (control).
 *  3. Si el geocoder lanza, el alta no falla y deja el sitio sin
 *     coordenadas (SiteRegistryService hace .catch(() => null)).
 *
 * Cómo correrlo (en el repo, sin APK):
 *   npm run test:domain -- siteGeocodeFailure
 *   npm test -- siteGeocodeFailure
 */
import { PersistenceService } from "../../persistence/PersistenceService";
import { SiteRegistryService } from "../SiteRegistryService";
import { GeofenceRuntimeService } from "../../runtime/GeofenceRuntimeService";
import { __state as locationState } from "../../../../test/mocks/expo-location";
import { COMPANY } from "../../../../test/fixtures/session.fixture";

describe("SiteRegistry — alta con dirección manual y geocoder que falla", () => {
  beforeEach(() => {
    PersistenceService.init();
    // Cable real, como en src/core/boot.ts: el geocoder de verdad,
    // no uno falso que siempre resuelve.
    SiteRegistryService.setGeocoder((address) =>
      GeofenceRuntimeService.geocodeAddress(address),
    );
  });

  afterEach(() => {
    // setup.ts solo resetea el reverseGeocoder; el geocoder hay que
    // limpiarlo aquí o se filtra a otras suites.
    SiteRegistryService.setGeocoder(null);
  });

  test("alta con dirección manual y geocoder sin resultados guarda el sitio sin coordenadas", async () => {
    locationState.geocode = [];

    const r = await SiteRegistryService.upsert(
      { alias: "Obra Manual", address: "Calle 1, Los Angeles, CA", radiusM: 100 },
      COMPANY,
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geocoded).toBe(false);
    expect(r.site.targetLat).toBeNull();
    expect(r.site.targetLon).toBeNull();
    expect(SiteRegistryService.isGeofenceReady(r.site)).toBe(false);
    // El destino sí persiste: alias y dirección quedan guardados.
    expect((await PersistenceService.getSite(r.site.id))?.alias).toBe("Obra Manual");
    expect((await PersistenceService.getSite(r.site.id))?.address).toBe(
      "Calle 1, Los Angeles, CA",
    );
  });

  test("alta con dirección manual y geocoder que resuelve guarda coordenadas (control)", async () => {
    locationState.geocode = [{ latitude: 34.05, longitude: -118.24 }];

    const r = await SiteRegistryService.upsert(
      { alias: "Obra Manual", address: "Calle 1, Los Angeles, CA", radiusM: 100 },
      COMPANY,
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geocoded).toBe(true);
    expect(r.site.targetLat).toBeCloseTo(34.05, 4);
    expect(r.site.targetLon).toBeCloseTo(-118.24, 4);
    expect(SiteRegistryService.isGeofenceReady(r.site)).toBe(true);
  });

  test("si el geocoder lanza, el alta no falla y deja el sitio sin coordenadas", async () => {
    SiteRegistryService.setGeocoder(async () => {
      throw new Error("Network request failed");
    });

    const r = await SiteRegistryService.upsert(
      { alias: "Obra Manual", address: "Calle 1, Los Angeles, CA", radiusM: 100 },
      COMPANY,
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.geocoded).toBe(false);
    expect(r.site.targetLat).toBeNull();
    expect(r.site.targetLon).toBeNull();
  });
});
