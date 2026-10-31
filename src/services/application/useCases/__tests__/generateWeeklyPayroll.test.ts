/** T2 — caso de uso generateWeeklyPayroll: preview no sella; seal devuelve pack tipado. */
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { getWeekEnd, getWeekStart } from "../../../../utils/dateUtils";
import { EvidencePackService } from "../../../evidence/EvidencePackService";
import { PersistenceService } from "../../../persistence/PersistenceService";
import { exportRangePdf, generateWeeklyPayroll, previewPayroll } from "../generateWeeklyPayroll";
import { HOUR } from "../../../../../test/fixtures/session.fixture";
import { t } from "../../../../i18n";
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

  test("exportRangePdf genera y comparte el PDF del rango en pantalla sin sellar la semana", async () => {
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(8 * HOUR);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    const seal = jest.spyOn(EvidencePackService, "seal");
    const [periodStart, periodEnd] = period();
    const ledgerBefore = (await PersistenceService.listLedger()).length;
    const r = await exportRangePdf(periodStart, periodEnd);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.name).toMatch(/^DualTracker_Comprobante_range-\d{8}-\d{8}_export\.pdf$/);
    expect(r.name).not.toContain("LEDTracker");
    expect(seal).not.toHaveBeenCalled();
    expect(await PersistenceService.listPacks()).toHaveLength(0);
    expect((await PersistenceService.listLedger()).filter((e) => e.intent === "PAYROLL_SEALED")).toHaveLength(0);
    expect((await PersistenceService.listLedger()).length).toBe(ledgerBefore);
    const html = (Print as unknown as { __printed: string[] }).__printed.join("\n");
    expect(html).toContain("Dual Tracker");
    expect(html).toContain('data-range-copy="1"');
    expect(html).toContain(">SIN SELLO<");
    expect(html).not.toContain(">SELLADO<");
    expect(html).not.toContain("estado de nómina sellado");
    expect(html).not.toContain("LEDTracker");
    expect(html).not.toContain(t("reports.weekMath"));
    expect((Sharing as unknown as { __shared: string[] }).__shared).toEqual([r.uri]);
    expect(r.uri).toContain("/exports/");
    expect(r.uri).not.toContain("/packs/");
  });

  test("un rango de varias semanas se imprime sin sello y recuerda que el sello sigue siendo semanal", async () => {
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(8 * HOUR);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    const start = getWeekStart(time.now());
    const end = getWeekEnd(start) + 8 * 24 * HOUR;
    const r = await exportRangePdf(start, end);
    expect(r.ok).toBe(true);
    expect(await PersistenceService.listPacks()).toHaveLength(0);
    const html = (Print as unknown as { __printed: string[] }).__printed.join("\n");
    expect(html).toContain(t("reports.weekMath"));
    expect(html).toContain(">SIN SELLO<");
  });

  test("sin jornadas cerradas no escribe PDF ni pack", async () => {
    const r = await exportRangePdf(...period());
    expect(r).toMatchObject({ ok: false, code: "EMPTY_PERIOD" });
    expect((Print as unknown as { __printed: string[] }).__printed).toHaveLength(0);
    expect(await PersistenceService.listPacks()).toHaveLength(0);
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
