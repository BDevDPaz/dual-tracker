/**
 * Código de un solo uso para el PIN de administración. No hay servidor.
 * El PIN no viaja en el código: dáselo a la persona por otro canal.
 * La clave Ed25519 se guarda en un archivo local (0600) y se reutiliza,
 * para que todos los teléfonos queden fijados a la misma clave.
 * El mismo texto es el contenido de un QR si lo imprimes aparte.
 *
 *   npx tsx scripts/provision-admin-pin.ts --pin 123456 --hours 72
 *   npx tsx scripts/provision-admin-pin.ts --pin 123456 --rotate
 *
 * stdout es solo el código. La clave secreta no se imprime.
 * Detalle: docs/PIN_APROVISIONAMIENTO.md.
 */
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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

const pin = arg("pin");
if (!pin || pin.startsWith("--")) {
  console.error("Falta --pin. Ejemplo: npx tsx scripts/provision-admin-pin.ts --pin 123456 --hours 72");
  process.exit(1);
}

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
