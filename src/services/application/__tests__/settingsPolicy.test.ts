/**
 * Ajustes en el router (wireframes de Ajustes §10):
 *  - TP-1: cambiar política, multiplicador o banderas deja PAYROLL_POLICY_CHANGED
 *    encadenado; guardar sin cambiarlos no deja nada.
 *  - TP-5: alta con radio propio y mover un punto ya fijado piden PIN; el alta
 *    con el radio de la empresa y el primer «Estoy aquí» no.
 *  - TP-7: con jornada abierta, cambiar el radio por defecto o el modo de
 *    rastro rehace la geocerca / el servicio en primer plano.
 */
import { Platform } from "react-native";
import { GEOFENCE_TASK_NAME } from "../../../constants/geolocation";
import { StoreActions } from "../../../core/store";
import { IntegrityLedgerService } from "../../domain/IntegrityLedgerService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { SettingsService } from "../../persistence/SettingsService";
import { ForegroundWorkService } from "../../runtime/ForegroundWorkService";
import { GeofenceRuntimeService } from "../../runtime/GeofenceRuntimeService";
import { SecurityService } from "../../runtime/SecurityService";
import { osGeofenceRadius } from "../../runtime/geofencePolicy";
import { routeIntent } from "../intentRouter";
import { LocationMock } from "../../../../test/runtimeHarness";
import { MIN } from "../../../../test/fixtures/session.fixture";
import { SITE_LAT, SITE_LON } from "../../../../test/fixtures/spatial.fixture";
import { seedSite, seedWorld, startAndArrive } from "../../../../test/helpers";
import { time } from "../../../../test/time";

async function loadStore(): Promise<void> {
  StoreActions.settingsReplaced(await SettingsService.load());
}

async function unlock(): Promise<void> {
  expect((await SecurityService.setPin("123456")).ok).toBe(true);
  expect((await SecurityService.unlock("123456")).ok).toBe(true);
}

async function policyEntries() {
  return (await PersistenceService.listLedger({ intent: "PAYROLL_POLICY_CHANGED" })).map((e) => ({ ...e, data: JSON.parse(e.payloadJson).data }));
}

describe("Ajustes · política de nómina (TP-1)", () => {
  test("multiplicador y política dejan un asiento con antes y después; la cadena sigue válida", async () => {
    await seedWorld();
    await loadStore();
    await unlock();
    const before = await SettingsService.load();
    const r = await routeIntent({ type: "SAVE_SETTINGS", patch: { company: { overtimeMultiplier: 2, overtimePolicyId: before.company.overtimePolicyId } } });
    expect(r.ok).toBe(true);
    const [entry] = await policyEntries();
    expect(entry).toMatchObject({ actor: "USER", reason: "ADMIN_POLICY_CHANGE", sessionId: null });
    expect(entry.data).toMatchObject({ changes: { overtimeMultiplier: { from: before.company.overtimeMultiplier, to: 2 } } });
    // Solo lo que cambió: la política era la misma.
    expect(Object.keys(entry.data.changes)).toEqual(["overtimeMultiplier"]);
    expect((await IntegrityLedgerService.verify()).valid).toBe(true);
  });

  test("banderas legales: from/to con los valores efectivos", async () => {
    await seedWorld();
    await loadStore();
    await unlock();
    time.travel(MIN);
    expect((await routeIntent({ type: "SAVE_SETTINGS", patch: { company: { payrollLegalFlags: { caSeventhDay: true } } } })).ok).toBe(true);
    const [entry] = await policyEntries();
    expect(entry.data.changes.payrollLegalFlags.from).toMatchObject({ caSeventhDay: false, caDoubleTime: false });
    expect(entry.data.changes.payrollLegalFlags.to).toMatchObject({ caSeventhDay: true, caDoubleTime: false });
  });

  test("guardar otros campos de empresa sin tocar la política no deja asiento", async () => {
    await seedWorld();
    await loadStore();
    await unlock();
    expect((await routeIntent({ type: "SAVE_SETTINGS", patch: { company: { employerName: "Leon's" } } })).ok).toBe(true);
    expect(await policyEntries()).toHaveLength(0);
  });

  test("sin zona admin no hay cambio ni asiento", async () => {
    await seedWorld();
    await loadStore();
    const r = await routeIntent({ type: "SAVE_SETTINGS", patch: { company: { overtimeMultiplier: 3 } } });
    expect(r).toMatchObject({ ok: false, code: "ADMIN_LOCKED" });
    expect(await policyEntries()).toHaveLength(0);
  });
});

