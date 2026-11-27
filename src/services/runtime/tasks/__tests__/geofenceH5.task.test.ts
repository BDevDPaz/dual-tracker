/**
 * Hito 5 (Solicitud 6) — auditoría de geocerca, lado tarea/runtime.
 *  - G-1: un ENTER del SO de un destino secundario ARCHIVADO no abre traslado
 *    (beginTransfer comprueba `active`). Control: el mismo ENTER con el
 *    destino activo sí lo abre.
 *  - G-6: si handleGeofenceEvent falla, el fallo queda en el diagnóstico de
 *    geocerca (TASK_ERROR con la región), no solo en el log.
 */
import { Platform } from "react-native";
import { GEOFENCE_TASK_NAME } from "../../../../constants/geolocation";
import { SiteRegistryService } from "../../../domain/SiteRegistryService";
import { PersistenceService } from "../../../persistence/PersistenceService";
import { GeofenceRuntimeService, geofenceIdentifier } from "../../GeofenceRuntimeService";
import { readGeofenceDiag } from "../../geofenceDiag";
import { TaskOrchestratorService } from "../../TaskOrchestratorService";
import { HOUR } from "../../../../../test/fixtures/session.fixture";
import { SITE_LAT, SITE_LON } from "../../../../../test/fixtures/spatial.fixture";
import { acceptDisclosure, mustDispatch, seedSite, seedWorld, startAndArrive } from "../../../../../test/helpers";
import { LocationMock, TaskManagerMock } from "../../../../../test/runtimeHarness";
import { time } from "../../../../../test/time";

const ENTER = 1;
const EXIT = 2;
/** Metros → grados de latitud (≈111 195 m por grado). */
const metersNorth = (m: number) => SITE_LAT + m / 111_195;
const region = (sessionId: number, siteId: number) => ({ identifier: geofenceIdentifier(sessionId, siteId), latitude: SITE_LAT, longitude: SITE_LON, radius: 100 });

describe("Hito 5 — geofence.task", () => {
  beforeAll(() => TaskOrchestratorService.defineTasks(async () => {}));
  afterEach(() => jest.restoreAllMocks());

  test("G-1 control: ENTER fiable de un secundario ACTIVO abre el traslado", async () => {
    const { siteA, siteB } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(2 * HOUR);
    LocationMock.__setPosition(SITE_LAT + 0.05, SITE_LON, 10);
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: ENTER, region: region(s.id, siteB) });
    const after = (await PersistenceService.getSession(s.id))!;
    expect(after.siteId).toBe(siteB);
    expect(after.transitSegments.filter((t) => !t.cancelled)).toHaveLength(1);
  });

  test("G-1: ENTER fiable de un secundario ARCHIVADO no abre traslado y queda SITE_ARCHIVED en el diagnóstico", async () => {
    const { siteA, siteB } = await seedWorld();
    const s = await startAndArrive(siteA);
    const archived = await SiteRegistryService.archive(siteB);
    expect(archived.ok).toBe(true);
    time.travel(2 * HOUR);
    LocationMock.__setPosition(SITE_LAT + 0.05, SITE_LON, 10);
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: ENTER, region: region(s.id, siteB) });
    const after = (await PersistenceService.getSession(s.id))!;
    expect(after.domainStatus).toBe("ACTIVA");
    expect(after.siteId).toBe(siteA);
    expect(after.transitSegments).toHaveLength(0);
    const last = (await readGeofenceDiag()).at(-1);
    expect(last).toMatchObject({ kind: "ENTER", siteId: siteB, accepted: false, reason: "SITE_ARCHIVED", region: geofenceIdentifier(s.id, siteB) });
  });

  test("G-6: un fallo en handleGeofenceEvent queda en el diagnóstico (TASK_ERROR con la región)", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    jest.spyOn(GeofenceRuntimeService, "handleGeofenceEvent").mockRejectedValueOnce(new Error("fallo forzado"));
    await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: ENTER, region: region(s.id, siteA) });
    const last = (await readGeofenceDiag()).at(-1);
    expect(last).toMatchObject({ kind: "ERROR", region: geofenceIdentifier(s.id, siteA), accepted: false, reason: "TASK_ERROR" });
  });

  describe("G-7: radio del SO frente a radio lógico (sitio de 50 m, Android)", () => {
    const originalOs = Platform.OS;
    beforeEach(() => Object.defineProperty(Platform, "OS", { value: "android", configurable: true }));
    afterEach(() => Object.defineProperty(Platform, "OS", { value: originalOs, configurable: true }));

    test("el SO registra 100 m; un ENTER a 75 m no confirma llegada y un EXIT a 75 m no arma salida", async () => {
      await acceptDisclosure(true);
      const site = await seedSite({ radiusM: 50 });
      const s = await mustDispatch({ type: "START_DAY", siteId: site });
      expect(await GeofenceRuntimeService.startMonitoring(s.id, site)).toBe(true);
      const regions = LocationMock.__state.geofences.get(GEOFENCE_TASK_NAME) as { identifier: string; radius: number }[];
      expect(regions.find((r) => r.identifier === geofenceIdentifier(s.id, site))?.radius).toBe(100);

      // Dentro del círculo del SO (100 m), fuera del lógico (50 m): no es llegada.
      time.travel(10 * 60_000);
      LocationMock.__setPosition(metersNorth(75), SITE_LON, 10);
      await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: ENTER, region: region(s.id, site) });
      expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ESPERANDO");
      expect((await readGeofenceDiag()).at(-1)).toMatchObject({ kind: "ENTER", accepted: false, reason: "OUTSIDE_RADIUS" });

      // Llegada real dentro del radio lógico.
      time.travel(60_000);
      LocationMock.__setPosition(metersNorth(10), SITE_LON, 10);
      await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: ENTER, region: region(s.id, site) });
      expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ACTIVA");

      // EXIT a 75 m: fuera del radio lógico pero dentro de la histéresis
      // (dist − precisión < radio + 50): no arma la salida pendiente.
      time.travel(2 * HOUR);
      LocationMock.__setPosition(metersNorth(75), SITE_LON, 10);
      await TaskManagerMock.__run(GEOFENCE_TASK_NAME, { eventType: EXIT, region: region(s.id, site) });
      expect(await GeofenceRuntimeService.getPendingExit()).toBeNull();
      expect((await readGeofenceDiag()).at(-1)).toMatchObject({ kind: "EXIT", accepted: false, reason: "HYSTERESIS" });
      expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ACTIVA");
    });
  });
});
