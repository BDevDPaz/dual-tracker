/**
 * refreshMirror — una escritura que no pasó por el store (tarea headless)
 * vuelve a la UI sin reiniciar la hidratación ni el desbloqueo admin.
 */
import { Store, StoreActions } from "../../../core/store";
import { getDataRevision, getLastDataScopes, __flushForTests } from "../../../core/refresh/dataRevision";
import { makeSession } from "../../../../test/fixtures/session.fixture";
import { makeBreadcrumb } from "../../../../test/fixtures/spatial.fixture";
import { seedWorld, startAndArrive } from "../../../../test/helpers";
import { time } from "../../../../test/time";
import { PersistenceService } from "../../persistence/PersistenceService";
import { SettingsService } from "../../persistence/SettingsService";
import { MIRROR_COALESCE_MS, refreshMirror } from "../refreshMirror";

describe("refreshMirror", () => {
  test("relee sesiones y sitios escritos fuera del store y conserva admin", async () => {
    const { siteA } = await seedWorld();
    const session = await startAndArrive(siteA);
    __flushForTests();
    const settings = await SettingsService.load();
    StoreActions.hydrated({
      sessions: [],
      sites: [],
      packs: [],
      sharedPackIds: [],
      settings,
      osKillDetected: false,
      hasPin: true,
      nowMs: time.now(),
    });
    StoreActions.adminUpdated({ isUnlocked: true, unlockedUntilMs: time.now() + 60_000, status: "granted" });
    StoreActions.uiRequest({ openExitModal: true });
    const settingsRef = Store.getState().settings;
    const revBefore = getDataRevision();

    const first = await refreshMirror({ force: true });
    expect(first).toEqual({ applied: true, skipped: false });
    expect(Store.getState().boot.isRehydrating).toBe(false);
    expect(Store.getState().boot.osKillDetected).toBe(false);
    expect(Store.getState().sessions.byId[String(session.id)]?.domainStatus).toBe("ACTIVA");
    expect(Store.getState().sites.byId[String(siteA)]?.alias).toBe("Sitio A");
    expect(Store.getState().admin.isUnlocked).toBe(true);
    expect(Store.getState().admin.hasPin).toBe(true);
    expect(Store.getState().uiRequests.openExitModal).toBe(true);
    expect(Store.getState().settings).toBe(settingsRef);
    expect(getDataRevision()).toBe(revBefore + 1);
    expect(getLastDataScopes()).toEqual(expect.arrayContaining(["sessions", "trace", "ledger"]));

    const coalesced = await refreshMirror();
    expect(coalesced.skipped).toBe(true);
    expect(getDataRevision()).toBe(revBefore + 1);
  });

  test("no lee mientras el arranque sigue hidratando", async () => {
    expect(Store.getState().boot.isRehydrating).toBe(true);
    await expect(refreshMirror({ force: true })).resolves.toEqual({ applied: false, skipped: true });
  });

  test("un hecho espacial no reescribe la sesión, pero sí invalida el rastro", async () => {
    const { siteA } = await seedWorld();
    const session = await startAndArrive(siteA);
    __flushForTests();
    const settings = await SettingsService.load();
    StoreActions.hydrated({
      sessions: [session],
      sites: [],
      packs: [],
      settings,
      osKillDetected: false,
      hasPin: false,
      nowMs: time.now(),
    });
    const updatedAt = Store.getState().sessions.byId[String(session.id)]?.bookkeeping.updatedAtMs;
    const rev = getDataRevision();
    await PersistenceService.insertSpatialFact(makeBreadcrumb({ sessionId: session.id, siteId: siteA, timestampMs: time.now() }));
    __flushForTests();
    expect(getDataRevision()).toBe(rev + 1);
    expect(getLastDataScopes()).toContain("trace");
    expect(Store.getState().sessions.byId[String(session.id)]?.bookkeeping.updatedAtMs).toBe(updatedAt);
  });

  test("force en vuelo encadena una segunda lectura", async () => {
    const settings = await SettingsService.load();
    StoreActions.hydrated({
      sessions: [],
      sites: [],
      packs: [],
      settings,
      osKillDetected: false,
      hasPin: false,
      nowMs: time.now(),
    });
    const first = refreshMirror({ force: true });
    const second = refreshMirror({ force: true });
    const [a, b] = await Promise.all([first, second]);
    expect(a.skipped).toBe(false);
    expect(b.skipped).toBe(false);
  });

  test("una sesión insertada tras el reflejo aparece con force aunque el hueco no haya pasado", async () => {
    const settings = await SettingsService.load();
    StoreActions.hydrated({
      sessions: [],
      sites: [],
      packs: [],
      settings,
      osKillDetected: false,
      hasPin: false,
      nowMs: time.now(),
    });
    await refreshMirror({ force: true });
    const orphan = makeSession({ id: 1, siteId: 1 });
    const id = await PersistenceService.insertSession(orphan);
    __flushForTests();
    expect(Store.getState().sessions.byId[String(id)]).toBeUndefined();
    const again = await refreshMirror({ force: true });
    expect(again.skipped).toBe(false);
    expect(Store.getState().sessions.byId[String(id)]?.domainStatus).toBe("ACTIVA");
    expect(MIRROR_COALESCE_MS).toBeGreaterThan(0);
  });
});
