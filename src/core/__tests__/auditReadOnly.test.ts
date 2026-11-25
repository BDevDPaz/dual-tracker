/** PR3: la Auditoría de jornadas solo lee. Ni emite intenciones ni escribe en la base. */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../..");
const FILES = [
  "app/session/[id]/audit.tsx",
  "src/components/blocks/SessionAuditView.tsx",
  "src/components/blocks/PeriodAuditSection.tsx",
  "src/core/selectors/sessionAudit.ts",
  "src/services/application/useCases/sessionAudit.ts",
];

describe("auditoría de jornadas · solo lectura", () => {
  test.each(FILES)("%s no emite ni escribe", (file) => {
    const src = fs.readFileSync(path.join(ROOT, file), "utf8");
    expect(src).not.toMatch(/\bemit\(/);
    expect(src).not.toMatch(/\.append\(|runAsync|execAsync|insert[A-Z]\w*\(|update[A-Z]\w*\(|setKv\(/);
  });

  test("el selector es puro: no importa servicios ni la base", () => {
    const src = fs.readFileSync(path.join(ROOT, "src/core/selectors/sessionAudit.ts"), "utf8");
    expect(src).not.toMatch(/from "\.\.\/\.\.\/services/);
    expect(src).not.toMatch(/Date\.now\(\)/);
  });
});
