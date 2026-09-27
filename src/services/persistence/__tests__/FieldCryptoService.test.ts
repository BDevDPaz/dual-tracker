/** T4 — FieldCrypto con SecureStore fake. */
import * as SecureStore from "expo-secure-store";
import { PersistenceService } from "../PersistenceService";
import { FieldCryptoService } from "../FieldCryptoService";
import { makeClosedSession, MONDAY_8AM } from "../../../../test/fixtures/session.fixture";

describe("FieldCryptoService", () => {
  test("init crea y guarda la clave en SecureStore (una sola vez)", async () => {
    expect(await FieldCryptoService.init()).toBe(true);
    const key = await SecureStore.getItemAsync("dualtracker.fieldcrypto.key.v1");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  test("seal/open ida y vuelta; nulos y valores heredados sin prefijo", async () => {
    const sealed = await FieldCryptoService.seal("secreto");
    expect(sealed).not.toBe("secreto");
    expect(await FieldCryptoService.open(sealed)).toBe("secreto");
    expect(await FieldCryptoService.seal(null)).toBeNull();
    expect(await FieldCryptoService.open("legado")).toBe("legado");
    expect(await FieldCryptoService.openJson(await FieldCryptoService.sealJson({ a: 1 }))).toEqual({ a: 1 });
    expect(await FieldCryptoService.openJson("plain:v1:{roto")).toBeNull();
  });

  /**
   * TODO(Fase 5 / ambigüedad): la Propuesta de calidad §4.4 pide "texto distinto
   * al plano tras persistir". Hoy FIELD_CRYPTO_AVAILABLE=false (AES-GCM sin
   * implementar, documentado en constants/flags y FieldCryptoService) y el
   * valor se guarda como "plain:v1:<texto>": distinto literalmente, pero el
   * plano sigue legible en SQLite. No se implementa cripto en esta tarea; se
   * deja failing hasta que exista AES-GCM nativo.
   */
  test.failing("tras persistir, la nota no aparece en claro en SQLite", async () => {
    const db = await PersistenceService.init();
    await PersistenceService.insertSession(makeClosedSession(MONDAY_8AM, 8, { bookkeeping: { manualNote: "nota muy privada" } }));
    const row = await db.getFirstAsync<{ manual_note_sealed: string }>(`SELECT manual_note_sealed FROM sessions`);
    expect(row!.manual_note_sealed).not.toContain("nota muy privada");
  });

  test("isEncryptionActive refleja el flag (hoy false: honesto con la UI)", () => {
    expect(FieldCryptoService.isEncryptionActive()).toBe(false);
  });
});
