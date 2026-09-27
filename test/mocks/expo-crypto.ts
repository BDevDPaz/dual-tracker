/** Doble de expo-crypto: SHA-256 real de Node (determinista), UUID y bytes aleatorios. */
import { createHash, randomBytes, randomUUID as nodeUUID } from "crypto";

export enum CryptoDigestAlgorithm {
  SHA1 = "SHA-1",
  SHA256 = "SHA-256",
  SHA384 = "SHA-384",
  SHA512 = "SHA-512",
}
export enum CryptoEncoding {
  HEX = "hex",
  BASE64 = "base64",
}

const NODE_ALG: Record<string, string> = { "SHA-1": "sha1", "SHA-256": "sha256", "SHA-384": "sha384", "SHA-512": "sha512" };

export async function digestStringAsync(
  algorithm: CryptoDigestAlgorithm,
  data: string,
  options: { encoding?: CryptoEncoding } = {},
): Promise<string> {
  return createHash(NODE_ALG[algorithm] ?? "sha256")
    .update(data, "utf8")
    .digest(options.encoding === CryptoEncoding.BASE64 ? "base64" : "hex");
}

export function randomUUID(): string {
  return nodeUUID();
}
export function getRandomBytes(n: number): Uint8Array {
  return new Uint8Array(randomBytes(n));
}
export async function getRandomBytesAsync(n: number): Promise<Uint8Array> {
  return getRandomBytes(n);
}
