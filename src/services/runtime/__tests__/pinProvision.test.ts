/** Código de empleador: un solo uso, caduca, sustituye un PIN local y deja asiento. */
import { randomBytes } from "node:crypto";
import { PIN_LOCKOUT_STEPS } from "../../../config/provisional";
import { PersistenceService } from "../../persistence/PersistenceService";
import { SecurityService } from "../SecurityService";
import { createProvisionCode } from "../pinProvision";
import { provisionAdminPin } from "../../application/useCases/provisionAdminPin";
import { time } from "../../../../test/time";

function codeFor(pin: string, expiresAtMs: number) {
  const made = createProvisionCode({
    pin,
    expiresAtMs,
    salt: randomBytes(16),
    nonce: randomBytes(16),
    seed: randomBytes(32),
  });
  if (!made.ok) throw new Error(made.code);
  return made;
}

describe("aprovisionamiento del PIN", () => {
  beforeEach(() => PersistenceService.init());

  test("un código vigente instala el PIN, no se reutiliza y el ledger no lleva el secreto", async () => {
    const made = codeFor("481236", time.now() + 60_000);
    const installed = await provisionAdminPin(made.code);
    expect(installed.ok).toBe(true);
    expect(await SecurityService.pinOrigin()).toBe("EMPLOYER");
    expect((await SecurityService.unlock("481236")).ok).toBe(true);
    expect(await provisionAdminPin(made.code)).toMatchObject({ ok: false, code: "CODE_USED" });

    const rows = await PersistenceService.listLedger({ intent: "ADMIN_PIN_PROVISIONED" });
    expect(rows).toHaveLength(1);
    expect(rows[0].payloadJson).toContain(made.nonce);
    expect(rows[0].payloadJson).not.toContain("481236");
    expect(rows[0].reason).toBe("EMPLOYER_CODE");
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

  test("un PIN local se sustituye; un PIN de empleador cerrado no", async () => {
    await SecurityService.setPin("111111");
    expect(await SecurityService.pinOrigin()).toBe("LOCAL");
    const first = codeFor("222222", time.now() + 60_000);
    expect((await SecurityService.provisionFromCode(first.code)).ok).toBe(true);
    expect(await SecurityService.pinOrigin()).toBe("EMPLOYER");
    expect((await SecurityService.unlock("111111")).ok).toBe(false);
    SecurityService.lock();
    const second = codeFor("333333", time.now() + 60_000);
    expect(await SecurityService.provisionFromCode(second.code)).toMatchObject({ ok: false, code: "ALREADY_PROVISIONED" });
    expect((await SecurityService.unlock("222222")).ok).toBe(true);
  });

  test("los escalones de bloqueo siguen aplicando", async () => {
    const made = codeFor("481236", time.now() + 60_000);
    expect((await SecurityService.provisionFromCode(made.code)).ok).toBe(true);
    const threshold = PIN_LOCKOUT_STEPS[0][0];
    for (let i = 0; i < threshold; i++) {
      expect((await SecurityService.unlock("000000")).ok).toBe(false);
    }
    const last = await SecurityService.unlock("000000");
    expect(last.ok).toBe(false);
    if (!last.ok) expect(last.code).toBe("ADMIN_LOCKOUT");
  });
});
