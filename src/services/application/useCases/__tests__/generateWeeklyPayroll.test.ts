/** T2 — caso de uso generateWeeklyPayroll: preview no sella; seal devuelve pack tipado. */
import { getWeekEnd, getWeekStart } from "../../../../utils/dateUtils";
import { PersistenceService } from "../../../persistence/PersistenceService";
import { generateWeeklyPayroll, previewPayroll } from "../generateWeeklyPayroll";
import { HOUR } from "../../../../../test/fixtures/session.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../../test/helpers";
import { time } from "../../../../../test/time";

describe("useCase generateWeeklyPayroll", () => {
  const period = () => [getWeekStart(time.now()), getWeekEnd(time.now())] as const;

  test("preview calcula el statement sin sellar ni escribir packs", async () => {
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(9 * HOUR);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    const st = await previewPayroll(...period());
    expect(st).toMatchObject({ regularHours: 8, overtimeHours: 1, packHash: null, policyId: "CA_DAILY8_WEEKLY40_v1" });
    expect(await PersistenceService.listPacks()).toHaveLength(0);
  });

  test("seal devuelve EvidencePack con manifiesto, PDFs y encola offline", async () => {
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(8 * HOUR);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    const r = await generateWeeklyPayroll(...period());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data!.manifest.packHash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.data!.statement.packHash).toBe(r.data!.manifest.packHash);
    expect(r.data!.manifest.files.map((f) => f.role)).toEqual(["EMPLOYEE_RECEIPT", "EMPLOYER_DOSSIER", "MANIFEST_JSON"]);
    expect(await PersistenceService.listOffline("PENDING")).toHaveLength(1);
  });

  test("periodo vacío, solo abierto o con conflicto: rechazos tipados", async () => {
    const { siteA } = await seedWorld();
    expect(await generateWeeklyPayroll(...period())).toMatchObject({ ok: false, code: "EMPTY_PERIOD" });
    await startAndArrive(siteA);
    expect(await generateWeeklyPayroll(...period())).toMatchObject({ ok: false, code: "PERIOD_ONLY_OPEN" });
    time.travel(13 * HOUR);
    await mustDispatch({ type: "AUTO_CLOSE", cause: "MAX_OPEN_12H", confirmedOutside: false }, "WATCHDOG");
    expect(await generateWeeklyPayroll(...period())).toMatchObject({ ok: false, code: "PERIOD_HAS_CONFLICT" });
    const unc = await generateWeeklyPayroll(...period(), true);
    expect(unc.ok && unc.data?.manifest.certified).toBe(false);
    expect(await generateWeeklyPayroll(NaN, NaN)).toMatchObject({ ok: false, code: "INVALID_PERIOD" });
  });
});
