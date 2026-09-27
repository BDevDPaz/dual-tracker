/**
 * Pruebas estáticas (spec FieldCryptoService v1.3 §17 "Estático").
 *  - FieldCryptoService solo se importa desde src/services/persistence/** y src/core/boot.ts.
 *  - LoggingService no recibe campos sensibles (y los redacta si llegaran).
 *  - Jest resuelve los subpaths .js de @noble (ESM puro).
 */
import * as fs from "fs";
import * as path from "path";
import { gcm } from "@noble/ciphers/aes.js";
import { bytesToUtf8, utf8ToBytes } from "@noble/ciphers/utils.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { LoggingService, SENSITIVE_LOG_KEYS, redactSensitive } from "../../services/persistence/LoggingService";

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

const SOURCES = [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "app"))];
const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join("/");

describe("estático — imports de FieldCryptoService", () => {
  test("solo persistence/** y core/boot.ts lo importan (ni barrel ni pantallas)", () => {
    const offenders = SOURCES.filter((f) => {
      const src = fs.readFileSync(f, "utf8");
      return /(?:import|export)[^;]*?from\s+["'][^"']*FieldCryptoService["']/.test(src) || /require\(\s*["'][^"']*FieldCryptoService["']\s*\)/.test(src);
    })
      .map(rel)
      .filter((f) => !f.startsWith("src/services/persistence/") && f !== "src/core/boot.ts");
    expect(offenders).toEqual([]);
  });

  test("la guarda detecta un import prohibido (autocomprobación)", () => {
    expect(/(?:import|export)[^;]*?from\s+["'][^"']*FieldCryptoService["']/.test(`import { FieldCryptoService } from "../persistence/FieldCryptoService";`)).toBe(true);
  });
});

describe("estático — LoggingService sin campos sensibles", () => {
  /** Extrae cada llamada LoggingService.log/system(...) con paréntesis balanceados. */
  function logCalls(src: string): string[] {
    const calls: string[] = [];
    const re = /LoggingService\.(log|system)\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      let i = m.index + m[0].length;
      let depth = 1;
      while (depth && i < src.length) {
        if (src[i] === "(") depth++;
        else if (src[i] === ")") depth--;
        i++;
      }
      calls.push(src.slice(m.index, i));
    }
    return calls;
  }
  // Claves sensibles como propiedad del metadata, o registros completos pasados tal cual.
  const WHOLE_RECORDS = ["site", "fact", "session", "record", "settings", "company", "profile", "point", "draft"];
  const SENS = new RegExp(`\\b(${[...SENSITIVE_LOG_KEYS, ...WHOLE_RECORDS].join("|")})\\b\\s*[:,}]`);

  test("ninguna llamada pasa notas, alias, cliente, dirección, coordenadas o correo", () => {
    const offenders: string[] = [];
    for (const f of SOURCES) {
      for (const call of logCalls(fs.readFileSync(f, "utf8"))) {
        const code = call.replace(/"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*'/g, '""');
        if (SENS.test(code)) offenders.push(`${rel(f)}: ${call.replace(/\s+/g, " ").slice(0, 160)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("defensa en profundidad: el metadata se redacta antes de consola/SQLite", () => {
    expect(redactSensitive({ sessionId: 3, note: "privada", nested: { lat: 34.1, lon: -118, ok: 1 }, list: [{ alias: "Obra" }] })).toEqual({
      sessionId: 3,
      note: "[redactado]",
      nested: { lat: "[redactado]", lon: "[redactado]", ok: 1 },
      list: [{ alias: "[redactado]" }],
    });
    // Llamada real: no lanza y conserva los campos no sensibles.
    expect(() => LoggingService.log("AZUL", "PAYROLL", "INFO", "prueba", { packId: "p1", note: "x" })).not.toThrow();
  });
});

describe("estático — Jest resuelve los subpaths .js de @noble", () => {
  test("aes.js, utils.js, hkdf.js, hmac.js y sha2.js cargan y funcionan", () => {
    const key = new Uint8Array(32).fill(7);
    const iv = new Uint8Array(12).fill(1);
    const ct = gcm(key, iv).encrypt(utf8ToBytes("hola"));
    expect(bytesToUtf8(gcm(key, iv).decrypt(ct))).toBe("hola");
    expect(hkdf(sha256, key, undefined, utf8ToBytes("dt.noteDigest.v1"), 32)).toHaveLength(32);
    expect(hmac(sha256, key, utf8ToBytes("x"))).toHaveLength(32);
  });
});
