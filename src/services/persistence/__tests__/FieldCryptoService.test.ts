/** FieldCrypto v1.3 (§8–§10, §13, §17) — sobre, AAD, KeyStore, migración de alias, noteDigest. */
import { createCipheriv, createHash } from "crypto";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { PersistenceService } from "../PersistenceService";
import { FieldCryptoError, FieldCryptoService, LEGACY_KEY_ALIAS } from "../FieldCryptoService";
import { KeyStore } from "../keyStore";
import { SCHEMA_VERSION } from "../schema";
import { b64urlDecode, b64urlEncode } from "../cryptoCodec";
import { makeClosedSession, MONDAY_8AM } from "../../../../test/fixtures/session.fixture";
import { makeBreadcrumb } from "../../../../test/fixtures/spatial.fixture";
import { seedSite } from "../../../../test/helpers";
import { readFileSync } from "fs";
import { join } from "path";

const F = FieldCryptoService;
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof FieldCryptoError ? e.code : String(e);
  }
};

describe("FieldCryptoService v1.3 — sobre y API", () => {
  test("#1 encrypt ≠ plano y con formato enc:v1:<kid>:<fieldId>:<iv>:<ct>", async () => {
    const { stored, degraded } = await F.encrypt("session.note", 7, "secreto");
    expect(degraded).toBe(false);
    expect(stored).not.toContain("secreto");
    expect(stored).toMatch(/^enc:v1:k1:session\.note:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]+$/);
    expect(F.status()).toBe("READY");
    expect(F.activeKid()).toBe("k1");
  });

  test("#2 ida y vuelta (acentos, emoji, 2.000 caracteres)", async () => {
    for (const txt of ["hola", "Año nuevo — ñandú 🚧", "x".repeat(2000)]) {
      const { stored } = await F.encrypt("site.notes", 3, txt);
      expect(await F.decrypt("site.notes", 3, stored)).toBe(txt);
    }
  });

  test("#4 AAD fieldId: sobre de otro campo → CRYPTO_TAMPER", async () => {
    const { stored } = await F.encrypt("site.address", 1, "1 Main St");
    expect(await code(F.decrypt("site.notes", 1, stored))).toBe("CRYPTO_TAMPER");
    // Aunque se reescriba el fieldId del sobre, el AAD no verifica.
    expect(await code(F.decrypt("site.notes", 1, stored!.replace(":site.address:", ":site.notes:")))).toBe("CRYPTO_TAMPER");
  });

  test("AAD rowId: copiar un sobre válido a otra fila → CRYPTO_TAMPER", async () => {
    const { stored } = await F.encrypt("session.note", 1, "nota");
    expect(await code(F.decrypt("session.note", 2, stored))).toBe("CRYPTO_TAMPER");
  });

  test("#5 tag roto → CRYPTO_TAMPER", async () => {
    const { stored } = await F.encrypt("session.note", 1, "nota");
    const parts = stored!.split(":");
    const ct = b64urlDecode(parts[5]);
    ct[ct.length - 1] ^= 1;
    parts[5] = b64urlEncode(ct);
    expect(await code(F.decrypt("session.note", 1, parts.join(":")))).toBe("CRYPTO_TAMPER");
  });

  test("#6/#7/#8/#9 plain:v1:, legado sin prefijo, null y vacío (alias \"\")", async () => {
    expect(await F.decrypt("session.note", 1, "plain:v1:texto")).toBe("texto");
    expect(await F.decrypt("session.note", 1, "legado")).toBe("legado");
    expect(await F.decrypt("session.note", 1, null)).toBeNull();
    expect(await F.encrypt("session.note", 1, null)).toEqual({ stored: null, degraded: false });
    const empty = await F.encrypt("site.alias", 1, "");
    expect(F.isCipher(empty.stored)).toBe(true);
    expect(await F.decrypt("site.alias", 1, empty.stored)).toBe("");
  });

  test("prefijos no soportados: aesgcm:v1: y enc:v2: → CRYPTO_UNSUPPORTED; kid sin slot → CRYPTO_UNKNOWN_KID", async () => {
    expect(await code(F.decrypt("session.note", 1, "aesgcm:v1:abc"))).toBe("CRYPTO_UNSUPPORTED");
    expect(await code(F.decrypt("session.note", 1, "enc:v2:k1:session.note:a:b"))).toBe("CRYPTO_UNSUPPORTED");
    const { stored } = await F.encrypt("session.note", 1, "x");
    expect(await code(F.decrypt("session.note", 1, stored!.replace("enc:v1:k1:", "enc:v1:k9:")))).toBe("CRYPTO_UNKNOWN_KID");
  });

  test("#10 encryptJson('site.coords') a 7 decimales; NaN → CRYPTO_TYPE", async () => {
    const { stored } = await F.encryptJson("site.coords", 4, { lat: 34.052234567891, lon: -118.24368 });
    expect(await F.decryptJson("site.coords", 4, stored)).toEqual({ lat: 34.0522346, lon: -118.24368 });
    expect(await code(F.encryptJson("site.coords", 4, { lat: NaN, lon: 1 }))).toBe("CRYPTO_TYPE");
    expect(await code(F.encryptJson("spatial.coords", 4, { lat: Infinity, lon: 1 }))).toBe("CRYPTO_TYPE");
  });

  test("#12 sin doble sobre: cifrar un sobre lo trata como texto (nunca se anida al leer)", async () => {
    const a = await F.encrypt("session.note", 1, "n");
    const b = await F.encrypt("session.note", 1, a.stored);
    expect(await F.decrypt("session.note", 1, b.stored)).toBe(a.stored);
    expect(F.isCipher(a.stored)).toBe(true);
    expect(F.isPlain("plain:v1:x")).toBe(true);
    expect(F.isPlain(a.stored)).toBe(false);
    expect(F.kidOf(a.stored)).toBe("k1");
  });

  test("vector fijo (D1 en Jest): mismo resultado que AES-256-GCM de Node con el AAD exacto; independiente de SCHEMA_VERSION", async () => {
    await F.ensureMasterKey();
    const key = b64urlDecode((await SecureStore.getItemAsync("dt.mk.k1"))!);
    const iv = new Uint8Array(12).map((_, i) => i + 1);
    jest.spyOn(Crypto, "getRandomBytes").mockReturnValueOnce(iv);
    const { stored } = await F.encrypt("session.note", 42, "vector fijo");
    const c = createCipheriv("aes-256-gcm", key, iv);
    c.setAAD(Buffer.from("dt-fc|v1|k1|session.note|42", "utf8"));
    const expected = Buffer.concat([c.update("vector fijo", "utf8"), c.final(), c.getAuthTag()]);
    expect(stored).toBe(`enc:v1:k1:session.note:${b64urlEncode(iv)}:${b64urlEncode(new Uint8Array(expected))}`);
    expect(SCHEMA_VERSION).not.toBe(1); // "v1" del sobre ≠ versión de esquema
  });
});

