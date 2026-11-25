/**
 * Separación aceptada (plan P1): Reportes = documentos de nómina; Ajustes =
 * copia restaurable. Ninguna pantalla fuera de Ajustes crea o consume un
 * .dtbackup, y Ajustes no genera PDF de nómina desde la copia.
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    if (name === "__tests__" || name === "node_modules") continue;
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join("/");
const BACKUP_ACTIONS = /EXPORT_BACKUP|PREVIEW_BACKUP_IMPORT|IMPORT_BACKUP|BackupSection|dtbackup/;

describe("copia de seguridad solo en Ajustes", () => {
  test("en app/ solo Ajustes usa la copia (Salud solo enlaza; Reportes nunca)", () => {
    const users = walk(path.join(ROOT, "app"))
      .filter((f) => BACKUP_ACTIONS.test(fs.readFileSync(f, "utf8")))
      .map(rel);
    expect(users).toEqual(["app/(tabs)/settings.tsx"]);
  });

  test("el bloque de la copia no emite intenciones de nómina", () => {
    const src = fs.readFileSync(path.join(ROOT, "src/components/blocks/BackupSection.tsx"), "utf8");
    expect(src).not.toMatch(/SEAL_PACK|EXPORT_PACK|SHARE_EMPLOYEE|SHARE_EMPLOYER|EXPORT_RANGE_PDF/);
  });
});
