/**
 * T2 — intentRouter: contrato app/ ↔ dominio. Cada intención del pliego
 * verifica el dispatch correcto y que no hay escritura lateral.
 */
import * as fs from "fs";
import * as path from "path";
import { Platform } from "react-native";
import type { SessionIntent } from "../../../core/contracts";
import { Store } from "../../../core/store";
import { SessionEngineService } from "../../domain/SessionEngineService";
import { EvidencePackService } from "../../evidence/EvidencePackService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { GEOFENCE_TASK_NAME } from "../../../constants/geolocation";
import { GeofenceRuntimeService } from "../../runtime/GeofenceRuntimeService";
import { osGeofenceRadius } from "../../runtime/geofencePolicy";
import * as Notifications from "expo-notifications";
import { __state as notificationState } from "../../../../test/mocks/expo-notifications";
import { NOTIFICATION_ACTIONS } from "../../../constants/notifications";
import { NotificationService } from "../../runtime/NotificationService";
import { routeIntent } from "../intentRouter";
import { SecurityService } from "../../runtime/SecurityService";
import { LocationMock } from "../../../../test/runtimeHarness";
import { HOUR, MIN } from "../../../../test/fixtures/session.fixture";
import { makeExit } from "../../../../test/fixtures/spatial.fixture";
import { acceptDisclosure, mustDispatch, seedWorld, startAndArrive } from "../../../../test/helpers";
import { time } from "../../../../test/time";
import { getWeekEnd, getWeekStart } from "../../../utils/dateUtils";

/** Espía de dispatch que deja pasar la llamada real. */
function spyDispatch() {
  const spy = jest.spyOn(SessionEngineService, "dispatch");
  const intents = () => spy.mock.calls.map((c) => c[0] as SessionIntent);
  return { spy, intents };
}
/** Escrituras de sesión fuera del motor = escritura lateral. */
function spyWrites() {
  return { upd: jest.spyOn(PersistenceService, "updateSession"), ins: jest.spyOn(PersistenceService, "insertSession") };
}

