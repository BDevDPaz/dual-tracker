/**
 * Código de un solo uso para el PIN de administración. No hay servidor.
 * El PIN no viaja en el código: dáselo a la persona por otro canal.
 * El mismo texto es el contenido de un QR si lo imprimes aparte.
 *
 *   npx tsx scripts/provision-admin-pin.ts --pin 123456 --hours 72
 *
 * Detalle: docs/PIN_APROVISIONAMIENTO.md.
 */
import { randomBytes } from "node:crypto";
import { PIN_PROVISION_DEFAULT_TTL_MS } from "../src/config/provisional";
import { createProvisionCode } from "../src/services/runtime/pinProvision";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

const pin = arg("pin");
if (!pin) {
  console.error("Falta --pin. Ejemplo: npx tsx scripts/provision-admin-pin.ts --pin 123456 --hours 72");
  process.exit(1);
}

const hoursRaw = arg("hours");
const hours = hoursRaw === undefined ? PIN_PROVISION_DEFAULT_TTL_MS / 3_600_000 : Number(hoursRaw);
if (!Number.isFinite(hours) || hours <= 0) {
  console.error("--hours tiene que ser un número de horas mayor que cero.");
  process.exit(1);
}

const made = createProvisionCode({
  pin,
  expiresAtMs: Date.now() + hours * 3_600_000,
  salt: randomBytes(16),
  nonce: randomBytes(16),
  seed: randomBytes(32),
});

if (!made.ok) {
  console.error(made.code);
  process.exit(1);
}

console.log(made.code);