describe("Destinos · PIN al crear con radio propio y al mover el punto (TP-5)", () => {
  test("alta con radio propio pide PIN; con el de la empresa o sin radio, no", async () => {
    await seedWorld();
    await loadStore();
    const company = (await SettingsService.load()).company;
    const own = await routeIntent({ type: "UPSERT_SITE", site: { alias: "Propio", address: "9 Main St", clientName: null, radiusM: company.defaultRadiusM + 50 } });
    expect(own).toMatchObject({ ok: false, code: "ADMIN_LOCKED" });
    const dwell = await routeIntent({ type: "UPSERT_SITE", site: { alias: "Espera", address: "9 Main St", clientName: null, arrivalDwellMs: 5 * MIN } });
    expect(dwell).toMatchObject({ ok: false, code: "ADMIN_LOCKED" });
    expect((await routeIntent({ type: "UPSERT_SITE", site: { alias: "Empresa", address: "9 Main St", clientName: null, radiusM: company.defaultRadiusM } })).ok).toBe(true);
    // Alta rápida de Hoy (sin radio).
    expect((await routeIntent({ type: "UPSERT_SITE", site: { alias: "Rápido", address: "10 Main St", clientName: null } })).ok).toBe(true);
    await unlock();
    expect((await routeIntent({ type: "UPSERT_SITE", site: { alias: "Propio", address: "9 Main St", clientName: null, radiusM: company.defaultRadiusM + 50 } })).ok).toBe(true);
  });

  test("el primer «Estoy aquí» no pide PIN; mover el punto guardado, sí", async () => {
    await seedWorld();
    await loadStore();
    const id = await seedSite({ alias: "Obra", address: "Sin ubicar", targetLat: null, targetLon: null });
    const first = await routeIntent({
      type: "LOCATE_SITE",
      siteId: id,
      readings: [
        { lat: SITE_LAT, lon: SITE_LON },
        { lat: SITE_LAT + 0.0001, lon: SITE_LON },
      ],
    });
    expect(first.ok).toBe(true);
    const fixed = (await PersistenceService.getSite(id))!;
    const moveReadings = [
      { lat: SITE_LAT + 0.002, lon: SITE_LON },
      { lat: SITE_LAT + 0.0021, lon: SITE_LON },
    ];
    expect(await routeIntent({ type: "LOCATE_SITE", siteId: id, readings: moveReadings })).toMatchObject({ ok: false, code: "ADMIN_LOCKED" });
    expect((await PersistenceService.getSite(id))?.targetLat).toBe(fixed.targetLat);
    await unlock();
    expect((await routeIntent({ type: "LOCATE_SITE", siteId: id, readings: moveReadings })).ok).toBe(true);
    expect((await PersistenceService.getSite(id))?.targetLat).not.toBe(fixed.targetLat);
  });
});

describe("Ajustes · jornada abierta y vigilancia (TP-7)", () => {
  afterEach(() => jest.restoreAllMocks());

  test("radio por defecto nuevo → la geocerca del destino sin radio propio usa el nuevo", async () => {
    await seedWorld();
    const site = await seedSite({ alias: "Sin radio", radiusM: null });
    await loadStore();
    const s = await startAndArrive(site);
    expect(await GeofenceRuntimeService.startMonitoring(s.id, site)).toBe(true);
    await unlock();
    expect((await routeIntent({ type: "SAVE_SETTINGS", patch: { company: { defaultRadiusM: 350 } } })).ok).toBe(true);
    const regions = LocationMock.__state.geofences.get(GEOFENCE_TASK_NAME) as { radius: number }[];
    expect(regions?.[0]?.radius).toBe(osGeofenceRadius(350, Platform.OS));
  });

  test("modo de rastro nuevo → el servicio en primer plano se rehace con ese modo", async () => {
    const { siteA } = await seedWorld();
    await loadStore();
    const s = await startAndArrive(siteA);
    expect(await GeofenceRuntimeService.startMonitoring(s.id, siteA)).toBe(true);
    await unlock();
    const sync = jest.spyOn(ForegroundWorkService, "sync");
    expect((await routeIntent({ type: "SAVE_SETTINGS", patch: { company: { traceMode: "BREADCRUMB" } } })).ok).toBe(true);
    expect(sync).toHaveBeenCalledWith(expect.any(String), "BREADCRUMB", expect.objectContaining({ relabel: true }));
  });

  test("sin jornada abierta no se toca la vigilancia", async () => {
    await seedWorld();
    await loadStore();
    await unlock();
    const monitor = jest.spyOn(GeofenceRuntimeService, "startMonitoring");
    const sync = jest.spyOn(ForegroundWorkService, "sync");
    expect((await routeIntent({ type: "SAVE_SETTINGS", patch: { company: { defaultRadiusM: 350, traceMode: "BREADCRUMB" } } })).ok).toBe(true);
    expect(monitor).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
  });
});
