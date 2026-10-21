/** Código de empleador: un solo uso, caduca, fija la clave y deja asiento. */
import { randomBytes } from "node:crypto";
import * as SecureStore from "expo-secure-store";
import { PIN_LOCKOUT_STEPS, PIN_SCRYPT_N } from "../../../config/provisional";
import { MICROCOPY_REJECTIONS } from "../../../i18n/microcopy";
import { PersistenceService } from "../../persistence/PersistenceService";
import { ADMIN_PIN_STORE_KEY, SecurityService } from "../SecurityService";
import { __setEmployerKeyAnchorForTests } from "../../../config/employerKeyAnchor";
import { employerKeyFingerprint } from "../keyFingerprint";
import { createLegacyProvisionCode, createProvisionCode, decodeProvisionCode, employerKeyId } from "../pinProvision";
import { provisionAdminPin } from "../../application/useCases/provisionAdminPin";
import { time } from "../../../../test/time";

function codeFor(pin: string, expiresAtMs: number, seed?: Uint8Array) {
  const made = createProvisionCode({
    pin,
    expiresAtMs,
    salt: randomBytes(16),
    nonce: randomBytes(16),
    seed: seed ?? randomBytes(32),
  });
  if (!made.ok) throw new Error(made.code);
  return { ...made, fingerprint: employerKeyFingerprint(decodeProvisionCode(made.code)!.pub) };
}

