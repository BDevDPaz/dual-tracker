/** La capa de soporte no puede alcanzar la base, el ledger, los expedientes ni la geocerca. */
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

describe("frontera de soporte", () => {
  test("src/support no importa servicios, sqlite ni ubicación", () => {
    const forbidden = /from\s+["'][^"']*(?:services\/|expo-sqlite|expo-location|IntegrityLedger|EvidencePack|GeofenceRuntime|SessionEngine)/;
    const offenders = walk(path.join(ROOT, "src/support"))
      .filter((file) => {
        const src = fs.readFileSync(file, "utf8").replace(/import type[\s\S]*?from\s+["'][^"']+["'];?/g, "");
        return forbidden.test(src);
      })
      .map((file) => path.relative(ROOT, file));
    expect(offenders).toEqual([]);
  });

  test("app/ no importa servicios", () => {
    const offenders = walk(path.join(ROOT, "app"))
      .filter((file) => /from\s+["'][^"']*\/services\//.test(fs.readFileSync(file, "utf8")))
      .map((file) => path.relative(ROOT, file));
    expect(offenders).toEqual([]);
  });
});
