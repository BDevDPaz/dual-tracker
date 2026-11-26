/**
 * INTENDED REPO PATH:
 *   src/core/selectors/__tests__/targetCoordsWarning.test.ts
 *
 * Aviso en Hoy — Dual Tracker, rama fix/sin-destino-aviso.
 *
 * Hoy no depende de un resultado transitorio de routeIntent para avisar:
 * el aviso se deriva del estado, con las mismas piezas que usa la vista
 * (`selectCurrentTargetSite` + `SiteRegistryService.isGeofenceReady`).
 * Por eso sobrevive a recargar la app: mientras la jornada abierta tenga
 * como destino un sitio sin coordenadas, el aviso sigue ahí.
 *
 * Detalle del test: `seedSite` y `startDay` escriben en SQLite, no en el
 * store de la UI. Igual que en la app real (boot + `refreshMirror` al
 * enfocar), hay que hidratar el store y releer el snapshot con
 * `refreshMirror({ force: true })` antes de leer el selector. Sin ese
 * paso `selectCurrentTargetSite(Store.getState())` devuelve null aunque
 * la sesión esté abierta en SQLite.
 *
 * Lo que verifica:
 *  1. Jornada abierta con destino sin coordenadas: el destino objetivo
 *     existe y no está listo para geocerca (condición del aviso: true).
 *  2. Jornada abierta con destino con coordenadas (control): el destino
 *     objetivo sí está listo para geocerca (condición del aviso: false).
 *
 * Cómo correrlo (en el repo, sin APK):
 *   npm run test:domain -- targetCoordsWarning
 *   npm run typecheck
 */
import { Store, StoreActions } from "../../store";
import { selectCurrentTargetSite } from "../index";
import { SiteRegistryService } from "../../../services/domain/SiteRegistryService";
import { startDay } from "../../../services/application/useCases/startDay";
import { refreshMirror } from "../../../services/application/refreshMirror";
import { SettingsService } from "../../../services/persistence/SettingsService";
import { acceptDisclosure, seedSite } from "../../../../test/helpers";
import { time } from "../../../../test/time";

async function mirrorStoreFromPersistence(): Promise<void> {
  const settings = await SettingsService.load();
  StoreActions.hydrated({
    sessions: [],
    sites: [],
    packs: [],
    sharedPackIds: [],
    settings,
    osKillDetected: false,
    hasPin: false,
    nowMs: time.now(),
  });
  const mirrored = await refreshMirror({ force: true });
  expect(mirrored.applied).toBe(true);
}

describe("aviso de destino sin coordenadas en Hoy", () => {
  test("destino sin coordenadas: el objetivo existe pero no está listo para geocerca", async () => {
    await acceptDisclosure(true);
    const siteId = await seedSite({ alias: "Obra Manual", address: "Calle 1, Los Angeles, CA", targetLat: null, targetLon: null });

    const { result, geofenceReady } = await startDay({ siteId });
    expect(result.ok).toBe(true);
    expect(geofenceReady).toBe(false);

    await mirrorStoreFromPersistence();

    const target = selectCurrentTargetSite(Store.getState());
    expect(target?.id).toBe(siteId);
    expect(target?.targetLat).toBeNull();
    expect(target?.targetLon).toBeNull();
    expect(SiteRegistryService.isGeofenceReady(target)).toBe(false);
  });

  test("destino con coordenadas: el objetivo sí está listo para geocerca (control)", async () => {
    await acceptDisclosure(true);
    const siteId = await seedSite();

    const { result, geofenceReady } = await startDay({ siteId });
    expect(result.ok).toBe(true);
    expect(geofenceReady).toBe(true);

    await mirrorStoreFromPersistence();

    const target = selectCurrentTargetSite(Store.getState());
    expect(target?.id).toBe(siteId);
    expect(SiteRegistryService.isGeofenceReady(target)).toBe(true);
  });
});
