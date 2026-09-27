/** T4 — SettingsService: email de empresa sellado; patch de empresa exige admin. */
import { PersistenceService } from "../PersistenceService";
import { KV_KEYS } from "../schema";
import { DEFAULT_COMPANY_POLICY, SettingsService } from "../SettingsService";

describe("SettingsService", () => {
  beforeEach(() => PersistenceService.init());

  test("valores por defecto: CA_DAILY8_WEEKLY40_v1 y aviso no aceptado", async () => {
    const s = await SettingsService.load();
    expect(s.company.overtimePolicyId).toBe("CA_DAILY8_WEEKLY40_v1");
    expect(s.device.disclosureAcceptedVersion).toBeNull();
  });

  test("companyEmail se guarda sellado y se abre al cargar", async () => {
    await SettingsService.saveCompany({ ...DEFAULT_COMPANY_POLICY, companyEmail: "rrhh@empresa.test" });
    const raw = await PersistenceService.getKv<Record<string, unknown>>(KV_KEYS.COMPANY);
    expect(raw).not.toHaveProperty("companyEmail");
    expect(raw?.companyEmailSealed).toMatch(/^plain:v1:|^aesgcm:v1:/);
    expect((await SettingsService.load()).company.companyEmail).toBe("rrhh@empresa.test");
  });

  test("applyPatch: empresa bloqueada sin admin; valida hora y tarifa", async () => {
    const cur = await SettingsService.load();
    expect(await SettingsService.applyPatch(cur, { company: { overtimeMultiplier: 2 } }, { adminUnlocked: false })).toEqual({ ok: false, code: "ADMIN_LOCKED" });
    expect(await SettingsService.applyPatch(cur, { profile: { dailyReminderTime: "25:00" } }, { adminUnlocked: false })).toEqual({ ok: false, code: "INVALID_VALUE" });
    expect(await SettingsService.applyPatch(cur, { profile: { hourlyRate: -1 } }, { adminUnlocked: false })).toEqual({ ok: false, code: "INVALID_VALUE" });
    const ok = await SettingsService.applyPatch(cur, { company: { overtimeMultiplier: 2 } }, { adminUnlocked: true });
    expect(ok.ok && ok.next.company.overtimeMultiplier).toBe(2);
    expect((await SettingsService.load()).company.overtimeMultiplier).toBe(2);
  });
});