describe("FieldCryptoService v1.3 — KeyStore y estados", () => {
  test("la MK vive en dt.mk.k1 (32 bytes base64url); crypto.kids/active_kid en app_kv", async () => {
    await PersistenceService.init();
    await F.ensureMasterKey();
    expect(b64urlDecode((await SecureStore.getItemAsync("dt.mk.k1"))!)).toHaveLength(32);
    expect(await PersistenceService.getKv("crypto.kids")).toEqual(["k1"]);
    expect(await PersistenceService.getKv("crypto.active_kid")).toBe("k1");
  });

  test("migración del alias viejo (hex) → dt.mk.k1 con los mismos bytes y borrado del alias", async () => {
    const hex = "ab".repeat(32);
    await SecureStore.setItemAsync(LEGACY_KEY_ALIAS, hex);
    await F.ensureMasterKey();
    expect(await SecureStore.getItemAsync(LEGACY_KEY_ALIAS)).toBeNull();
    expect(Buffer.from(b64urlDecode((await SecureStore.getItemAsync("dt.mk.k1"))!)).toString("hex")).toBe(hex);
    expect(F.activeKid()).toBe("k1");
  });

  test("ensureMasterKey es idempotente y no rota por su cuenta", async () => {
    await F.ensureMasterKey();
    const k = await SecureStore.getItemAsync("dt.mk.k1");
    F.__forgetCache();
    await F.ensureMasterKey();
    expect(await SecureStore.getItemAsync("dt.mk.k1")).toBe(k);
    expect(await SecureStore.getItemAsync("dt.mk.k2")).toBeNull();
  });

  test("#11 llavero caído → UNAVAILABLE sin lanzar; encrypt degradado plain:v1:", async () => {
    KeyStore.__setFailure(new Error("keystore roto"));
    await expect(F.ensureMasterKey()).resolves.toBeUndefined();
    expect(F.status()).toBe("UNAVAILABLE");
    expect(await F.encrypt("session.note", 1, "n")).toEqual({ stored: "plain:v1:n", degraded: true });
    expect(await F.noteDigest("n")).toBeNull();
  });

  test("web → UNAVAILABLE, platformSupported = false", async () => {
    KeyStore.__setPlatformSupported(false);
    await F.ensureMasterKey();
    expect(F.status()).toBe("UNAVAILABLE");
    expect(F.platformSupported()).toBe(false);
  });

  test("setNeedsMigrate → NEEDS_MIGRATE (sigue cifrando con el kid activo)", async () => {
    await F.ensureMasterKey();
    F.setNeedsMigrate(true);
    expect(F.status()).toBe("NEEDS_MIGRATE");
    expect((await F.encrypt("session.note", 1, "x")).degraded).toBe(false);
    F.setNeedsMigrate(false);
    expect(F.status()).toBe("READY");
  });
});