describe("aprovisionamiento del PIN", () => {
  beforeEach(() => PersistenceService.init());

  test("un código vigente instala el PIN, no se reutiliza y el ledger no lleva el secreto", async () => {
    const made = codeFor("481236", time.now() + 60_000);
    const installed = await provisionAdminPin(made.code, made.fingerprint);
    expect(installed.ok).toBe(true);
    expect(await SecurityService.pinOrigin()).toBe("EMPLOYER");
    expect((await SecurityService.unlock("481236")).ok).toBe(true);
    expect(await provisionAdminPin(made.code)).toMatchObject({ ok: false, code: "CODE_USED" });

    const decoded = decodeProvisionCode(made.code);
    expect(decoded?.v).toBe(2);
    expect(decoded?.hash.startsWith(`scrypt1$${PIN_SCRYPT_N}$`)).toBe(true);
    const keyId = employerKeyId(decoded!.pub);

    const rows = await PersistenceService.listLedger({ intent: "ADMIN_PIN_PROVISIONED" });
    expect(rows).toHaveLength(1);
    expect(rows[0].payloadJson).toContain(made.nonce);
    expect(rows[0].payloadJson).toContain(keyId);
    expect(rows[0].payloadJson).not.toContain("481236");
    expect(rows[0].payloadJson).not.toContain(decoded!.pub);
    expect(rows[0].reason).toBe("EMPLOYER_CODE");

    const pinned = await PersistenceService.listLedger({ intent: "EMPLOYER_KEY_PINNED" });
    expect(pinned).toHaveLength(1);
    expect(pinned[0].reason).toBe("FINGERPRINT");
    expect(pinned[0].payloadJson).toContain(keyId);
    expect(pinned[0].payloadJson).not.toContain(decoded!.pub);
  });

  test("caducado, truncado y PIN corto se rechazan", async () => {
    const expired = codeFor("481236", time.now() - 1);
    expect(await SecurityService.provisionFromCode(expired.code)).toMatchObject({ ok: false, code: "CODE_EXPIRED" });
    expect(await SecurityService.provisionFromCode(expired.code.slice(0, 20))).toMatchObject({ ok: false, code: "CODE_INVALID" });
    expect(createProvisionCode({ pin: "123", expiresAtMs: time.now() + 1000, salt: randomBytes(16), nonce: randomBytes(16), seed: randomBytes(32) })).toMatchObject({
      ok: false,
      code: "PIN_INVALID",
    });
  });

  test("un PIN local se sustituye; la misma clave, con el PIN de empleador cerrado, no", async () => {
    await SecurityService.setPin("111111");
    expect(await SecurityService.pinOrigin()).toBe("LOCAL");
    const seed = randomBytes(32);
    const first = codeFor("222222", time.now() + 60_000, seed);
    expect((await SecurityService.provisionFromCode(first.code, first.fingerprint)).ok).toBe(true);
    expect(await SecurityService.pinOrigin()).toBe("EMPLOYER");
    expect((await SecurityService.unlock("111111")).ok).toBe(false);
    SecurityService.lock();
    const second = codeFor("333333", time.now() + 60_000, seed);
    expect(await SecurityService.provisionFromCode(second.code)).toMatchObject({ ok: false, code: "ALREADY_PROVISIONED" });
    expect((await SecurityService.unlock("222222")).ok).toBe(true);
  }, 20_000);

  test("otra clave se rechaza cerrada, no gasta el nonce y se rota con la zona abierta", async () => {
    expect(MICROCOPY_REJECTIONS.es.EMPLOYER_KEY_MISMATCH).toContain("Desbloquea la zona admin");
    expect(MICROCOPY_REJECTIONS.en.EMPLOYER_KEY_MISMATCH).toContain("Unlock the admin area");

    const seed = randomBytes(32);
    const first = codeFor("222222", time.now() + 60_000, seed);
    expect((await provisionAdminPin(first.code, first.fingerprint)).ok).toBe(true);
    const other = codeFor("333333", time.now() + 60_000);
    expect(await provisionAdminPin(other.code)).toMatchObject({ ok: false, code: "EMPLOYER_KEY_MISMATCH" });

    expect((await SecurityService.unlock("222222")).ok).toBe(true);
    expect((await provisionAdminPin(other.code)).ok).toBe(true);
    const rows = await PersistenceService.listLedger({ intent: "EMPLOYER_KEY_REPINNED" });
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe("ROTATION");
    const previous = employerKeyId(decodeProvisionCode(first.code)!.pub);
    const next = employerKeyId(decodeProvisionCode(other.code)!.pub);
    expect(rows[0].payloadJson).toContain(previous);
    expect(rows[0].payloadJson).toContain(next);
    expect(rows[0].payloadJson).not.toContain("333333");

    const againOld = codeFor("444444", time.now() + 60_000, seed);
    expect(await SecurityService.provisionFromCode(againOld.code)).toMatchObject({ ok: false, code: "EMPLOYER_KEY_MISMATCH" });
    expect((await SecurityService.unlock("333333")).ok).toBe(true);
    expect((await SecurityService.unlock("222222")).ok).toBe(false);
  }, 20_000);

  test("un código v1 se instala y el primer acierto lo pasa a scrypt", async () => {
    const legacy = createLegacyProvisionCode({
      pin: "481236",
      expiresAtMs: time.now() + 60_000,
      salt: randomBytes(16),
      nonce: randomBytes(16),
      seed: randomBytes(32),
    });
    if (!legacy.ok) throw new Error(legacy.code);
    expect(decodeProvisionCode(legacy.code)?.v).toBe(1);
    expect((await SecurityService.provisionFromCode(legacy.code, employerKeyFingerprint(decodeProvisionCode(legacy.code)!.pub))).ok).toBe(true);
    const stored = JSON.parse((await SecureStore.getItemAsync(ADMIN_PIN_STORE_KEY)) ?? "{}") as { kdf?: string; hash: string };
    expect(stored.kdf).toBeUndefined();
    expect(stored.hash).toMatch(/^[0-9a-f]{64}$/i);
    expect((await SecurityService.unlock("481236")).ok).toBe(true);
    const after = JSON.parse((await SecureStore.getItemAsync(ADMIN_PIN_STORE_KEY)) ?? "{}") as {
      kdf?: string;
      hash: string;
      provision?: string;
    };
    expect(after.kdf).toBe("scrypt");
    expect(after.hash.startsWith("scrypt1$")).toBe(true);
    expect(after.provision).toBe("EMPLOYER");
  }, 20_000);

  test("los escalones de bloqueo siguen aplicando", async () => {
    const made = codeFor("481236", time.now() + 60_000);
    expect((await SecurityService.provisionFromCode(made.code, made.fingerprint)).ok).toBe(true);
    const threshold = PIN_LOCKOUT_STEPS[0][0];
    for (let i = 0; i < threshold; i++) {
      expect((await SecurityService.unlock("000000")).ok).toBe(false);
    }
    const last = await SecurityService.unlock("000000");
    expect(last.ok).toBe(false);
    if (!last.ok) expect(last.code).toBe("ADMIN_LOCKOUT");
  }, 20_000);

  test("sin huella no se fija la primera clave; una huella ajena tampoco", async () => {
    expect(MICROCOPY_REJECTIONS.es.FINGERPRINT_REQUIRED).toContain("huella");
    expect(MICROCOPY_REJECTIONS.en.FINGERPRINT_MISMATCH).toContain("fingerprint");
    expect(MICROCOPY_REJECTIONS.es.IDENTITY_UNVERIFIED).toBe("firma válida pero identidad no verificada");
    expect(MICROCOPY_REJECTIONS.en.IDENTITY_UNVERIFIED).toBe("signature valid but identity not verified");

    const made = codeFor("481236", time.now() + 60_000);
    expect(await provisionAdminPin(made.code)).toMatchObject({ ok: false, code: "FINGERPRINT_REQUIRED" });
    expect(await SecurityService.pinOrigin()).toBe("UNSET");
    expect(await SecurityService.hasPinnedEmployerKey()).toBe(false);
    expect(await provisionAdminPin(made.code, "AAAA-BBBB-CCCC-DDDD")).toMatchObject({ ok: false, code: "FINGERPRINT_MISMATCH" });
    expect(await SecurityService.hasPinnedEmployerKey()).toBe(false);

    const installed = await provisionAdminPin(made.code, made.fingerprint.toLowerCase().replace(/-/g, " "));
    expect(installed.ok).toBe(true);
    expect(await SecurityService.hasPinnedEmployerKey()).toBe(true);
    const pinned = await PersistenceService.listLedger({ intent: "EMPLOYER_KEY_PINNED" });
    expect(pinned[0].reason).toBe("FINGERPRINT");
  }, 20_000);

  test("una clave anclada en el build fija sin huella y rechaza otra", async () => {
    const made = codeFor("481236", time.now() + 60_000);
    __setEmployerKeyAnchorForTests(decodeProvisionCode(made.code)!.pub);
    expect((await provisionAdminPin(made.code)).ok).toBe(true);
    const pinned = await PersistenceService.listLedger({ intent: "EMPLOYER_KEY_PINNED" });
    expect(pinned[0].reason).toBe("ANCHOR");

    const other = codeFor("333333", time.now() + 60_000);
    expect(await provisionAdminPin(other.code, other.fingerprint)).toMatchObject({ ok: false, code: "EMPLOYER_KEY_MISMATCH" });
    expect((await SecurityService.unlock("481236")).ok).toBe(true);
  }, 20_000);

  test("un ancla distinta no se deja pisar con la huella del código", async () => {
    const made = codeFor("481236", time.now() + 60_000);
    const other = codeFor("999999", time.now() + 60_000);
    __setEmployerKeyAnchorForTests(decodeProvisionCode(other.code)!.pub);
    expect(await provisionAdminPin(made.code, made.fingerprint)).toMatchObject({ ok: false, code: "ANCHOR_MISMATCH" });
    expect(await SecurityService.hasPinnedEmployerKey()).toBe(false);
    expect(MICROCOPY_REJECTIONS.es.ANCHOR_MISMATCH).toContain("anclada");
    expect(MICROCOPY_REJECTIONS.en.ANCHOR_MISMATCH).toContain("anchored");
  });
});
