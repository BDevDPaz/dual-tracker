/** backupCodec — cifrado y descifrado del archivo .dtbackup con contraseña. */
import {
  BACKUP_FORMAT,
  BackupCodecError,
  decryptBackup,
  encryptBackup,
  parseBackupFile,
  passphraseLongEnough,
} from "../backupCodec";

const FAST = { scrypt: { N: 2 ** 10, r: 8, p: 1 } };
const PASS = "correcto caballo 42";

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof BackupCodecError ? e.code : `OTHER:${String(e)}`;
  }
}

describe("backupCodec", () => {
  test("ida y vuelta: el contenido sale igual y el archivo no lleva el texto en claro", async () => {
    const plain = JSON.stringify({ nota: "Llave en la maceta", email: "rrhh@empresa.test" });
    const file = await encryptBackup(plain, PASS, FAST);
    expect(file).not.toContain("maceta");
    expect(file).not.toContain("rrhh@");
    const head = parseBackupFile(file);
    expect(head).toMatchObject({ format: BACKUP_FORMAT, formatVersion: 1, kdf: { name: "scrypt", N: 1024, r: 8, p: 1 }, cipher: { name: "aes-256-gcm" } });
    expect(await decryptBackup(file, PASS)).toBe(plain);
  });

  test("sal e IV nuevos en cada copia: dos archivos del mismo contenido no coinciden", async () => {
    const a = await encryptBackup("{}", PASS, FAST);
    const b = await encryptBackup("{}", PASS, FAST);
    expect(a).not.toBe(b);
  });

  test("contraseña equivocada → BACKUP_WRONG_PASSWORD", async () => {
    const file = await encryptBackup("{}", PASS, FAST);
    expect(await code(decryptBackup(file, "otra contraseña"))).toBe("BACKUP_WRONG_PASSWORD");
  });

  test("un byte cambiado en el cifrado o en la cabecera no descifra", async () => {
    const file = JSON.parse(await encryptBackup("{\"a\":1}", PASS, FAST));
    const ct = file.ciphertext as string;
    const flipped = { ...file, ciphertext: (ct[0] === "A" ? "B" : "A") + ct.slice(1) };
    expect(await code(decryptBackup(JSON.stringify(flipped), PASS))).toBe("BACKUP_WRONG_PASSWORD");
    // La cabecera va en el AAD: cambiar r (aunque siga siendo válido) rompe la etiqueta.
    const header = { ...file, kdf: { ...file.kdf, r: 4 } };
    expect(await code(decryptBackup(JSON.stringify(header), PASS))).toBe("BACKUP_WRONG_PASSWORD");
  });

  test("archivo que no es una copia, versión desconocida o parámetros hostiles", async () => {
    expect(await code(decryptBackup("no es json", PASS))).toBe("BACKUP_INVALID");
    expect(await code(decryptBackup(JSON.stringify({ format: "otra-cosa" }), PASS))).toBe("BACKUP_INVALID");
    const file = JSON.parse(await encryptBackup("{}", PASS, FAST));
    expect(await code(decryptBackup(JSON.stringify({ ...file, formatVersion: 99 }), PASS))).toBe("BACKUP_UNSUPPORTED_VERSION");
    expect(await code(decryptBackup(JSON.stringify({ ...file, kdf: { ...file.kdf, N: 2 ** 24 } }), PASS))).toBe("BACKUP_INVALID");
    expect(await code(decryptBackup(JSON.stringify({ ...file, kdf: { ...file.kdf, N: 1000 } }), PASS))).toBe("BACKUP_INVALID");
    expect(await code(decryptBackup(JSON.stringify({ ...file, cipher: { ...file.cipher, iv: "AAAA" } }), PASS))).toBe("BACKUP_INVALID");
  });

  test("la contraseña exige un mínimo de 8 caracteres", async () => {
    expect(passphraseLongEnough("1234567")).toBe(false);
    expect(passphraseLongEnough("12345678")).toBe(true);
    expect(await code(encryptBackup("{}", "corta", FAST))).toBe("BACKUP_PASSPHRASE_SHORT");
  });
});
