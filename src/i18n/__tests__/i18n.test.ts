/** i18n — paridad ES/EN (EN es obligatorio completo) y claves nuevas de primitivas. */
import { en, es, setLanguage, t } from "..";

type Tree = { [k: string]: string | Tree };
function leaves(node: Tree, prefix = ""): string[] {
  return Object.entries(node).flatMap(([k, v]) => (typeof v === "string" ? [`${prefix}${k}`] : leaves(v, `${prefix}${k}.`)));
}
function placeholders(s: string): string[] {
  return (s.match(/\{\w+\}/g) ?? []).sort();
}
function get(node: Tree, path: string): string {
  return path.split(".").reduce<Tree | string>((n, k) => (n as Tree)[k], node) as string;
}

afterEach(() => setLanguage("es"));

describe("i18n", () => {
  const esKeys = leaves(es as unknown as Tree);
  const enKeys = leaves(en as unknown as Tree);

  test("EN tiene exactamente las mismas claves que ES", () => {
    expect(enKeys.filter((k) => !esKeys.includes(k))).toEqual([]);
    expect(esKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
  });

  test("los parámetros {x} coinciden en cada clave", () => {
    const bad = esKeys.filter((k) => placeholders(get(es as unknown as Tree, k)).join() !== placeholders(get(en as unknown as Tree, k)).join());
    expect(bad).toEqual([]);
  });

  test("ninguna cadena EN está vacía", () => {
    expect(enKeys.filter((k) => get(en as unknown as Tree, k).trim() === "")).toEqual([]);
  });

  test.each(["actions", "health", "reports", "modals", "a11y"])("sección obligatoria %s traducida", (section) => {
    const s = section === "actions" ? "cta" : section;
    expect(Object.keys((en as unknown as Tree)[s] as Tree).length).toBeGreaterThan(0);
  });

  test("claves de primitivas (a11y/common/report) resuelven en ES y EN", () => {
    const keys = ["a11y.closeModal", "a11y.back", "a11y.toast", "common.ok", "common.reconnecting", "common.loading", "report.previewTitle", "report.statement", "report.name", "report.period", "app.brandSubtitle", "integrity.a11yLabel", "session.activityTitle", "session.activityEmpty"];
    for (const k of keys) {
      expect(t(k, {}, "es")).not.toBe(k);
      expect(t(k, {}, "en")).not.toBe(k);
    }
    expect(t("a11y.toast", { message: "x" }, "es")).toBe("Aviso: x");
    expect(t("integrity.a11yLabel", { label: "Validated" }, "en")).toBe("Integrity: Validated");
  });
});
