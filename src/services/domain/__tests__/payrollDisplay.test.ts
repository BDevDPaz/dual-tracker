/** Presentación: centavos enteros, horas que cuadran con las filas, notas y alias. */
import { makeStatement } from "../../../../test/fixtures/payroll.fixture";
import { setLanguage } from "../../../i18n";
import {
  allocateDisplayHundredths,
  displayStatement,
  formatCents,
  formatHundredths,
  formatPayRateLine,
  formatSiteName,
  minutesToHundredths,
  moneyCents,
  noteToHtml,
  splitEmojiSequences,
  trimDisplayNote,
} from "../payrollDisplay";

describe("payrollDisplay — centavos y horas", () => {
  afterEach(() => setLanguage("es"));

  test("la línea de pago es solo de lectura: horas × tarifa, sin cambiar los centavos", () => {
    expect(formatPayRateLine(480, 25)).toBe("8 h × $25.00/h");
    expect(formatPayRateLine(90, 25)).toBe("1,5 h × $25.00/h");
    expect(moneyCents(480, 25)).toBe(20000);
    setLanguage("en");
    expect(formatPayRateLine(90, 25, "en")).toBe("1.5 h × $25.00/h");
  });

  test("la semana real de Byron a $35 cuadra en centavos: 6+34+17+250 min = $179.08", () => {
    const rate = 35;
    const minutes = [0, 6, 34, 17, 0, 250];
    const cents = minutes.map((m) => moneyCents(m, rate));
    expect(cents).toEqual([0, 350, 1983, 992, 0, 14583]);
    expect(cents.reduce((a, b) => a + b, 0)).toBe(17908);
    expect(formatCents(17908)).toBe("$179.08");
  });

  test("los centavos son enteros para tarifas y minutos arbitrarios", () => {
    for (let minutes = 0; minutes <= 24 * 60; minutes += 11) {
      for (let rateCents = 1; rateCents <= 8000; rateCents += 173) {
        const c = moneyCents(minutes, rateCents / 100);
        expect(Number.isInteger(c)).toBe(true);
        expect(c).toBe(Math.round((minutes * rateCents) / 60));
      }
    }
  });

  test("tres filas de 1 min muestran centésimas que suman el total (0.05), no 0.02+0.02+0.02", () => {
    const parts = allocateDisplayHundredths([1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(minutesToHundredths(3));
    expect(minutesToHundredths(3)).toBe(5);
    expect(parts.map(formatHundredths).join("+")).not.toBe("0.02+0.02+0.02");
  });

  test("propiedad: la suma de centésimas de las filas es el redondeo del total", () => {
    for (let n = 0; n < 80; n++) {
      const rows = Array.from({ length: (n % 6) + 1 }, (_, i) => (n * 19 + i * 7) % 400);
      const parts = allocateDisplayHundredths(rows);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(minutesToHundredths(rows.reduce((a, b) => a + b, 0)));
    }
  });

  test("5 min se muestran como 0.08 h, el redondeo de esos minutos, no 0.09", () => {
    const line = (sessionId: number) => ({
      sessionId,
      dateString: "2026-10-19",
      siteId: 1,
      kind: "REGULAR" as const,
      minutes: 5,
      rate: 20,
      amount: moneyCents(5, 20) / 100,
      warnings: [] as string[],
    });
    const st = makeStatement({ regularHours: 0, sessionIds: [4, 5] });
    const d = displayStatement({ ...st, lines: [line(4), line(5)], sessionIds: [4, 5] });
    expect(d.rows.map((r) => [r.sessionId, r.workedMinutes, r.hours])).toEqual([
      [4, 5, "0.08"],
      [5, 5, "0.08"],
    ]);
    expect(minutesToHundredths(5)).toBe(8);
    expect(d.worked).toBe("0.17");
  });

  test("encabezado y filas del statement suman las mismas centésimas y los mismos centavos", () => {
    const st = makeStatement({ regularHours: 8, overtimeHours: 1 });
    const d = displayStatement(st);
    const header = [d.regular, d.overtime, d.transit].reduce((a, h) => a + Number(h), 0);
    const rows = d.rows.reduce((a, r) => a + r.hundredths, 0) / 100;
    expect(header).toBeCloseTo(rows, 2);
    expect(d.rows.reduce((a, r) => a + r.amountCents, 0)).toBe(d.grossCents);
    expect(d.regular).toBe("8.00");
    expect(d.overtime).toBe("1.00");
    expect(d.gross).toBe("$190.00");
  });
});

describe("payrollDisplay — nota y destino", () => {
  test("recorta la nota para mostrar y no toca el texto interno", () => {
    const stored = "  Desde El Salvador 🇸🇻   ";
    expect(trimDisplayNote(stored)).toBe("Desde El Salvador 🇸🇻");
    expect(stored).toBe("  Desde El Salvador 🇸🇻   ");
  });

  test("la bandera es un solo grafema, pegada a la palabra, sin espacios finales", () => {
    const parts = splitEmojiSequences("Desde El Salvador 🇸🇻");
    expect(parts.map((p) => p.emoji)).toEqual([false, true]);
    expect(parts[1].text).toBe("🇸🇻");
    const html = noteToHtml("Desde El Salvador\n🇸🇻   ", (s) => s);
    expect(html).toContain('<span class="grapheme">🇸🇻</span>');
    expect(html.endsWith("</span>")).toBe(true);
    expect(html).toContain("\u2060 \u2060");
    expect(html).not.toMatch(/\s"$/);
    expect(html).not.toContain("\n");
  });

  test("alias vacío usa la dirección; si son iguales, una sola vez; si difieren, las dos", () => {
    expect(formatSiteName({ alias: "", address: "604 W Huntington Dr" }).primary).toBe("604 W Huntington Dr");
    expect(formatSiteName({ alias: "604 W Huntington Dr", address: "604 W Huntington Dr" }).address).toBeNull();
    expect(formatSiteName({ alias: "Apt.", address: "18144 Burbank Blvd" })).toEqual({
      primary: "Apt.",
      address: "18144 Burbank Blvd",
    });
    expect(formatSiteName(null).primary).toBe("");
  });
});
