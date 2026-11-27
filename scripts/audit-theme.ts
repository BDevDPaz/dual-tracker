/**
 * Auditoría de color estático (Hito 3). Los colores de la app salen de
 * useTheme().colors; este script falla si encuentra un color fijo de tema.
 *
 *   npm run audit:theme      (npx -y tsx scripts/audit-theme.ts)
 *
 * Alcance: app/, src/components, src/context y src/core, archivos .ts y .tsx,
 * sin __tests__ ni *.test.*. src/constants (theme.ts, la fuente de la paleta)
 * queda fuera del alcance.
 *
 * Fuera de alcance por diseño: src/services/evidence (pdfIntegrity,
 * reportTemplates, reportPremium y qrSvg). Son documentos (PDF y QR) con
 * colores fijos, no tema de la app.
 *
 * Detecta: TOKENS.colors, PALETTE, PALETTE_DARK, PALETTE_LIGHT, COLORS.dark,
 * COLORS.light, hex #[0-9A-Fa-f]{3,8} y los literales "white" / "black".
 *
 * Excepciones (con su motivo):
 * - src/context/ThemeContext.tsx: es el mecanismo (COLORS[scheme]).
 * - app/+html.tsx, la línea del <style> del body: cáscara web (#050505), fuera
 *   del sistema de React Native.
 * - Contenido de <Mask>…</Mask> (ArrivalMark.tsx): una máscara SVG funciona por
 *   luminancia (#fff deja ver, #000 recorta); no es color de tema.
 *
 * Sale con 1 y lista archivo:línea si encuentra algo; con 0 si no.
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const SCOPE = ["app", "src/components", "src/context", "src/core"];

/** Archivo completo exceptuado → motivo. */
const FILE_EXCEPTIONS: Record<string, string> = {
  "src/context/ThemeContext.tsx": "mecanismo del tema (COLORS[scheme])",
};

/** Línea exceptuada por su contenido (no por número, para que no caduque). */
const LINE_EXCEPTIONS: { file: string; contains: string; reason: string }[] = [
  { file: "app/+html.tsx", contains: "body{background-color:#050505;}", reason: "cáscara web fuera del sistema RN" },
];

const RULES: { name: string; re: RegExp }[] = [
  { name: "TOKENS.colors", re: /\bTOKENS\.colors\b/ },
  { name: "PALETTE", re: /\bPALETTE(?:_DARK|_LIGHT)?\b/ },
  { name: "COLORS.dark / COLORS.light", re: /\bCOLORS\.(?:dark|light)\b/ },
  { name: "hex", re: /#[0-9A-Fa-f]{3,8}\b/ },
  { name: '"white" / "black"', re: /["'`](?:white|black)["'`]/ },
];

function isTest(rel: string): boolean {
  return rel.split("/").includes("__tests__") || /\.test\.tsx?$/.test(rel);
}

function walk(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      walk(abs, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(abs);
    }
  }
}

const files: string[] = [];
for (const dir of SCOPE) walk(path.join(ROOT, dir), files);

const findings: string[] = [];
let scanned = 0;
for (const abs of files.sort()) {
  const rel = path.relative(ROOT, abs).split(path.sep).join("/");
  if (isTest(rel) || FILE_EXCEPTIONS[rel]) continue;
  scanned += 1;
  const lines = fs.readFileSync(abs, "utf8").split("\n");
  let inMask = false;
  lines.forEach((line, i) => {
    if (/<Mask\b/.test(line)) inMask = true;
    const masked = inMask;
    if (/<\/Mask>/.test(line)) inMask = false;
    if (masked) return;
    if (LINE_EXCEPTIONS.some((x) => x.file === rel && line.includes(x.contains))) return;
    for (const rule of RULES) {
      if (rule.re.test(line)) findings.push(`${rel}:${i + 1}  [${rule.name}]  ${line.trim()}`);
    }
  });
}

console.log(`audit-theme: ${scanned} archivos revisados en ${SCOPE.join(", ")}.`);
if (findings.length > 0) {
  console.log(`audit-theme: ${findings.length} hallazgo(s) de color estático:`);
  for (const f of findings) console.log(`  ${f}`);
  process.exit(1);
}
console.log("audit-theme: 0 hallazgos.");
