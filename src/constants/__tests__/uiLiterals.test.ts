/** El escáner y la regla de ESLint comparten el mismo criterio: ritmo y size={} salen de los tokens. */
import { findUiLiterals, scanUiLiteralSource } from "../uiLiterals";

describe("literales de UI", () => {
  test("app, components y context no tienen espaciado, tipo ni size={} sueltos", () => {
    expect(findUiLiterals(process.cwd())).toEqual([]);
  });

  test("un fontSize o un padding distinto de 0 falla; el 0 y los comentarios no", () => {
    const bad = scanUiLiteralSource("app/x.tsx", "const s = { fontSize: 12, padding: 0, margin: 8 }; // fontSize: 99\n");
    expect(bad.map((hit) => hit.text)).toEqual(["const s = { fontSize: 12, padding: 0, margin: 8 };"]);
    expect(scanUiLiteralSource("app/x.tsx", "const s = { gap: 0, borderRadius: 0 };\nsize={0}\n")).toEqual([]);
    expect(scanUiLiteralSource("src/components/ui/__tests__/x.test.tsx", "fontSize: 14")).toEqual([]);
  });
});
