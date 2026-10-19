import fs from "fs";
import path from "path";

/** Raíces donde un literal de espaciado, tipo o icono es un error de sistema visual. */
export const UI_LITERAL_ROOTS = ["app", "src/components", "src/context"] as const;

const STYLE_PROPS = [
  "fontSize",
  "lineHeight",
  "padding",
  "paddingHorizontal",
  "paddingVertical",
  "paddingTop",
  "paddingBottom",
  "paddingLeft",
  "paddingRight",
  "margin",
  "marginHorizontal",
  "marginVertical",
  "marginTop",
  "marginBottom",
  "marginLeft",
  "marginRight",
  "gap",
  "rowGap",
  "columnGap",
  "borderRadius",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomLeftRadius",
  "borderBottomRightRadius",
];

const STYLE_RE = new RegExp(`(?:^|[^\\w.])(${STYLE_PROPS.join("|")})\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`, "g");
const ICON_RE = /size=\{\s*(-?\d+(?:\.\d+)?)\s*\}/g;

export interface UiLiteralHit {
  file: string;
  line: number;
  text: string;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " ")).replace(/(^|[^:"'])\/\/.*$/gm, "$1");
}

function walk(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
}

/** 0 es «nada» y se permite. Cualquier otro número en una propiedad de ritmo o en size={} falla. */
export function scanUiLiteralSource(file: string, source: string): UiLiteralHit[] {
  if (file.includes(`${path.sep}__tests__${path.sep}`) || file.includes("/__tests__/") || /\.test\.tsx?$/.test(file)) return [];
  const hits: UiLiteralHit[] = [];
  stripComments(source)
    .split("\n")
    .forEach((line, index) => {
      for (const re of [STYLE_RE, ICON_RE]) {
        re.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = re.exec(line))) {
          const raw = match[match.length - 1];
          if (raw === "0" || raw === "-0") continue;
          hits.push({ file, line: index + 1, text: line.trim() });
          break;
        }
      }
    });
  return hits;
}

export function findUiLiterals(root: string): UiLiteralHit[] {
  const files: string[] = [];
  for (const rel of UI_LITERAL_ROOTS) walk(path.join(root, rel), files);
  const hits: UiLiteralHit[] = [];
  for (const file of files) {
    const rel = path.relative(root, file);
    hits.push(...scanUiLiteralSource(rel, fs.readFileSync(file, "utf8")));
  }
  return hits;
}
