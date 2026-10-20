/**
 * Código de un solo uso para el PIN de administración. No hay servidor.
 * El PIN no viaja en el código: dáselo a la persona por otro canal.
 * La clave Ed25519 se guarda en un archivo local (0600) y se reutiliza,
 * para que todos los teléfonos queden fijados a la misma clave.
 * El mismo texto es el contenido de un QR si lo imprimes aparte.
 *
 *   printf '%s\n' '123456' > /tmp/dt-pin
 *   npx tsx scripts/provision-admin-pin.ts --pin-file /tmp/dt-pin --hours 72
 *   DT_PIN=123456 npx tsx scripts/provision-admin-pin.ts --rotate
 *
 * --pin sigue aceptándose y avisa: el PIN queda en el historial del shell.
 * stdout es solo el código. La clave secreta no se imprime.
 * Detalle: docs/PIN_APROVISIONAMIENTO.md.
 */
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { getPublicKey } from "@noble/ed25519";
import { PIN_PROVISION_DEFAULT_TTL_MS } from "../src/config/provisional";
import { b64urlEncode } from "../src/services/persistence/cryptoCodec";
import { createProvisionCode, employerKeyId } from "../src/services/runtime/pinProvision";

interface EmployerKeyFile {
  v: 1;
  kdf: "ed25519";
  secretKey: string;
  publicKey: string;
  keyId: string;
  createdAt: string;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function loadKey(file: string, rotate: boolean): Uint8Array {
  if (rotate && existsSync(file)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const retired = file.replace(/\.json$/i, "") + `.retired-${stamp}.json`;
    renameSync(file, retired);
    console.error(`Clave retirada: ${retired}`);
  }
  if (existsSync(file)) {
    let parsed: EmployerKeyFile;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8")) as EmployerKeyFile;
    } catch {
      console.error(`No se pudo leer la clave: ${file}`);
      process.exit(1);
    }
    const secret = Buffer.from((parsed.secretKey ?? "").trim(), "hex");
    if (parsed.kdf !== "ed25519" || secret.length !== 32) {
      console.error(`El archivo de clave no es un Ed25519 de 32 bytes: ${file}`);
      process.exit(1);
    }
    const secretKey = new Uint8Array(secret);
    const publicKey = b64urlEncode(getPublicKey(secretKey));
    if (parsed.publicKey !== publicKey) {
      console.error(`La clave pública de ${file} no corresponde al secreto. No se usa.`);
      process.exit(1);
    }
    chmodSync(file, 0o600);
    console.error(`Clave reutilizada. keyId ${parsed.keyId}`);
    return secretKey;
  }
  const secretKey = new Uint8Array(randomBytes(32));
  const publicKey = b64urlEncode(getPublicKey(secretKey));
  const keyId = employerKeyId(publicKey);
  const body: EmployerKeyFile = {
    v: 1,
    kdf: "ed25519",
    secretKey: Buffer.from(secretKey).toString("hex"),
    publicKey,
    keyId,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(file, JSON.stringify(body, null, 2) + "\n", { mode: 0o600 });
  chmodSync(file, 0o600);
  console.error(`Clave nueva. keyId ${keyId}`);
  console.error(`Archivo ${file} (no lo subas al repositorio).`);
  return secretKey;
}

function pinFromText(text: string, label: string): string {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length !== 1) {
    console.error(`${label} tiene que contener el PIN en una sola línea.`);
    process.exit(1);
  }
  return lines[0];
}

function readPinFile(file: string): string {
  try {
    return pinFromText(readFileSync(file, "utf8"), file);
  } catch {
    console.error(`No se pudo leer el PIN: ${file}`);
    process.exit(1);
  }
}

function promptHidden(): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stderr.write("PIN: ");
    if (typeof stdin.setRawMode !== "function") {
      const rl = createInterface({ input: stdin, output: process.stderr });
      rl.question("", (answer) => {
        rl.close();
        resolve(answer.trim());
      });
      return;
    }
    let pin = "";
    stdin.setRawMode(true);
    stdin.resume();
    const onData = (buf: Buffer) => {
      const s = buf.toString("utf8");
      if (s === "\n" || s === "\r" || s === "\u0004") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off("data", onData);
        process.stderr.write("\n");
        resolve(pin.trim());
        return;
      }
      if (s === "\u0003") process.exit(130);
      if (s === "\u007f" || s === "\b") pin = pin.slice(0, -1);
      else if (s >= " " ) pin += s;
    };
    stdin.on("data", onData);
  });
}

async function readPin(): Promise<string> {
  const fileArg = arg("pin-file");
  const legacy = arg("pin");
  if (legacy && !legacy.startsWith("--")) {
    console.error("Aviso: --pin está en desuso. El PIN queda en el historial del shell y en la lista de procesos. Usa --pin-file, DT_PIN_FILE o DT_PIN.");
  }
  if (fileArg && !fileArg.startsWith("--")) return readPinFile(fileArg);
  if (process.env.DT_PIN_FILE) return readPinFile(process.env.DT_PIN_FILE);
  if (process.env.DT_PIN && process.env.DT_PIN.trim()) return process.env.DT_PIN.trim();
  if (legacy && !legacy.startsWith("--")) return legacy;
  if (process.stdin.isTTY) {
    const typed = await promptHidden();
    if (!typed) {
      console.error("No se leyó un PIN.");
      process.exit(1);
    }
    return typed;
  }
  const piped = readFileSync(0, "utf8");
  if (!piped.trim()) {
    console.error("Falta el PIN. Pásalo por --pin-file, DT_PIN_FILE, DT_PIN o stdin.");
    process.exit(1);
  }
  return pinFromText(piped, "stdin");
}

async function main(): Promise<void> {
const pin = await readPin();

const hoursRaw = arg("hours");
const hours = hoursRaw === undefined ? PIN_PROVISION_DEFAULT_TTL_MS / 3_600_000 : Number(hoursRaw);
if (!Number.isFinite(hours) || hours <= 0) {
  console.error("--hours tiene que ser un número de horas mayor que cero.");
  process.exit(1);
}

const keyFile = arg("key") && !arg("key")!.startsWith("--") ? arg("key")! : "employer-key.json";
const seed = loadKey(keyFile, process.argv.includes("--rotate"));

const made = createProvisionCode({
  pin,
  expiresAtMs: Date.now() + hours * 3_600_000,
  salt: randomBytes(16),
  nonce: randomBytes(16),
  seed,
});

if (!made.ok) {
  console.error(made.code);
  process.exit(1);
}

console.log(made.code);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "No se pudo generar el código.");
  process.exit(1);
});
