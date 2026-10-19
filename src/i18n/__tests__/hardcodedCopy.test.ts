/**
 * Falla si hay copy de interfaz en duro en JSX (texto entre etiquetas o
 * props visibles). El copy sale de t(). Excluye tests, la marca y +html.
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../..");
const ROOTS = ["app", "src/components", "src/context"];
const SKIP_FILES = new Set([path.normalize("app/+html.tsx")]);
const ALLOW_EXACT = new Set(["Dual", "Tracker", "Dual Tracker", "Dual Tracker D11", "PIN"]);

const USER_PROPS = ["accessibilityLabel", "placeholder", "title", "label", "message", "description", "hint"];

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "__tests__" || ent.name === "node_modules") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if ((ent.name.endsWith(".tsx") || ent.name.endsWith(".ts")) && !ent.name.includes(".test.")) out.push(p);
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

function lineOf(src: string, index: number): number {
  return src.slice(0, index).split("\n").length;
}

/**
 * Frase visible. El `>` de un genérico o un `return (` también casa con el
 * patrón de texto JSX: se descarta todo lo que no sea palabras.
 */
function isCopy(text: string): boolean {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed || ALLOW_EXACT.has(trimmed)) return false;
  if (trimmed.length > 120) return false;
  if (trimmed.includes(".")) return false;
  if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ¿¡0-9][A-Za-zÁÉÍÓÚÜÑáéíóúüñ¿¡0-9 .,:'’·–—!?-]*$/.test(trimmed)) return false;
  return /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}/.test(trimmed);
}

/** Literales de UI: JSX, props, Alert.alert, opciones del navegador y etiquetas de accesibilidad. */
function scanSource(src: string): string[] {
  const hits: string[] = [];
  const take = (re: RegExp, label: string) => {
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      if (label === "texto" && src[m.index - 1] === "=") continue;
      if (isCopy(m[1])) hits.push(`${label} «${m[1].trim()}»`);
    }
  };
  take(/>([^<>{}\n]+)</g, "texto");
  take(new RegExp(String.raw`\b(?:${USER_PROPS.join("|")})\s*=\s*["']([^"']+)["']`, "g"), "prop");
  take(/accessibilityLabel=\{\s*["']([^"']+)["']\s*\}/g, "a11y");
  take(/accessibilityLabel=\{\s*`([^`$]+)`\s*\}/g, "a11y");
  take(/Alert\.alert\(\s*["']([^"']+)["']/g, "alert");
  take(/Alert\.alert\(\s*["'][^"']+["']\s*,\s*["']([^"']+)["']/g, "alert");
  take(/\b(?:title|headerTitle|tabBarLabel)\s*:\s*["']([^"']+)["']/g, "nav");
  return hits;
}

describe("copy de UI", () => {
  test("el detector marca una frase y deja pasar código y la marca", () => {
    expect(isCopy("No certificable")).toBe(true);
    expect(isCopy("Close")).toBe(true);
    expect(isCopy("return (")).toBe(false);
    expect(isCopy("useState<Draft>(initial)")).toBe(false);
    expect(isCopy("Dual")).toBe(false);
    expect(isCopy("onboarding.permFgTitle")).toBe(false);
  });

  test("marca Alert, opciones del navegador y etiquetas de accesibilidad", () => {
    const sample = `
      Alert.alert("Cerrar jornada", "¿Seguro?");
      <Stack.Screen options={{ title: "Hoy", headerTitle: "Historial" }} />
      <Pressable accessibilityLabel={"Cerrar"} accessibilityLabel={\`Actualizar\`} />
      <Pressable accessibilityLabel={\`\${min} \${t("common.minutes")}\`} title={t("tabs.today")} />
    `;
    const hits = scanSource(sample);
    expect(hits).toEqual([
      "a11y «Cerrar»",
      "a11y «Actualizar»",
      "alert «Cerrar jornada»",
      "alert «¿Seguro?»",
      "nav «Hoy»",
      "nav «Historial»",
    ]);
  });

  test("no hay literales en español o inglés dentro del JSX, Alert, navegador ni accesibilidad", () => {
    const hits: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(path.join(ROOT, root))) {
        const rel = path.relative(ROOT, file);
        if (SKIP_FILES.has(path.normalize(rel))) continue;
        const raw = fs.readFileSync(file, "utf8");
        const src = stripComments(raw);
        for (const hit of scanSource(src)) {
          const index = raw.indexOf(hit.slice(hit.indexOf("«") + 1, hit.lastIndexOf("»")));
          hits.push(`${rel}:${index >= 0 ? lineOf(raw, index) : "?"} ${hit}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
