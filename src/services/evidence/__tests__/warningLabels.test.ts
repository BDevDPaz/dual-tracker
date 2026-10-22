/** Avisos del statement con etiqueta legible (es/en) en pantalla y PDF; el código sellado no cambia. */
import { tWarning } from "../../../i18n";
import { EvidencePackService } from "../EvidencePackService";
import { renderEmployerDossier } from "../reportTemplates";
import { PersistenceService } from "../../persistence/PersistenceService";
import { DEFAULT_COMPANY_POLICY, DEFAULT_PROFILE } from "../../persistence/SettingsService";
import { HOUR, MONDAY_8AM } from "../../../../test/fixtures/session.fixture";
import { makeEnter } from "../../../../test/fixtures/spatial.fixture";
import { mustDispatch, seedWorld } from "../../../../test/helpers";
import { time } from "../../../../test/time";
import { getWeekEnd, getWeekStart } from "../../../utils/dateUtils";

describe("tWarning", () => {
  test("códigos con #id → etiqueta + jornada, en es y en", () => {
    expect(tWarning("RATE_FALLBACK_CURRENT#7", "es")).toBe("Jornada sin tarifa guardada: se usó la tarifa actual (jornada #7)");
    expect(tWarning("RATE_FALLBACK_CURRENT#7", "en")).toBe("Shift without a stored rate: the current rate was used (shift #7)");
    expect(tWarning("HOURLY_RATE_ZERO#3", "es")).toMatch(/Tarifa por hora en 0.*jornada #3/);
    expect(tWarning("HOURLY_RATE_ZERO#3", "en")).toMatch(/Hourly rate is 0.*shift #3/);
    expect(tWarning("OPEN_SESSION_EXCLUDED", "en")).toBe("Open shifts were excluded");
    expect(tWarning("LUNCH_DURATION_UNKNOWN#2", "es")).toBe("Duración del almuerzo desconocida (jornada #2)");
  });

  test("todos los códigos que emite el motor tienen etiqueta en ambos idiomas", () => {
    for (const c of ["RATE_FALLBACK_CURRENT", "HOURLY_RATE_ZERO", "LEDGER_CHAIN_SEGMENTED", "LUNCH_DURATION_UNKNOWN", "NO_WORK_MINUTES", "OPEN_SESSION_EXCLUDED", "QUARANTINED_SESSION_EXCLUDED", "TRANSIT_CLIPPED"]) {
      expect(tWarning(c, "es")).not.toBe(c);
      expect(tWarning(c, "en")).not.toBe(c);
    }
  });

  test("código desconocido o raro → se devuelve tal cual", () => {
    expect(tWarning("SOMETHING_NEW#1", "es")).toBe("SOMETHING_NEW#1");
    expect(tWarning("<b>x</b>", "en")).toBe("<b>x</b>");
  });
});

describe("PDF — avisos traducidos y escapados", () => {
  test("dossier premium y clásico muestran la etiqueta, escapan HTML y no alteran el statement sellado", async () => {
    await PersistenceService.init();
    const { siteA } = await seedWorld();
    time.set(MONDAY_8AM);
    const s = await mustDispatch({ type: "START_DAY", siteId: siteA });
    await mustDispatch({ type: "ARRIVAL_CONFIRMED", fact: makeEnter({ sessionId: s.id, siteId: siteA, timestampMs: time.now() }) }, "GEOFENCE");
    time.travel(8 * HOUR);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL", lunchDeductedMinutes: 0 });
    time.set(MONDAY_8AM + 7 * 24 * HOUR);
    const r = await EvidencePackService.seal({ periodStart: getWeekStart(MONDAY_8AM), periodEnd: getWeekEnd(MONDAY_8AM) });
    if (!r.ok) throw new Error(String(r.code));

    const codes = ["RATE_FALLBACK_CURRENT#7", "HOURLY_RATE_ZERO#7", "<img src=x>"];
    const statement = { ...r.data.statement, warnings: codes };
    const base = { statement, evidence: r.data.evidence, manifest: r.data.manifest, sessions: [], sites: [], company: DEFAULT_COMPANY_POLICY };

    const premiumEs = renderEmployerDossier({ ...base, profile: { ...DEFAULT_PROFILE, language: "es" } });
    expect(premiumEs).toContain("Jornada sin tarifa guardada: se usó la tarifa actual (jornada #7)");
    expect(premiumEs).not.toContain("RATE_FALLBACK_CURRENT#7");
    expect(premiumEs).toContain("&lt;img src=x&gt;");
    expect(premiumEs).not.toContain("<img src=x>");

    const premiumEn = renderEmployerDossier({ ...base, profile: DEFAULT_PROFILE, manifest: { ...r.data.manifest, documentLocale: "en" } });
    expect(premiumEn).toContain("Hourly rate is 0: this shift&#39;s gross is 0 (shift #7)");

    const legacy = renderEmployerDossier({ ...base, profile: DEFAULT_PROFILE, manifest: { ...r.data.manifest, documentVersion: 1 } });
    expect(legacy).toContain("Tarifa por hora en 0: el bruto de esta jornada es 0 (jornada #7)");
    expect(legacy).toContain("&lt;img src=x&gt;");

    // El código interno sellado no cambia.
    expect(statement.warnings).toEqual(codes);
  });
});
