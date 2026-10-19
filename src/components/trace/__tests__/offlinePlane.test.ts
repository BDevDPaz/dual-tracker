/** El plano y la pantalla de rastro no salen a la red ni descifran por su cuenta. */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../../..");

describe("plano sin red", () => {
  test("no hay fetch, teselas ni FieldCrypto en el dibujo", () => {
    const files = ["src/components/trace/TracePlane.tsx", "app/session/[id]/trace.tsx", "src/utils/localPlane.ts"];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
      expect(src).not.toMatch(/fetch\s*\(/);
      expect(src).not.toContain("maps.googleapis");
      expect(src).not.toContain("FieldCryptoService");
      expect(src).not.toMatch(/\bgoogle\b/i);
    }
  });
});