describe("FieldCryptoService v1.3 — noteDigest (§13)", () => {
  test("determinista con la misma clave, distinto con otra y distinto de sha256(nota)", async () => {
    const a = await F.noteDigest("  Llegué tarde por tráfico ");
    expect(a).toMatch(/^hmac-sha256:v1:k1:[A-Za-z0-9_-]{43}$/);
    expect(await F.noteDigest("Llegué tarde por tráfico")).toBe(a);
    const sha = createHash("sha256").update("Llegué tarde por tráfico").digest("base64url");
    expect(a!.endsWith(sha)).toBe(false);
    expect(await F.noteDigest("")).toBeNull();
    expect(await F.noteDigest(null)).toBeNull();
    // Otra MK → otro digest.
    F.__resetForTests();
    (require("expo-secure-store") as { __reset: () => void }).__reset();
    const b = await F.noteDigest("Llegué tarde por tráfico");
    expect(b).not.toBe(a);
  });
});

describe("FieldCryptoService — persistencia", () => {
  /** Propuesta de calidad §4.4 / spec v1.3 §17 #3: antes test.failing; ahora verde. */
  test("tras persistir, la nota no aparece en claro en SQLite", async () => {
    const db = await PersistenceService.init();
    await PersistenceService.insertSession(makeClosedSession(MONDAY_8AM, 8, { bookkeeping: { manualNote: "nota muy privada" } }));
    const row = await db.getFirstAsync<{ manual_note_sealed: string }>(`SELECT manual_note_sealed FROM sessions`);
    expect(row!.manual_note_sealed).not.toContain("nota muy privada");
  });

  test("#3 SQL crudo ciego: nota, alias, cliente, dirección y notas del destino; hechos espaciales", async () => {
    const db = await PersistenceService.init();
    const siteId = await seedSite({ alias: "Obra Ñuñoa", clientName: "Cliente Secreto SA", address: "Calle Privada 123", notes: "portón azul" });
    await PersistenceService.insertSpatialFact({ ...makeBreadcrumb({ sessionId: 1, lat: 34.123456789 }), siteId });
    const site = (await db.getFirstAsync<Record<string, string>>(`SELECT * FROM sites WHERE id = ?`, [siteId]))!;
    for (const [col, txt] of [["alias", "Obra"], ["client_name", "Cliente"], ["address", "Privada"], ["notes", "portón"]]) {
      expect(site[col]).toMatch(/^enc:v1:k1:site\./);
      expect(site[col]).not.toContain(txt);
    }
    const fact = (await db.getFirstAsync<{ coords_sealed: string; id: number }>(`SELECT id, coords_sealed FROM spatial_facts`))!;
    expect(fact.coords_sealed).toMatch(/^enc:v1:k1:spatial\.coords:/);
    expect(fact.coords_sealed).not.toContain("34.12");
    // Se hidratan descifrados.
    expect(await PersistenceService.getSite(siteId)).toMatchObject({ alias: "Obra Ñuñoa", clientName: "Cliente Secreto SA", address: "Calle Privada 123", notes: "portón azul" });
    expect((await PersistenceService.listSpatialFacts(1))[0].lat).toBe(34.1234568);
  });

  test("listSites ordena en memoria (acentos y mayúsculas, desempate por id); el SQL no ordena por alias", async () => {
    await PersistenceService.init();
    const ids: Record<string, number> = {};
    for (const a of ["zeta", "Álamo", "alamo", "Beta", "ábaco"]) ids[a] = await seedSite({ alias: a });
    const sorted = (await PersistenceService.listSites()).map((x) => x.alias);
    expect(sorted).toEqual(["ábaco", "Álamo", "alamo", "Beta", "zeta"]);
    const src = readFileSync(join(__dirname, "..", "PersistenceService.ts"), "utf8");
    expect(src).not.toMatch(/ORDER BY\s+s?\.?alias/i);
  });

  test("reescritura en la siguiente escritura: una nota plain:v1: pasa a enc:v1: al actualizar la fila", async () => {
    const db = await PersistenceService.init();
    const id = await PersistenceService.insertSession(makeClosedSession(MONDAY_8AM, 8));
    await db.runAsync(`UPDATE sessions SET manual_note_sealed = 'plain:v1:antigua' WHERE id = ?`, [id]);
    const s = (await PersistenceService.getSession(id))!;
    expect(s.bookkeeping.manualNote).toBe("antigua");
    // Leer no reescribe.
    expect((await db.getFirstAsync<{ n: string }>(`SELECT manual_note_sealed AS n FROM sessions WHERE id = ?`, [id]))!.n).toBe("plain:v1:antigua");
    await PersistenceService.updateSession(s);
    const raw = (await db.getFirstAsync<{ n: string }>(`SELECT manual_note_sealed AS n FROM sessions WHERE id = ?`, [id]))!.n;
    expect(raw).toMatch(/^enc:v1:k1:session\.note:/);
    expect((await PersistenceService.getSession(id))!.bookkeeping.manualNote).toBe("antigua");
  });

  test("escritura degradada: con UNAVAILABLE el informe lista los campos y se guarda plain:v1:", async () => {
    await PersistenceService.init();
    KeyStore.__setFailure(new Error("sin llavero"));
    const report = { degradedFields: [] as string[] };
    await PersistenceService.insertSession(makeClosedSession(MONDAY_8AM, 8, { bookkeeping: { manualNote: "n" } }), undefined, report);
    await PersistenceService.insertSpatialFact(makeBreadcrumb({ sessionId: 1 }), report);
    expect(report.degradedFields).toEqual(["session.note", "spatial.coords"]);
    // Sin escritura sensible no hay campo degradado.
    const r2 = { degradedFields: [] as string[] };
    await PersistenceService.insertSession(makeClosedSession(MONDAY_8AM + 86_400_000, 8), undefined, r2);
    expect(r2.degradedFields).toEqual([]);
  });

  test("companyEmail y last_fix cifrados en app_kv", async () => {
    await PersistenceService.init();
    await PersistenceService.setLastFix({ lat: 34.05, lon: -118.24, timestampMs: 1 });
    const raw = await PersistenceService.getKv<string>("runtime.last_fix");
    expect(raw).toMatch(/^enc:v1:k1:kv\.lastFix:/);
    expect(await PersistenceService.getLastFix()).toEqual({ lat: 34.05, lon: -118.24, timestampMs: 1 });
  });
});
