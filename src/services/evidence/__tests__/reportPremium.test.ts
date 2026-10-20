/** Documento v2: QR, firma, anexos, tema e idioma. La plantilla v1 no se toca. */
import jsQR from "jsqr";
import type { Site } from "../../../core/contracts";
import { makeEvidence, makeStatement } from "../../../../test/fixtures/payroll.fixture";
import { COMPANY, HOUR, makeClosedSession, MONDAY_8AM } from "../../../../test/fixtures/session.fixture";
import { SITE_LAT, SITE_LON } from "../../../../test/fixtures/spatial.fixture";
import { setLanguage, t } from "../../../i18n";
import { SEAL_WARNING_TEXT } from "../reportTemplates";
import { ReportService } from "../ReportService";
import { PayrollEngineService } from "../../domain/PayrollEngineService";
import { fromWallClock, getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { DEFAULT_PROFILE } from "../../persistence/SettingsService";

const HASH = "ab".repeat(32);

function base(over: Partial<Parameters<typeof ReportService.renderHtml>[1]> = {}) {
  const st = makeStatement({ regularHours: 8, overtimeHours: 1 });
  return {
    statement: { ...st, packHash: HASH },
    evidence: makeEvidence({ ledgerEntryCount: 4, ledgerChainValid: true }),
    manifest: {
      packId: "W2026-09-21-abcdef12",
      packHash: HASH,
      sealedAtMs: MONDAY_8AM,
      certified: true,
      policyId: st.policyId,
      manifestVersion: 4,
      documentVersion: 2,
      documentTheme: "light" as const,
      documentLocale: "es" as const,
      signature: { algorithm: "Ed25519" as const, keyId: "ed25519:abc123", publicKey: "cA", value: "c2ln" },
    },
    sessions: [makeClosedSession(MONDAY_8AM, 9, { bookkeeping: { manualNote: "llegué tarde" } })],
    sites: [
      {
        id: 1,
        alias: "Obra Norte",
        address: "1 Main St",
        clientName: null,
        notes: null,
        targetLat: SITE_LAT,
        targetLon: SITE_LON,
        radiusM: 100,
        active: true,
        createdAtMs: 0,
        archivedAtMs: null,
      } satisfies Site,
    ],
    profile: { ...DEFAULT_PROFILE, employeeName: "Ana" },
    company: { ...COMPANY, employerName: "Taller Norte", traceRetentionDays: 90 },
    ...over,
  };
}

function raster(svg: string): { data: Uint8ClampedArray; width: number } {
  const path = svg.match(/<path[^>]* d="([^"]*)"/)?.[1] ?? "";
  const cells = [...path.matchAll(/M(\d+),(\d+)h(\d+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]), s: Number(m[3]) }));
  const size = cells.reduce((max, c) => Math.max(max, c.x + c.s, c.y + c.s), 0);
  const data = new Uint8ClampedArray(size * size * 4);
  data.fill(255);
  for (const c of cells) {
    for (let y = c.y; y < c.y + c.s; y++) {
      for (let x = c.x; x < c.x + c.s; x++) {
        const i = (y * size + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
      }
    }
  }
  return { data, width: size };
}

