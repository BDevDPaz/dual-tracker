/** T2 — caso de uso startDay: orquestación, no monta Hoy. */
import { SessionEngineService } from "../../../domain/SessionEngineService";
import { PersistenceService } from "../../../persistence/PersistenceService";
import { startDay } from "../startDay";
import { acceptDisclosure, seedSite, seedWorld } from "../../../../../test/helpers";

describe("useCase startDay", () => {
  test("sitio con coordenadas → ESPERANDO y geofenceReady", async () => {
    const { siteA } = await seedWorld();
    const { result, geofenceReady } = await startDay({ siteId: siteA });
    expect(result.ok).toBe(true);
    expect(result.ok && result.data?.session.domainStatus).toBe("ESPERANDO");
    expect(geofenceReady).toBe(true);
  });

  test("sitio sin coordenadas → jornada abierta pero geocerca no armable", async () => {
    await acceptDisclosure(true);
    const siteId = await seedSite({ targetLat: null, targetLon: null });
    const { result, geofenceReady } = await startDay({ siteId });
    expect(result.ok).toBe(true);
    expect(geofenceReady).toBe(false);
  });

  test("sin aviso aceptado: rechazo tipado y el motor no recibe la intención", async () => {
    const { siteA } = await seedWorld();
    await acceptDisclosure(false);
    const spy = jest.spyOn(SessionEngineService, "dispatch");
    const { result } = await startDay({ siteId: siteA });
    expect(result).toEqual({ ok: false, code: "DISCLOSURE_NOT_ACCEPTED" });
    expect(spy).not.toHaveBeenCalled();
    expect(await PersistenceService.countOpenSessions()).toBe(0);
  });
});
