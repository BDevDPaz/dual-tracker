/** T4 — SettingsService: email de empresa sellado; patch de empresa exige admin. */
import { PersistenceService } from "../PersistenceService";
import { KV_KEYS } from "../schema";
import { DEFAULT_COMPANY_POLICY, DEFAULT_PROFILE, SettingsService } from "../SettingsService";

describe("SettingsService", () => {
  beforeEach(() => PersistenceService.init());

  test("valores por defecto: CA_DAILY8_WEEKLY40_v1 y aviso no aceptado", async () => {
    const s = await SettingsService.load();
    expect(s.company.overtimePolicyId).toBe("CA_DAILY8_WEEKLY40_v1");
    expect(s.device.disclosureAcceptedVersion).toBeNull();
    expect(s.company.employerPortalEnabled).toBe(false);
    expect(s.company.employerPortalUrl).toBeNull();
    expect(s.company.destinationLimit).toBe(20);
    expect(s.company.defaultRadiusM).toBe(150);
    expect(s.company.arrivalDwellMs).toBe(120_000);
    expect(s.company.arrivalAccuracyM).toBe(50);
    expect(s.company.arrivalReadings).toBe(2);
  });

  test("companyEmail se guarda sellado y se abre al cargar", async () => {
    await SettingsService.saveCompany({ ...DEFAULT_COMPANY_POLICY, companyEmail: "rrhh@empresa.test" });
    const raw = await PersistenceService.getKv<Record<string, unknown>>(KV_KEYS.COMPANY);
    expect(raw).not.toHaveProperty("companyEmail");
    expect(raw?.companyEmailSealed).toMatch(/^enc:v1:k1:settings\.companyEmail:/);
    expect(JSON.stringify(raw)).not.toContain("rrhh@empresa.test");
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

  test("sin perfil el idioma de test es es; un perfil guardado conserva en", async () => {
    expect((await SettingsService.load()).profile.language).toBe("es");
    await SettingsService.saveProfile({ ...DEFAULT_PROFILE, language: "en", employeeName: "Ana" });
    const loaded = await SettingsService.load();
    expect(loaded.profile.language).toBe("en");
    expect(loaded.profile.employeeName).toBe("Ana");
  });

  test("el portal solo acepta https y no se enciende sin URL", async () => {
    const cur = await SettingsService.load();
    expect(
      await SettingsService.applyPatch(cur, { company: { employerPortalUrl: "http://portal.example/in" } }, { adminUnlocked: true }),
    ).toEqual({ ok: false, code: "PORTAL_URL_INVALID" });
    expect(
      await SettingsService.applyPatch(cur, { company: { employerPortalEnabled: true } }, { adminUnlocked: true }),
    ).toEqual({ ok: false, code: "PORTAL_URL_INVALID" });
    const ok = await SettingsService.applyPatch(
      cur,
      { company: { employerPortalEnabled: true, employerPortalUrl: "https://portal.example/in" } },
      { adminUnlocked: true },
    );
    expect(ok.ok && ok.next.company.employerPortalUrl).toBe("https://portal.example/in");
    expect((await SettingsService.load()).company.employerPortalEnabled).toBe(true);
  });

  test("profile.theme: por defecto dark, se persiste y rechaza valores desconocidos", async () => {
    const cur = await SettingsService.load();
    expect(cur.profile.theme).toBe("dark");
    const r = await SettingsService.applyPatch(cur, { profile: { theme: "light" } }, { adminUnlocked: false });
    expect(r.ok).toBe(true);
    expect((await SettingsService.load()).profile.theme).toBe("light");
    const contrast = await SettingsService.applyPatch(cur, { profile: { highContrast: true } }, { adminUnlocked: false });
    expect(contrast.ok && contrast.next.profile.highContrast).toBe(true);
    expect((await SettingsService.load()).profile.highContrast).toBe(true);
    expect((await SettingsService.load()).profile.comprobanteTheme).toBeUndefined();
    const dark = await SettingsService.applyPatch(await SettingsService.load(), { profile: { comprobanteTheme: "dark" } }, { adminUnlocked: false });
    expect(dark.ok && dark.next.profile.comprobanteTheme).toBe("dark");
    expect(await SettingsService.applyPatch(await SettingsService.load(), { profile: { comprobanteTheme: "sepia" as "dark" } }, { adminUnlocked: false })).toEqual({
      ok: false,
      code: "INVALID_VALUE",
    });
    expect(
      await SettingsService.applyPatch(cur, { profile: { theme: "sepia" as never } }, { adminUnlocked: false }),
    ).toEqual({ ok: false, code: "INVALID_VALUE" });
  });
});
