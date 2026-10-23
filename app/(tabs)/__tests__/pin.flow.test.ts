/** Ajustes: guardar el PIN local. Lo emite app/(tabs)/settings.tsx. */
import { routeIntent } from "../../../src/services/application/intentRouter";
import { PersistenceService } from "../../../src/services/persistence/PersistenceService";
import { SecurityService } from "../../../src/services/runtime/SecurityService";
import { seedWorld } from "../../../test/helpers";

describe("app/(tabs) PIN", () => {
  test("SETUP_ADMIN_PIN deja un PIN local que abre la zona", async () => {
    const set = await routeIntent({ type: "SETUP_ADMIN_PIN", pin: "654321" });
    expect(set.ok).toBe(true);
    expect(await SecurityService.pinOrigin()).toBe("LOCAL");
    expect((await SecurityService.unlock("654321")).ok).toBe(true);
    expect(SecurityService.isUnlocked()).toBe(true);
  });

  test("guardar umbrales sin desbloquear se rechaza", async () => {
    const { siteA } = await seedWorld();
    const site = (await PersistenceService.getSite(siteA))!;
    const locked = await routeIntent({
      type: "UPSERT_SITE",
      site: { id: siteA, alias: site.alias, address: site.address, clientName: site.clientName, radiusM: (site.radiusM ?? 100) + 25, arrivalDwellMs: 60_000 },
    });
    expect(locked).toMatchObject({ ok: false, code: "ADMIN_LOCKED" });
    expect((await PersistenceService.getSite(siteA))?.radiusM).toBe(site.radiusM);
    const created = await routeIntent({
      type: "UPSERT_SITE",
      site: { alias: "Nuevo", address: "9 Main St", clientName: null, radiusM: 120 },
    });
    expect(created.ok).toBe(true);
  });
});
