/**
 * backupCodec — formato del archivo `.dtbackup` (Ajustes → Copia de seguridad).
 * ============================================================================
 * Función pura: no lee la base ni el llavero. El contenido (JSON) se cifra con
 * una contraseña que elige la persona:
 *
 *   clave   = scrypt(contraseña, sal 16 B, N, r, p, 32 B)   (@noble/hashes)
 *   cifrado = AES-256-GCM, IV 12 B                         (@noble/ciphers)
 *   AAD     = JSON canónico de la cabecera (formato, versión, kdf y cifra)
 *
 * El archivo es JSON legible: cabecera en claro + `ciphertext` en base64url.
 * Una cabecera tocada, un byte cambiado o una contraseña equivocada fallan en
 * la etiqueta GCM. Las dos causas no se pueden distinguir: el código es
 * BACKUP_WRONG_PASSWORD («contraseña incorrecta o archivo dañado»).
 */
import { gcm } from "@noble/ciphers/aes.js";
import { scryptAsync } from "@noble/hashes/scrypt.js";
import * as Crypto from "expo-crypto";
import { canonicalJson } from "../../utils/canonicalJson";
import { b64urlDecode, b64urlEncode, utf8 } from "./cryptoCodec";

export const BACKUP_FORMAT = "dual-tracker-backup";
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_FILE_EXTENSION = "dtbackup";
export const BACKUP_PASSPHRASE_MIN = 8;

/** Coste por defecto: 2^15 × 8 ≈ 32 MiB. Los tests pasan un N menor. */
export const DEFAULT_SCRYPT = { N: 2 ** 15, r: 8, p: 1 } as const;
/** Límites al leer: una cabecera hostil no puede pedir memoria sin tope. */
const MAX_SCRYPT_N = 2 ** 18;

export type BackupCodecErrorCode = "BACKUP_INVALID" | "BACKUP_UNSUPPORTED_VERSION" | "BACKUP_WRONG_PASSWORD" | "BACKUP_PASSPHRASE_SHORT";

export class BackupCodecError extends Error {
  constructor(readonly code: BackupCodecErrorCode) {
    super(code);
    this.name = "BackupCodecError";
  }
}

interface BackupHeader {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  kdf: { name: "scrypt"; N: number; r: number; p: number; salt: string };
  cipher: { name: "aes-256-gcm"; iv: string };
}

interface BackupFile extends BackupHeader {
  ciphertext: string;
}

function headerAad(h: BackupHeader): Uint8Array {
  return utf8.encode(canonicalJson({ format: h.format, formatVersion: h.formatVersion, kdf: h.kdf, cipher: h.cipher }));
}

async function deriveKey(passphrase: string, salt: Uint8Array, kdf: { N: number; r: number; p: number }): Promise<Uint8Array> {
  return scryptAsync(utf8.encode(passphrase.normalize("NFC")), salt, { N: kdf.N, r: kdf.r, p: kdf.p, dkLen: 32 });
}

export function passphraseLongEnough(passphrase: string): boolean {
  return [...passphrase.normalize("NFC")].length >= BACKUP_PASSPHRASE_MIN;
}

/** Cifra `plaintext` (JSON del contenido) y devuelve el texto del archivo. */
export async function encryptBackup(
  plaintext: string,
  passphrase: string,
  opts: { scrypt?: { N: number; r: number; p: number } } = {},
): Promise<string> {
  if (!passphraseLongEnough(passphrase)) throw new BackupCodecError("BACKUP_PASSPHRASE_SHORT");
  const kdfParams = opts.scrypt ?? DEFAULT_SCRYPT;
  const salt = Crypto.getRandomBytes(16);
  const iv = Crypto.getRandomBytes(12);
  const header: BackupHeader = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    kdf: { name: "scrypt", N: kdfParams.N, r: kdfParams.r, p: kdfParams.p, salt: b64urlEncode(salt) },
    cipher: { name: "aes-256-gcm", iv: b64urlEncode(iv) },
  };
  const key = await deriveKey(passphrase, salt, kdfParams);
  const ct = gcm(key, iv, headerAad(header)).encrypt(utf8.encode(plaintext));
  const file: BackupFile = { ...header, ciphertext: b64urlEncode(ct) };
  return JSON.stringify(file);
}

function isPow2(n: number): boolean {
  return Number.isInteger(n) && n > 1 && (n & (n - 1)) === 0;
}

/** Lee la cabecera sin descifrar. Lanza BACKUP_INVALID o BACKUP_UNSUPPORTED_VERSION. */
export function parseBackupFile(text: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupCodecError("BACKUP_INVALID");
  }
  const f = raw as Partial<BackupFile> | null;
  if (!f || typeof f !== "object" || f.format !== BACKUP_FORMAT) throw new BackupCodecError("BACKUP_INVALID");
  if (f.formatVersion !== BACKUP_FORMAT_VERSION) throw new BackupCodecError("BACKUP_UNSUPPORTED_VERSION");
  const kdf = f.kdf;
  const cipher = f.cipher;
  if (
    !kdf ||
    kdf.name !== "scrypt" ||
    !isPow2(kdf.N) ||
    kdf.N > MAX_SCRYPT_N ||
    !Number.isInteger(kdf.r) ||
    kdf.r < 1 ||
    kdf.r > 32 ||
    !Number.isInteger(kdf.p) ||
    kdf.p < 1 ||
    kdf.p > 4 ||
    typeof kdf.salt !== "string" ||
    !cipher ||
    cipher.name !== "aes-256-gcm" ||
    typeof cipher.iv !== "string" ||
    typeof f.ciphertext !== "string"
  ) {
    throw new BackupCodecError("BACKUP_INVALID");
  }
  return f as BackupFile;
}

/** Descifra el archivo y devuelve el JSON del contenido. */
export async function decryptBackup(text: string, passphrase: string): Promise<string> {
  const file = parseBackupFile(text);
  let salt: Uint8Array;
  let iv: Uint8Array;
  let ct: Uint8Array;
  try {
    salt = b64urlDecode(file.kdf.salt);
    iv = b64urlDecode(file.cipher.iv);
    ct = b64urlDecode(file.ciphertext);
  } catch {
    throw new BackupCodecError("BACKUP_INVALID");
  }
  if (salt.length !== 16 || iv.length !== 12 || ct.length < 16) throw new BackupCodecError("BACKUP_INVALID");
  const key = await deriveKey(passphrase, salt, file.kdf);
  let plain: Uint8Array;
  try {
    plain = gcm(key, iv, headerAad(file)).decrypt(ct);
  } catch {
    throw new BackupCodecError("BACKUP_WRONG_PASSWORD");
  }
  return utf8.decode(plain);
}
