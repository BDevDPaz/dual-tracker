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
    else if (ent.name.endsWith(".tsx") && !ent.name.includes(".test.")) out.push(p);
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
  if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ¿¡0-9][A-Za-zÁÉÍÓÚÜÑáéíóúüñ¿¡0-9 .,:'’·–—!?-]*$/.test(trimmed)) return false;
  return /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}/.test(trimmed);
}

describe("copy de UI", () => {
  test("el detector marca una frase y deja pasar código y la marca", () => {
    expect(isCopy("No certificable")).toBe(true);
    expect(isCopy("Close")).toBe(true);
    expect(isCopy("return (")).toBe(false);
    expect(isCopy("useState<Draft>(initial)")).toBe(false);
    expect(isCopy("Dual")).toBe(false);
  });

  test("no hay literales en español o inglés dentro del JSX", () => {
    const hits: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(path.join(ROOT, root))) {
        const rel = path.relative(ROOT, file);
        if (SKIP_FILES.has(path.normalize(rel))) continue;
        const src = stripComments(fs.readFileSync(file, "utf8"));
        const textRe = />([^<>{}\n]+)</g;
        let m: RegExpExecArray | null;
        while ((m = textRe.exec(src))) {
          // `=> Promise<Site>` no es texto JSX: el `>` viene de la flecha.
          if (src[m.index - 1] === "=") continue;
          if (isCopy(m[1])) hits.push(`${rel}:${lineOf(src, m.index)} texto «${m[1].trim()}»`);
        }
        const propRe = new RegExp(String.raw`\b(?:${USER_PROPS.join("|")})\s*=\s*["']([^"']+)["']`, "g");
        while ((m = propRe.exec(src))) {
          if (isCopy(m[1])) hits.push(`${rel}:${lineOf(src, m.index)} prop «${m[1].trim()}»`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
