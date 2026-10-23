/** Reportes: sellar y verificar. Lo emite app/(tabs)/reports.tsx. */
import { canonicalJson } from "../../../src/utils/canonicalJson";
import { routeIntent } from "../../../src/services/application/intentRouter";
import { EvidencePackService, computeContentHash, statementForHash } from "../../../src/services/evidence/EvidencePackService";
import { sha256Hex } from "../../../src/services/evidence/HashChain";
import { ReportService } from "../../../src/services/evidence/ReportService";
import { PersistenceService } from "../../../src/services/persistence/PersistenceService";
import { DEFAULT_PROFILE, SettingsService } from "../../../src/services/persistence/SettingsService";
import { HOUR } from "../../../test/fixtures/session.fixture";
import { getWeekEnd, getWeekStart } from "../../../src/utils/dateUtils";
import { mustDispatch, seedWorld, startAndArrive } from "../../../test/helpers";
import { time } from "../../../test/time";

describe("app/(tabs) sellar", () => {
  test("SEAL_PACK deja un expediente que verify acepta", async () => {
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(8 * HOUR);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    const periodStart = getWeekStart(time.now());
    const periodEnd = getWeekEnd(time.now());
    const sealed = await routeIntent({ type: "SEAL_PACK", periodStart, periodEnd });
    expect(sealed.ok).toBe(true);
    if (!sealed.ok || !sealed.data || typeof sealed.data !== "object" || !("id" in sealed.data)) throw new Error("sin pack");
    const pack = await EvidencePackService.get(String(sealed.data.id));
    expect(pack).not.toBeNull();
    expect((await EvidencePackService.verify(pack!)).valid).toBe(true);

    expect(pack!.statement.lines.some((l) => l.kind === "MEAL_PREMIUM")).toBe(true);
    expect(pack!.manifest.packHash).toMatch(/^[0-9a-f]{64}$/);
    const input = {
      statement: pack!.statement,
      evidence: pack!.evidence,
      manifest: pack!.manifest,
      sessions: await PersistenceService.listSessions(),
      sites: [],
      profile: DEFAULT_PROFILE,
      company: (await SettingsService.load()).company,
    };
    expect(ReportService.renderHtml("EMPLOYEE_RECEIPT", input)).toContain("Prima de comida");
    expect(ReportService.renderHtml("EMPLOYER_DOSSIER", input)).toContain("Prima de comida");

    const tampered = {
      ...pack!,
      statement: { ...pack!.statement, lines: pack!.statement.lines.filter((l) => l.kind !== "MEAL_PREMIUM") },
    };
    const broken = await EvidencePackService.verify(tampered);
    expect(broken.valid).toBe(false);
    expect(broken.failures).toEqual(expect.arrayContaining(["STATEMENT_HASH", "CONTENT_HASH"]));
    const forged = {
      ...tampered,
      manifest: {
        ...tampered.manifest,
        contentHash: await computeContentHash(tampered.statement, tampered.evidence),
        statementHash: await sha256Hex(canonicalJson({ ...statementForHash(tampered.statement), packHash: null })),
      },
    };
    expect((await EvidencePackService.verify(forged)).failures).toContain("PACK_HASH");
  });
});
