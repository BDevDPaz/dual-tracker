/**
 * Hito 5 (Solicitud 6) — G-1. ARCHIVE_SITE no archiva el sitio de la jornada
 * abierta ni el destino de su traslado en curso (SITE_IN_OPEN_SESSION).
 * Otro destino sí se archiva, y sin jornada abierta también.
 */
import { PersistenceService } from "../../persistence/PersistenceService";
import { routeIntent } from "../intentRouter";
import { HOUR } from "../../../../test/fixtures/session.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../test/helpers";
import { time } from "../../../../test/time";

describe("ARCHIVE_SITE con jornada abierta (G-1)", () => {
  test("archivar el sitio vigilado con la jornada ACTIVA → rechazado y el sitio sigue activo", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    const r = await routeIntent({ type: "ARCHIVE_SITE", siteId: siteA });
    expect(r).toMatchObject({ ok: false, code: "SITE_IN_OPEN_SESSION" });
    expect((await PersistenceService.getSite(siteA))?.active).toBe(true);
    expect((await PersistenceService.getSession(s.id))?.domainStatus).toBe("ACTIVA");
  });

  test("archivar el destino de un traslado en curso → rechazado", async () => {
    const { siteA, siteB } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(HOUR);
    await mustDispatch({ type: "TRANSFER_START", toSiteId: siteB });
    expect(await routeIntent({ type: "ARCHIVE_SITE", siteId: siteB })).toMatchObject({ ok: false, code: "SITE_IN_OPEN_SESSION" });
    // El origen tampoco: cancelar el traslado vuelve a vigilarlo.
    expect(await routeIntent({ type: "ARCHIVE_SITE", siteId: siteA })).toMatchObject({ ok: false, code: "SITE_IN_OPEN_SESSION" });
    expect((await PersistenceService.getSite(siteB))?.active).toBe(true);
  });

  test("otro destino sí se archiva con la jornada abierta, y el vigilado sin jornada abierta", async () => {
    const { siteA, siteB } = await seedWorld();
    await startAndArrive(siteA);
    expect((await routeIntent({ type: "ARCHIVE_SITE", siteId: siteB })).ok).toBe(true);
    expect((await PersistenceService.getSite(siteB))?.active).toBe(false);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    expect((await routeIntent({ type: "ARCHIVE_SITE", siteId: siteA })).ok).toBe(true);
    expect((await PersistenceService.getSite(siteA))?.active).toBe(false);
  });
});