describe("comprobante premium", () => {
  afterEach(() => setLanguage("es"));

  test("el QR codifica el packHash y se puede leer sin red", () => {
    const html = ReportService.renderHtml("EMPLOYEE_RECEIPT", base());
    const start = html.indexOf('<svg class="qr"');
    const svg = html.slice(start, html.indexOf("</svg>", start) + 6);
    expect(svg).toContain(`data-qr-payload="${HASH}"`);
    const image = raster(svg);
    const decoded = jsQR(image.data, image.width, image.width);
    expect(decoded?.data).toBe(HASH);
  });

  test("firma Ed25519, sello sin firma y advertencia de sello", () => {
    const signed = ReportService.renderHtml("EMPLOYEE_RECEIPT", base());
    expect(signed).toContain("Firmado · ed25519:abc123");
    expect(signed).toContain('data-signature="Ed25519"');
    expect(signed).not.toContain("data-seal-indicator");
    expect(signed).toContain("SELLADO");
    expect(signed).toContain("#C5A059");
    expect(signed).toContain("white-space:nowrap");
    expect(signed).toMatch(/<div class="stamp-seal">SELLADO<\/div>/);
    expect(signed).not.toMatch(/SELL<br|SELL<\/div>[\s\S]*ADO/);

    const unsigned = ReportService.renderHtml("EMPLOYEE_RECEIPT", base({ manifest: { ...base().manifest, signature: undefined } }));
    expect(unsigned).toContain("Sin firma del dispositivo");
    expect(unsigned).toContain('data-signature="none"');
    expect(unsigned).toContain('data-seal-indicator="unsigned"');
    expect(unsigned).toContain("Indicador: sello sin firma del dispositivo");

    const warned = ReportService.renderHtml(
      "EMPLOYEE_RECEIPT",
      base({
        manifest: {
          ...base().manifest,
          signature: undefined,
          sealWarnings: [
            { code: "PACK_UNSIGNED", sessionIds: [] },
            { code: "FIELD_CRYPTO_KEY_LOST", sessionIds: [7] },
          ],
        },
      }),
    );
    expect(warned).toContain(SEAL_WARNING_TEXT);
    expect(warned).toContain("Jornadas: #7");
    expect(warned).toContain('data-seal-warning="FIELD_CRYPTO_KEY_LOST"');
    expect(warned).toContain("4 asientos · cadena íntegra");
  });

  test("el tema claro es el de serie y el oscuro es opcional; el idioma es el del documento", () => {
    setLanguage("en");
    const light = ReportService.renderHtml("EMPLOYEE_RECEIPT", base({ manifest: { ...base().manifest, documentTheme: undefined } }));
    expect(light).toContain('data-theme="light"');
    expect(light).toContain("theme-light");
    expect(light).toContain("Comprobante del empleado");
    expect(light).not.toContain("Employee receipt");

    const dark = ReportService.renderHtml(
      "EMPLOYEE_RECEIPT",
      base({ manifest: { ...base().manifest, documentTheme: "dark", documentLocale: "en" } }),
    );
    expect(dark).toContain('data-theme="dark"');
    expect(dark).toContain("theme-dark");
    expect(dark).toContain("#C5A059");
    expect(dark).toContain("Employee receipt");
    expect(dark).toContain("Signed · ed25519:abc123");
    expect(dark).toContain("Gross estimate");
    expect(dark).toContain("Travel");
    expect(dark).not.toContain("Comprobante del empleado");
  });

  test("cinco cifras, bruto resaltado, notas en secundario y filas de $0 fuera del recibo", () => {
    const html = ReportService.renderHtml("EMPLOYEE_RECEIPT", base());
    expect(html).toContain("Horas regulares");
    expect(html).toContain("Horas extra");
    expect(html).toContain("Tránsito");
    expect(html).toContain("Sesiones");
    expect(html).toContain("Estimado bruto");
    expect(html).toContain('class="metric gross"');
    expect(html).toContain("td.fig");
    expect(html).toContain("llegué tarde");
    expect(html).toContain('class="notes"');
    expect(html).toContain("Obra Norte");
    expect(html).not.toContain(String(SITE_LAT));
    expect(html).not.toContain(String(SITE_LON));

    const t0 = fromWallClock(2026, 10, 18, 16, 45);
    const zero = makeClosedSession(t0, 0, { id: 1, endAtMs: t0, integrityClass: "AUTO" });
    const paid = makeClosedSession(t0 + 3 * HOUR, 1, { id: 2 });
    const st = PayrollEngineService.buildStatement({
      periodStart: getWeekStart(t0),
      periodEnd: getWeekEnd(t0),
      sessions: [zero, paid],
      rates: { hourlyRate: 20, overtimeMultiplier: 1.5 },
      company: COMPANY,
      policyId: COMPANY.overtimePolicyId,
      nowMs: t0 + 8 * HOUR,
    });
    setLanguage("en");
    const employee = ReportService.renderHtml("EMPLOYEE_RECEIPT", {
      ...base({ statement: { ...st, packHash: HASH }, sessions: [zero, paid] }),
      manifest: { ...base().manifest, documentLocale: "es" },
    });
    const employer = ReportService.renderHtml("EMPLOYER_DOSSIER", {
      ...base({ statement: { ...st, packHash: HASH }, sessions: [zero, paid] }),
    });
    expect(employee).not.toContain("04:45 PM");
    expect(employee).toContain(t("reports.zeroRowsOmitted", { count: 1 }, "es"));
    expect(employee).not.toContain(t("reports.zeroRowsOmitted", { count: 1 }, "en"));
    expect(employer).toContain("04:45 PM");
    expect(employer).toContain("Duración cero: no suma al pago. Conservada para auditoría.");
  });

  test("los anexos se eligen al exportar y la entrada/salida no lleva coordenadas", () => {
    const evidence = makeEvidence({
      traces: [
        {
          sessionId: 1,
          pointCount: 3,
          firstAtMs: MONDAY_8AM,
          lastAtMs: MONDAY_8AM + HOUR,
          unreliableCount: 0,
          dwellBySite: [],
          enterExit: [
            { type: "ENTER", timestampMs: MONDAY_8AM, reliable: true },
            { type: "EXIT", timestampMs: MONDAY_8AM + HOUR, reliable: false },
          ],
        },
      ],
    });
    const ledger = [
      {
        id: 3,
        sessionId: 1,
        timestampMs: MONDAY_8AM,
        actor: "USER",
        intent: "CLOSE_DAY",
        fromState: "ACTIVA",
        toState: "CERRADA",
        reason: "nota",
        integrityClass: "VALID",
        hash: "c".repeat(64),
        prevHash: "d".repeat(64),
        payloadJson: `{"lat":${SITE_LAT},"lon":${SITE_LON}}`,
      },
    ];
    const plain = ReportService.renderHtml("EMPLOYER_DOSSIER", base({ evidence }));
    expect(plain).not.toContain('data-annex=');
    expect(plain).not.toContain("Bitácora forense");
    expect(plain).not.toContain("Entradas y salidas");

    const onlyLedger = ReportService.renderHtml("EMPLOYER_DOSSIER", base({ evidence, annex: { ledger: true }, ledger }));
    expect(onlyLedger).toContain('data-annex="ledger"');
    expect(onlyLedger).toContain("Bitácora forense");
    expect(onlyLedger).toContain("CLOSE_DAY");
    expect(onlyLedger).toContain("c".repeat(64));
    expect(onlyLedger).not.toContain('data-annex="enter-exit"');
    expect(onlyLedger).not.toContain(String(SITE_LAT));
    expect(onlyLedger).not.toContain("payloadJson");

    const onlyEdge = ReportService.renderHtml("EMPLOYEE_RECEIPT", base({ evidence, annex: { enterExit: true } }));
    expect(onlyEdge).toContain('data-annex="enter-exit"');
    expect(onlyEdge).toContain("Entrada");
    expect(onlyEdge).toContain("Salida");
    expect(onlyEdge).toContain("Este anexo no incluye coordenadas.");
    expect(onlyEdge).not.toContain('data-annex="ledger"');
    expect(onlyEdge).not.toContain(String(SITE_LAT));
    expect(onlyEdge).not.toContain(String(SITE_LON));
  });

  test("la marca de agua PRÁCTICA solo entra si el documento es de práctica", () => {
    expect(ReportService.renderHtml("EMPLOYEE_RECEIPT", base())).not.toContain("PRÁCTICA");
    const es = ReportService.renderHtml("EMPLOYEE_RECEIPT", base({ practice: true }));
    expect(es).toContain('data-practice="1"');
    expect(es).toContain("PRÁCTICA");
    const en = ReportService.renderHtml("EMPLOYEE_RECEIPT", base({ practice: true, manifest: { ...base().manifest, documentLocale: "en" } }));
    expect(en).toContain("PRACTICE");
    expect(en).not.toContain("PRÁCTICA");
  });

  test("política, retención, versiones y pie legal", () => {
    const html = ReportService.renderHtml("EMPLOYER_DOSSIER", base());
    expect(html).toContain(base().statement.policyId);
    expect(html).toContain("Reglas activas");
    expect(html).toContain("90");
    expect(html).toContain("Documento v2 · Manifiesto v4 · Expediente W2026-09-21-abcdef12");
    expect(html).toContain("No es un dictamen legal.");
    expect(html).toContain("Taller Norte");
    expect(html).toContain("Ana");
  });
});
