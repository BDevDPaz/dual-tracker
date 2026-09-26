/**
 * HashChain — Evidencia (Propuesta Técnica §3, capa Evidencia)
 * ============================================================================
 * Encadenamiento SHA-256: hash = sha256(prevHash + payloadCanónico).
 * Usado por IntegrityLedgerService (asientos) y EvidencePackService (manifiesto).
 */
import * as Crypto from "expo-crypto";
import { canonicalJson } from "../../utils/canonicalJson";
import { GENESIS_HASH } from "../../core/contracts";

export async function sha256Hex(input: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}

/** Calcula el hash de un eslabón a partir del anterior y su payload. */
export async function chainHash(prevHash: string, payload: unknown): Promise<string> {
  const body = typeof payload === "string" ? payload : canonicalJson(payload);
  return sha256Hex(`${prevHash}${body}`);
}

/**
 * Verifica una cadena completa. Devuelve el índice del primer eslabón roto o
 * -1 si la cadena es íntegra.
 */
export async function verifyChain(
  links: { prevHash: string; hash: string; payloadJson: string }[],
): Promise<number> {
  let expectedPrev = GENESIS_HASH;
  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    if (link.prevHash !== expectedPrev) return i;
    const recomputed = await chainHash(link.prevHash, link.payloadJson);
    if (recomputed !== link.hash) return i;
    expectedPrev = link.hash;
  }
  return -1;
}

export { GENESIS_HASH };
