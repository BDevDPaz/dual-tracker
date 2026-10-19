/**
 * Una sesión de práctica no mueve la cadena del ledger, los hashes de los
 * expedientes, las jornadas ni el registro de geocerca.
 */
import * as Location from "expo-location";
import * as FileSystem from "expo-file-system";
import { HOUR } from "../../../../test/fixtures/session.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../test/helpers";
import { time } from "../../../../test/time";
import { getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { Store } from "../../../core/store";
import { routeIntent } from "../intentRouter";
import { EvidencePackService } from "../../evidence/EvidencePackService";
import { IntegrityLedgerService } from "../../domain/IntegrityLedgerService";
import { SessionEngineService } from "../../domain/SessionEngineService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { KV_KEYS } from "../../persistence/schema";
import { GeofenceRuntimeService } from "../../runtime/GeofenceRuntimeService";
import { dispatchPractice, enterPractice, exitPractice, getPracticeSnapshot } from "../../../support/practice";
import { diagnosticIsSafe } from "../../../support/diagnostic";

function chain(rows: { id: number; prevHash: string; hash: string; intent: string }[]): string {
  return rows.map((e) => `${e.id}|${e.prevHash}|${e.hash}|${e.intent}`).join("\n");
}

describe("aislamiento del modo práctica", () => {
  test("el recorrido y el diagnóstico no cambian ledger, packs, sesiones ni geocerca", async () => {
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(8 * HOUR);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 0 });
    const periodStart = getWeekStart(time.now());
    const periodEnd = getWeekEnd(time.now());
    const sealed = await EvidencePackService.seal({ periodStart, periodEnd });
    if (!sealed.ok || !sealed.data) throw new Error("sello");

    const ledgerBefore = chain(await PersistenceService.listLedger());
    const packsBefore = (await PersistenceService.listPacks()).map((p) => `${p.id}|${p.manifest.packHash}|${p.manifest.contentHash}`).join("\n");
    const sessionsBefore = (await PersistenceService.listSessions({ includeDeleted: true }))
      .map((s) => `${s.id}|${s.domainStatus}|${s.bookkeeping.updatedAtMs}|${s.integrityClass}`)
      .join("\n");
    const diagBefore = JSON.stringify(await PersistenceService.getKv(KV_KEYS.GEOFENCE_DIAG));
    const geoBefore = JSON.stringify([...(Location as unknown as { __state: { geofences: Map<string, unknown> } }).__state.geofences.entries()]);
    const storeBefore = JSON.stringify(Store.getState().sessions);

    const dispatch = jest.spyOn(SessionEngineService, "dispatch");
    const append = jest.spyOn(IntegrityLedgerService, "append");
    const seal = jest.spyOn(EvidencePackService, "seal");
    const monitor = jest.spyOn(GeofenceRuntimeService, "startMonitoring");

    await enterPractice();
    const steps = [
      { type: "START_MANUAL" } as const,
      { type: "CONFIRM_ARRIVAL" } as const,
      { type: "START_LUNCH" } as const,
      { type: "RESUME" } as const,
      { type: "START_TRANSFER" } as const,
      { type: "SIMULATE_ENTER" } as const,
      { type: "DETECT_EXIT" } as const,
      { type: "CLOSE_MANUAL" } as const,
      { type: "EDIT_NOTE", note: "práctica" } as const,
      { type: "SEAL" } as const,
      { type: "FORGOT_CLOCK", note: "olvidé fichar" } as const,
    ];
    for (const step of steps) {
      const res = await dispatchPractice(step);
      expect(res.ok).toBe(true);
    }
    expect(getPracticeSnapshot().session?.provisional).toBe(false);
    expect(getPracticeSnapshot().session?.forgot).toBe(true);

    const exported = await routeIntent({ type: "EXPORT_SUPPORT_DIAGNOSTIC" });
    expect(exported.ok).toBe(true);
    if (!exported.ok || !exported.data) return;
    const uri = (exported.data as { uri: string }).uri;
    expect(uri).toContain("/cache/");
    expect(uri).not.toContain("/packs/");
    const files = (FileSystem as unknown as { __files: Map<string, string> }).__files;
    const body = files.get(uri);
    expect(body).toBeTruthy();
    const parsed = JSON.parse(body ?? "{}") as unknown;
    expect(diagnosticIsSafe(parsed)).toBe(true);
    expect(body).not.toContain("enc:v1");

    await exitPractice();
    expect(getPracticeSnapshot().active).toBe(false);

    expect(dispatch).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
    expect(seal).not.toHaveBeenCalled();
    expect(monitor).not.toHaveBeenCalled();
    expect(chain(await PersistenceService.listLedger())).toBe(ledgerBefore);
    expect((await PersistenceService.listPacks()).map((p) => `${p.id}|${p.manifest.packHash}|${p.manifest.contentHash}`).join("\n")).toBe(packsBefore);
    expect(
      (await PersistenceService.listSessions({ includeDeleted: true }))
        .map((s) => `${s.id}|${s.domainStatus}|${s.bookkeeping.updatedAtMs}|${s.integrityClass}`)
        .join("\n"),
    ).toBe(sessionsBefore);
    expect(JSON.stringify(await PersistenceService.getKv(KV_KEYS.GEOFENCE_DIAG))).toBe(diagBefore);
    expect(JSON.stringify([...(Location as unknown as { __state: { geofences: Map<string, unknown> } }).__state.geofences.entries()])).toBe(geoBefore);
    expect(JSON.stringify(Store.getState().sessions)).toBe(storeBefore);
    expect(sealed.data.manifest.packHash).toBe((await EvidencePackService.get(sealed.data.id))?.manifest.packHash);
  });
});