describe("intentRouter", () => {
  test("[obligatorio #13] START_DAY sin disclosureAccepted no despacha al engine", async () => {
    const { siteA } = await seedWorld();
    await acceptDisclosure(false);
    const { spy } = spyDispatch();
    const w = spyWrites();
    const r = await routeIntent({ type: "START_DAY", siteId: siteA });
    expect(r).toMatchObject({ ok: false, code: "DISCLOSURE_NOT_ACCEPTED" });
    expect(spy).not.toHaveBeenCalled();
    expect(w.ins).not.toHaveBeenCalled();
    expect(await PersistenceService.getOpenSession()).toBeNull();
    expect(Store.getState().feedback.pending.at(-1)?.code).toBe("INTENT_REJECTED");
  });

  test("START_DAY con aviso aceptado despacha START_DAY(UI) una sola vez", async () => {
    const { siteA } = await seedWorld();
    const { spy, intents } = spyDispatch();
    const r = await routeIntent({ type: "START_DAY", siteId: siteA, note: "hola" });
    expect(r.ok).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(intents()[0]).toEqual({ type: "START_DAY", siteId: siteA, clientId: null, note: "hola" });
    expect(spy.mock.calls[0][1]).toBe("UI");
  });

  test("CONFIRM_EXIT → CLOSE_DAY(EXIT_CONFIRMED) usando la primera salida", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(8 * HOUR);
    const exitAt = time.now();
    await mustDispatch({ type: "EXIT_DETECTED", fact: makeExit({ sessionId: s.id, timestampMs: exitAt }) }, "GEOFENCE");
    time.travel(20 * MIN);
    const { intents } = spyDispatch();
    const w = spyWrites();
    const r = await routeIntent({ type: "CONFIRM_EXIT", lunchDeductedMinutes: 30 });
    expect(r.ok).toBe(true);
    expect(intents()).toEqual([{ type: "CLOSE_DAY", mode: "EXIT_CONFIRMED", lunchDeductedMinutes: 30 }]);
    expect(w.upd).toHaveBeenCalledTimes(1); // solo la escritura del motor
    expect((await PersistenceService.getSession(s.id))?.endAtMs).toBe(exitAt);
  });

  test("PATCH_SESSION → MANUAL_PATCH con la misma nota y tiempos", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(8 * HOUR);
    const closed = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    const { intents } = spyDispatch();
    const w = spyWrites();
    const view = { type: "PATCH_SESSION" as const, sessionId: s.id, declaredStartAtMs: closed.actualStartAtMs! - 10 * MIN, endAtMs: closed.endAtMs, note: "ajuste" };
    expect((await routeIntent(view)).ok).toBe(true);
    expect(intents()).toEqual([{ type: "MANUAL_PATCH", sessionId: s.id, declaredStartAtMs: view.declaredStartAtMs, endAtMs: view.endAtMs, note: "ajuste" }]);
    expect(w.upd).toHaveBeenCalledTimes(1);
  });

  test("PATCH_SESSION rechazado emite feedback y no escribe", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(8 * HOUR);
    const closed = await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    const w = spyWrites();
    const r = await routeIntent({ type: "PATCH_SESSION", sessionId: s.id, declaredStartAtMs: closed.declaredStartAtMs - MIN, endAtMs: closed.endAtMs, note: "" });
    expect(r).toMatchObject({ ok: false, code: "NOTE_REQUIRED" });
    expect(w.upd).not.toHaveBeenCalled();
  });

  test("RESOLVE_* se enrutan 1:1 al motor", async () => {
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(13 * HOUR);
    const auto = await mustDispatch({ type: "AUTO_CLOSE", cause: "MAX_OPEN_12H", confirmedOutside: false }, "WATCHDOG");
    expect(auto.integrityClass).toBe("CONFLICT");
    const { intents } = spyDispatch();
    await routeIntent({ type: "RESOLVE_SPLIT", sessionId: auto.id, splitAtMs: time.now(), note: "x" });
    await routeIntent({ type: "RESOLVE_KEEP_GPS", sessionId: auto.id });
    await routeIntent({ type: "RESOLVE_MANUAL", sessionId: auto.id, note: "revisado" });
    expect(intents().map((i) => i.type)).toEqual(["RESOLVE_SPLIT", "RESOLVE_KEEP_GPS", "RESOLVE_MANUAL"]);
    expect(intents()[1]).toEqual({ type: "RESOLVE_KEEP_GPS", sessionId: auto.id, note: null });
  });

  test("SEAL_PACK va a generateWeeklyPayroll → EvidencePack.seal, sin tocar el motor", async () => {
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(8 * HOUR);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    const { spy } = spyDispatch();
    const seal = jest.spyOn(EvidencePackService, "seal");
    const w = spyWrites();
    const periodStart = getWeekStart(time.now());
    const r = await routeIntent({ type: "SEAL_PACK", periodStart, periodEnd: getWeekEnd(time.now()) });
    expect(r.ok).toBe(true);
    expect(seal).toHaveBeenCalledWith({ periodStart, periodEnd: getWeekEnd(time.now()), allowUncertified: false, reissue: false });
    expect(spy).not.toHaveBeenCalled();
    expect(w.upd).not.toHaveBeenCalled();
    expect(Store.getState().feedback.pending.at(-1)?.code).toBe("PACK_SEALED");
    // reissue viaja intacto hasta el servicio (reemisión explícita, crea pack nuevo).
    const again = await routeIntent({ type: "SEAL_PACK", periodStart, periodEnd: getWeekEnd(time.now()), reissue: true });
    expect(again.ok).toBe(true);
    expect(seal).toHaveBeenLastCalledWith(expect.objectContaining({ reissue: true }));
    expect(Store.getState().feedback.pending.at(-1)?.code).toBe("PACK_SEALED");
  });

  test("EXPORT_RANGE_PDF comparte el rango en pantalla y no llama a seal", async () => {
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(8 * HOUR);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    const seal = jest.spyOn(EvidencePackService, "seal");
    const periodStart = getWeekStart(time.now());
    const periodEnd = getWeekEnd(time.now());
    const r = await routeIntent({ type: "EXPORT_RANGE_PDF", periodStart, periodEnd });
    expect(r.ok).toBe(true);
    expect(seal).not.toHaveBeenCalled();
    expect(await PersistenceService.listPacks()).toHaveLength(0);
    expect(Store.getState().feedback.pending.at(-1)?.code).toBe("RANGE_PDF_SHARED");
  });

  test("intenciones de jornada simples se traducen al SessionIntent correcto", async () => {
    const { siteA, siteB } = await seedWorld();
    await routeIntent({ type: "START_DAY", siteId: siteA });
    const { intents } = spyDispatch();
    await routeIntent({ type: "CONFIRM_ARRIVAL" });
    await routeIntent({ type: "START_LUNCH" });
    await routeIntent({ type: "RESUME" });
    await routeIntent({ type: "START_TRANSFER", toSiteId: siteB });
    await routeIntent({ type: "CANCEL_TRANSFER" });
    await routeIntent({ type: "CLOSE_DAY", lunchDeductedMinutes: 15 });
    expect(intents()).toEqual([
      { type: "ARRIVAL_CONFIRMED", manualArrival: false },
      { type: "LUNCH_START", kind: "LUNCH" },
      { type: "RESUME" },
      { type: "TRANSFER_START", toSiteId: siteB },
      { type: "TRANSFER_CANCEL" },
      { type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 15 },
    ]);
  });

  test("editar el radio del sitio vigilado reinicia la geocerca con el radio nuevo", async () => {
    const { siteA } = await seedWorld();
    const s = await mustDispatch({ type: "START_DAY", siteId: siteA });
    expect(await GeofenceRuntimeService.startMonitoring(s.id, siteA)).toBe(true);
    const site = (await PersistenceService.getSite(siteA))!;
    expect(await routeIntent({ type: "SETUP_ADMIN_PIN", pin: "654321" })).toMatchObject({ ok: true });
    expect((await SecurityService.unlock("654321")).ok).toBe(true);
    const r = await routeIntent({ type: "UPSERT_SITE", site: { id: siteA, alias: site.alias, address: site.address, clientName: site.clientName, radiusM: 80 } });
    expect(r.ok).toBe(true);
    const regions = LocationMock.__state.geofences.get(GEOFENCE_TASK_NAME) as { radius: number }[];
    // En Android el SO no baja de 100 m; la decisión de fichar sigue usando el radio lógico (80).
    expect(regions?.[0]?.radius).toBe(osGeofenceRadius(80, Platform.OS));
  });

  test("E12: un botón de una jornada ya cerrada no escribe y avisa que no aplica", async () => {
    const { siteA } = await seedWorld();
    const open = await startAndArrive(siteA);
    time.travel(HOUR);
    await mustDispatch({ type: "EXIT_DETECTED", fact: makeExit({ sessionId: open.id, timestampMs: time.now() }) });
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    await NotificationService.init({
      intent: async (intent) => {
        await SessionEngineService.dispatch(intent, "NOTIFICATION");
      },
      ui: () => {},
    });
    const before = (await PersistenceService.listLedger({ sessionId: open.id })).length;
    (Notifications as unknown as { __emit: (r: unknown) => void }).__emit({
      actionIdentifier: NOTIFICATION_ACTIONS.END_SESSION,
      notification: { request: { identifier: `dualtracker-exit-${open.id}`, content: { data: { sessionId: open.id, kind: "EXIT_DECISION" } } } },
    });
    await new Promise((r) => setTimeout(r, 50));
    expect((await PersistenceService.listLedger({ sessionId: open.id })).length).toBe(before);
    const stale = (notificationState.scheduled as { content: { title?: string } }[]).some((n) => n.content.title === "Esta acción ya no aplica");
    expect(stale).toBe(true);
    expect((notificationState.dismissed as string[]).includes(`dualtracker-exit-${open.id}`)).toBe(true);
  });

  test("OPEN_TRACE es navegación pura: no despacha", async () => {
    await PersistenceService.init();
    const { spy } = spyDispatch();
    expect(await routeIntent({ type: "OPEN_TRACE", sessionId: 1 })).toEqual({ ok: true });
    expect(spy).not.toHaveBeenCalled();
  });

  test("la UI no puede saltarse el router: app/ no importa motor, máquina ni persistencia", () => {
    // Los __tests__ de app/ observan el resultado; la regla es de las pantallas.
    const root = path.resolve(__dirname, "../../../../app");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== "__tests__") walk(p);
        }
        else if (/\.tsx?$/.test(e.name)) {
          const src = fs.readFileSync(p, "utf8");
          if (/from\s+["'][^"']*(SessionEngineService|sessionMachine|PersistenceService|ConcurrencyGuardService|IntegrityLedgerService)["']/.test(src)) offenders.push(path.relative(root, p));
          if (/SessionEngineService\.dispatch|PersistenceService\.(update|insert)Session/.test(src)) offenders.push(path.relative(root, p));
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
