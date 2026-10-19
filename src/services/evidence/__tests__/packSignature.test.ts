import { HOUR } from "../../../../test/fixtures/session.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../../test/helpers";
import { time } from "../../../../test/time";
import { PACK_MANIFEST_VERSION } from "../../../core/contracts";
import { getWeekEnd, getWeekStart } from "../../../utils/dateUtils";
import { EvidencePackService } from "../EvidencePackService";
import { signCanonicalBody, verifyCanonicalBody } from "../packSignature";

describe("packSignature", () => {
  test("firma y verifica el cuerpo canónico; una firma alterada no pasa", async () => {
    const body = { manifestVersion: PACK_MANIFEST_VERSION, periodStart: 1, periodEnd: 2, sealWarnings: [] as [] };
    const packHash = "ab".repeat(32);
    const signature = await signCanonicalBody(body, packHash);
    expect(signature).not.toBeNull();
    expect(signature!.algorithm).toBe("Ed25519");
    expect(signature!.keyId.startsWith("ed25519:")).toBe(true);
    expect(verifyCanonicalBody(body, packHash, signature!)).toBe(true);
    expect(verifyCanonicalBody({ ...body, periodEnd: 3 }, packHash, signature!)).toBe(false);
    const same = await signCanonicalBody(body, packHash);
    expect(same!.publicKey).toBe(signature!.publicKey);
    expect(same!.keyId).toBe(signature!.keyId);
  });

  test("un pack sellado en pruebas trae firma y verify la acepta", async () => {
    const { siteA } = await seedWorld();
    await startAndArrive(siteA);
    time.travel(8 * HOUR);
    await mustDispatch({ type: "CLOSE_DAY", mode: "MANUAL" });
    const period = { periodStart: getWeekStart(time.now()), periodEnd: getWeekEnd(time.now()) };
    const sealed = await EvidencePackService.seal(period);
    if (!sealed.ok || !sealed.data) throw new Error("seal");
    expect(sealed.data.manifest.manifestVersion).toBe(4);
    expect(sealed.data.manifest.signature?.algorithm).toBe("Ed25519");
    expect(sealed.data.manifest.sealWarnings ?? []).toEqual([]);
    expect(await EvidencePackService.verify(sealed.data)).toMatchObject({ valid: true, scheme: "Ed25519", failures: [] });
  });
});
