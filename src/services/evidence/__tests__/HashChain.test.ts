/** T0/T3 — HashChain: mismo payload + prevHash = mismo hash; orden distinto = hash distinto. */
import { GENESIS_HASH, chainHash, sha256Hex, verifyChain } from "../HashChain";
import { makeLedgerChain } from "../../../../test/fixtures/ledger.fixture";

describe("HashChain", () => {
  test("[T0 humo] sha256Hex es SHA-256 real", async () => {
    expect(await sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  test("mismo payload + prevHash = mismo hash (objeto u orden de claves indiferente)", async () => {
    const a = await chainHash(GENESIS_HASH, { a: 1, b: [1, 2] });
    expect(await chainHash(GENESIS_HASH, { b: [1, 2], a: 1 })).toBe(a);
    expect(await chainHash("x".repeat(64), { a: 1, b: [1, 2] })).not.toBe(a);
  });

  test("orden distinto de asientos = cadena distinta y verify la rompe", async () => {
    const chain = await makeLedgerChain();
    expect(await verifyChain(chain)).toBe(-1);
    expect(await verifyChain([chain[1], chain[0], chain[2]])).toBe(0);
    expect(await verifyChain([chain[0], chain[2]])).toBe(1);
    const swapped = await chainHash(chain[1].hash, chain[0].payloadJson);
    expect(swapped).not.toBe(chain[1].hash);
  });

  test("la fixture de tres asientos encadena prevHash", async () => {
    const [a, b, c] = await makeLedgerChain();
    expect(a.prevHash).toBe(GENESIS_HASH);
    expect(b.prevHash).toBe(a.hash);
    expect(c.prevHash).toBe(b.hash);
  });
});
