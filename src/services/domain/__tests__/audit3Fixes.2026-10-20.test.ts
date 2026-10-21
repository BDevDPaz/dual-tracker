/**
 * Regresión de la auditoría 3 (2026-10-20). Un caso por hallazgo confirmado.
 */
import { getPublicKey, sign } from "@noble/ed25519";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { randomBytes } from "node:crypto";
import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system";
import { MICROCOPY_REJECTIONS } from "../../../i18n/microcopy";
import { employerKeyFingerprint, fingerprintFromB64url } from "../../runtime/keyFingerprint";
import { createProvisionCode, decodeProvisionCode } from "../../runtime/pinProvision";
import { SecurityService } from "../../runtime/SecurityService";
import { provisionAdminPin } from "../../application/useCases/provisionAdminPin";
import { PersistenceService } from "../../persistence/PersistenceService";
import { b64urlEncode, utf8 } from "../../persistence/cryptoCodec";
import { KeyStore } from "../../persistence/keyStore";
import { EvidencePackService, packHashBody } from "../../evidence/EvidencePackService";
import { PACK_SIGNING_SLOT, signedMessage } from "../../evidence/packSignature";
import { getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { HOUR } from "../../../../test/fixtures/session.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../test/helpers";
import { time } from "../../../../test/time";
import type { EvidencePack } from "../../../core/contracts";

function employerCode(pin: string) {
  const made = createProvisionCode({
    pin,
    expiresAtMs: time.now() + 60_000,
    salt: randomBytes(16),
    nonce: randomBytes(16),
    seed: randomBytes(32),
  });
  if (!made.ok) throw new Error(made.code);
  const pub = decodeProvisionCode(made.code)!.pub;
  return { code: made.code, fingerprint: employerKeyFingerprint(pub) };
}

async function sealedPack() {
  const { siteA } = await seedWorld();
  await startAndArrive(siteA);
  time.travel(8 * HOUR);
  await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
  const sealed = await EvidencePackService.seal({ periodStart: getWeekStart(time.now()), periodEnd: getWeekEnd(time.now()) });
  if (!sealed.ok) throw new Error(sealed.code);
  return sealed.data;
}

describe("auditoría 3 — 2026-10-20", () => {
  test("1: el primer código no fija la clave sin la huella del empleador", async () => {
    const made = employerCode("481236");
    const attacker = employerCode("999999");
    expect(await provisionAdminPin(made.code)).toMatchObject({ ok: false, code: "FINGERPRINT_REQUIRED" });
    expect(await provisionAdminPin(made.code, attacker.fingerprint)).toMatchObject({ ok: false, code: "FINGERPRINT_MISMATCH" });
    expect(await SecurityService.hasPinnedEmployerKey()).toBe(false);
    expect(await SecurityService.pinOrigin()).toBe("UNSET");

    expect((await provisionAdminPin(made.code, made.fingerprint)).ok).toBe(true);
    expect(await SecurityService.pinOrigin()).toBe("EMPLOYER");
    const row = (await PersistenceService.listLedger({ intent: "EMPLOYER_KEY_PINNED" }))[0];
    expect(row.reason).toBe("FINGERPRINT");
    expect(row.payloadJson).not.toContain(decodeProvisionCode(made.code)!.pub);
    expect((await SecurityService.unlock("481236")).ok).toBe(true);
    expect((await SecurityService.unlock("999999")).ok).toBe(false);
  }, 20_000);

  test("2: sin ancla independiente la firma no queda verificada; el PDF muestra la huella", async () => {
    const pack = await sealedPack();
    const signature = pack.manifest.signature;
    if (!signature) throw new Error("sin firma");
    const fingerprint = fingerprintFromB64url(signature.publicKey);
    expect(fingerprint).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);

    const files = (FileSystem as unknown as { __files: Map<string, string> }).__files;
    const html = files.get(pack.employeePdfUri ?? "") ?? "";
    expect(html).toContain(`data-key-fingerprint="${fingerprint}"`);
    expect(html).toContain("Huella de la clave:");

    expect(await EvidencePackService.verify(pack)).toMatchObject({ valid: true, identity: "device", identityNote: null });

    const external = await EvidencePackService.verify(pack, {});
    expect(external.valid).toBe(false);
    expect(external.scheme).toBe("Ed25519");
    expect(external.identity).toBe("unverified");
    expect(external.failures).toContain("IDENTITY_UNVERIFIED");
    expect(external.identityNote).toEqual({
      es: "firma válida pero identidad no verificada",
      en: "signature valid but identity not verified",
    });
    expect(external.identityNote?.es).toBe(MICROCOPY_REJECTIONS.es.IDENTITY_UNVERIFIED);

    expect(await EvidencePackService.verify(pack, { fingerprint: fingerprint! })).toMatchObject({ valid: true, identity: "anchor", failures: [] });
    expect(await EvidencePackService.verify(pack, { publicKey: signature.publicKey })).toMatchObject({ valid: true, identity: "anchor" });
    expect((await EvidencePackService.verify(pack, { fingerprint: "AAAA-BBBB-CCCC-DDDD" })).failures).toContain("SIGNATURE_KEY");

    await KeyStore.delete(PACK_SIGNING_SLOT);
    const loose = await EvidencePackService.verify(pack);
    expect(loose.valid).toBe(false);
    expect(loose.identity).toBe("unverified");
    expect(loose.identityNote?.es).toBe("firma válida pero identidad no verificada");

    const forged = resign(pack);
    const forgedKey = fingerprintFromB64url(forged.manifest.signature!.publicKey)!;
    expect(forgedKey).not.toBe(fingerprint);
    const unanchored = await EvidencePackService.verify(forged);
    expect(unanchored.valid).toBe(false);
    expect(unanchored.identity).toBe("unverified");
    expect(unanchored.failures).not.toContain("SIGNATURE");
    expect((await EvidencePackService.verify(forged, { fingerprint: fingerprint! })).failures).toContain("SIGNATURE_KEY");
    expect(await EvidencePackService.verify(forged, { fingerprint: forgedKey })).toMatchObject({ valid: true, identity: "anchor" });
  });

  test("3: si el sello no commitea, el directorio del intento no conserva PDF ni manifiesto", async () => {
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(8 * HOUR);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    const period = { periodStart: getWeekStart(time.now()), periodEnd: getWeekEnd(time.now()) };
    const files = (FileSystem as unknown as { __files: Map<string, string> }).__files;
    const before = new Set(files.keys());
    jest.spyOn(PersistenceService, "insertPack").mockRejectedValueOnce(new Error("disco"));
    const sealed = await EvidencePackService.seal(period);
    expect(sealed).toMatchObject({ ok: false, code: "PERSISTENCE_ERROR" });
    const leftover = [...files.keys()].filter((uri) => !before.has(uri) && (uri.includes("/packs/") || uri.includes("/.pending/")));
    expect(leftover).toEqual([]);
    expect(await PersistenceService.listPacks()).toHaveLength(0);
  });
});

function resign(pack: EvidencePack): EvidencePack {
  const { packHash, files, signature: _signature, ...rest } = pack.manifest;
  const body = packHashBody(rest);
  const seed = Crypto.getRandomBytes(32);
  const publicKey = getPublicKey(seed);
  const keyId = `ed25519:${bytesToHex(sha256(publicKey)).slice(0, 16)}`;
  const value = sign(utf8.encode(signedMessage(body, packHash)), seed);
  return {
    ...pack,
    manifest: {
      ...rest,
      packHash,
      files,
      signature: { algorithm: "Ed25519", keyId, publicKey: b64urlEncode(publicKey), value: b64urlEncode(value) },
    },
  };
}
