/** i18n — paridad ES/EN (EN es obligatorio completo) y claves nuevas de primitivas. */
import { en, es, setLanguage, t } from "..";
import { languageFromLocaleTag, resolveInitialLanguage } from "../locale";
import { MICROCOPY, MICROCOPY_REJECTIONS } from "../microcopy";
import { DISCLOSURE_VERSION, getDisclosureContent, getRetentionContent } from "../legal";

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

describe("microcopy y legal", () => {
  test("cada aviso tiene EN y los {param} coinciden con ES", () => {
    const missing: string[] = [];
    const badParams: string[] = [];
    for (const [code, entry] of Object.entries(MICROCOPY)) {
      if (!entry.en) {
        missing.push(code);
        continue;
      }
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
      if (ph(entry.es.title + entry.es.message) !== ph(entry.en.title + entry.en.message)) badParams.push(code);
    }
    expect(missing).toEqual([]);
    expect(badParams).toEqual([]);
  });

  test("los motivos de rechazo tienen las mismas claves en ES y EN", () => {
    const esKeys = Object.keys(MICROCOPY_REJECTIONS.es).sort();
    const enKeys = Object.keys(MICROCOPY_REJECTIONS.en).sort();
    expect(enKeys).toEqual(esKeys);
    expect(enKeys.filter((k) => MICROCOPY_REJECTIONS.en[k].trim() === "")).toEqual([]);
  });

  test("el descargo y la retención tienen los mismos bloques en ES y EN", () => {
    const esD = getDisclosureContent("es");
    const enD = getDisclosureContent("en");
    expect(esD.version).toBe(DISCLOSURE_VERSION);
    expect(enD.version).toBe(esD.version);
    expect(enD.blocks.map((b) => b.key)).toEqual(esD.blocks.map((b) => b.key));
    expect(getRetentionContent("en", 90).blocks.map((b) => b.key)).toEqual(getRetentionContent("es", 90).blocks.map((b) => b.key));
  });
});

describe("idioma inicial", () => {
  test.each([
    [undefined, "en-US", "en"],
    [undefined, "en", "en"],
    [undefined, "es-MX", "es"],
    [undefined, "es_ES", "es"],
    [undefined, "fr-FR", "es"],
    [undefined, "", "es"],
    ["en", "es-MX", "en"],
    ["es", "en-US", "es"],
    ["xx", "en-GB", "en"],
  ] as const)("guardado %p + locale %p → %p", (stored, tag, expected) => {
    expect(resolveInitialLanguage(stored, tag)).toBe(expected);
    expect(languageFromLocaleTag(tag)).toBe(tag.toLowerCase().startsWith("en") ? "en" : "es");
  });
});
