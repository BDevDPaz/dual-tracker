/** scrypt del PIN, migración del formato y comparación sin atajo temporal. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import * as SecureStore from "expo-secure-store";
import { PIN_HASH_ITERATIONS, PIN_SCRYPT_DK_LEN, PIN_SCRYPT_N, PIN_SCRYPT_P, PIN_SCRYPT_R } from "../../../config/provisional";
import { ADMIN_PIN_STORE_KEY, SecurityService } from "../SecurityService";
import { derivePinHash, parseScryptPinHash, scryptCostAllowed, scryptPinHash, scryptPinMatches, timingSafeEqual, type ScryptPinParams } from "../pinHash";

const PARAMS: ScryptPinParams = { N: PIN_SCRYPT_N, r: PIN_SCRYPT_R, p: PIN_SCRYPT_P, dkLen: PIN_SCRYPT_DK_LEN };

describe("comparación del hash", () => {
  test("igualdad, diferencia de un carácter y longitudes distintas", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("", "")).toBe(true);
    expect(timingSafeEqual("abc", "xbc")).toBe(false);
    expect(timingSafeEqual("abc", "abx")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("abcd", "abc")).toBe(false);
    const long = "s".repeat(300);
    expect(timingSafeEqual(long, long)).toBe(true);
    expect(timingSafeEqual(long, `${long.slice(0, 299)}t`)).toBe(false);
  });

  test("el recorrido no regresa en el primer carácter distinto", () => {
    const src = readFileSync(join(__dirname, "../pinHash.ts"), "utf8");
    const body = src.slice(src.indexOf("export function timingSafeEqual"), src.indexOf("export function derivePinHash"));
    expect(body).toContain("COMPARE_WIDTH");
    expect(body).not.toMatch(/return false/);
    expect(body.match(/return /g)).toHaveLength(1);
  });
});

describe("scrypt del PIN", () => {
  test("el hash versionado verifica y un carácter de más no", () => {
    const hash = scryptPinHash("481236", randomBytes(16), PARAMS);
    const parsed = parseScryptPinHash(hash);
    expect(parsed?.canonical).toBe(hash);
    expect(parsed?.N).toBe(PIN_SCRYPT_N);
    expect(scryptPinMatches("481236", hash, PARAMS)).toBe(true);
    expect(scryptPinMatches("481237", hash, PARAMS)).toBe(false);
    expect(parseScryptPinHash("sha256$" + hash)).toBeNull();
  });

  test("un N por encima del vigente no se calcula", () => {
    expect(scryptCostAllowed({ N: PIN_SCRYPT_N, r: PIN_SCRYPT_R, p: PIN_SCRYPT_P, dkLen: PIN_SCRYPT_DK_LEN }, PARAMS)).toBe(true);
    expect(scryptCostAllowed({ N: PIN_SCRYPT_N * 2, r: PIN_SCRYPT_R, p: PIN_SCRYPT_P, dkLen: PIN_SCRYPT_DK_LEN }, PARAMS)).toBe(false);
    expect(scryptCostAllowed({ N: 1000, r: PIN_SCRYPT_R, p: PIN_SCRYPT_P, dkLen: PIN_SCRYPT_DK_LEN }, PARAMS)).toBe(false);
    const hostile = `scrypt1$${PIN_SCRYPT_N * 2}$${PIN_SCRYPT_R}$${PIN_SCRYPT_P}$${PIN_SCRYPT_DK_LEN}$${"A".repeat(22)}$${"ab".repeat(PIN_SCRYPT_DK_LEN)}`;
    const parsed = parseScryptPinHash(hostile);
    expect(parsed).not.toBeNull();
    expect(scryptCostAllowed(parsed!, PARAMS)).toBe(false);
    expect(scryptPinMatches("481236", hostile, PARAMS)).toBe(false);
  });
});

describe("migración del hash legado", () => {
  test("un acierto reescribe a scrypt; un fallo deja el hash viejo", async () => {
    const pin = "481236";
    const salt = "sal-legada-v1";
    const legacy = derivePinHash(pin, salt, PIN_HASH_ITERATIONS);
    await SecureStore.setItemAsync(
      ADMIN_PIN_STORE_KEY,
      JSON.stringify({ salt, hash: legacy, iterations: PIN_HASH_ITERATIONS, provision: "LOCAL" }),
    );

    expect((await SecurityService.unlock("000000")).ok).toBe(false);
    const untouched = JSON.parse((await SecureStore.getItemAsync(ADMIN_PIN_STORE_KEY)) ?? "{}") as { hash?: string; kdf?: string };
    expect(untouched.hash).toBe(legacy);
    expect(untouched.kdf).toBeUndefined();

    expect((await SecurityService.unlock(pin)).ok).toBe(true);
    const migrated = JSON.parse((await SecureStore.getItemAsync(ADMIN_PIN_STORE_KEY)) ?? "{}") as {
      hash: string;
      kdf?: string;
      provision?: string;
    };
    expect(migrated.kdf).toBe("scrypt");
    expect(migrated.hash.startsWith(`scrypt1$${PIN_SCRYPT_N}$`)).toBe(true);
    expect(migrated.hash).not.toBe(legacy);
    expect(migrated.provision).toBe("LOCAL");

    SecurityService.lock();
    expect((await SecurityService.unlock(pin)).ok).toBe(true);
    expect((await SecurityService.unlock("000000")).ok).toBe(false);
  }, 20_000);
});
