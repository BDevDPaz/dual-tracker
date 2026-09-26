/**
 * SettingsService — Persistencia (Propuesta Técnica §4.6: conservar con esquema de políticas)
 * ============================================================================
 * Se mantiene carga y guardado, pero separando:
 *   - perfil de persona (siempre editable),
 *   - política de empresa (tarifa, multiplicador, radio, correo, overtime,
 *     retención…) detrás de SecurityService,
 *   - preferencias de dispositivo (onboarding, descargo).
 * Onboarding y descargo dejan de vivir en AsyncStorage suelto (GEOTrack usaba
 * las claves wtracker_onboarding_completed / wtracker_disclaimer_accepted):
 * ahora se guardan en SQLite (app_kv).
 */
import type {
  CompanyPolicy,
  DevicePreferences,
  PersonProfile,
  SettingsPatch,
  SettingsSnapshot,
} from "../../core/contracts";
import { DEFAULT_EXIT_DEBOUNCE_MS, DEFAULT_SITE_RADIUS_METERS } from "../../constants/geolocation";
import { DEFAULT_PAYROLL_POLICY_ID } from "../domain/payrollPolicies";
import { FieldCryptoService } from "./FieldCryptoService";
import { PersistenceService } from "./PersistenceService";
import { KV_KEYS } from "./schema";

/** Valores por defecto. Los de perfil/tarifa/multiplicador vienen de GEOTrack. */
export const DEFAULT_PROFILE: PersonProfile = {
  employeeName: "",
  hourlyRate: 25.0,
  language: "es",
  dailyReminderTime: "07:00",
};

export const DEFAULT_COMPANY_POLICY: CompanyPolicy = {
  // GEOTrack traía "LEON'S ELECTRICAL DESIGN" en duro; aquí queda vacío
  // hasta que la zona admin lo configure.
  employerName: "",
  companyEmail: "",
  overtimeMultiplier: 1.5,
  overtimePolicyId: DEFAULT_PAYROLL_POLICY_ID,
  defaultRadiusM: DEFAULT_SITE_RADIUS_METERS,
  // TODO(política): la propuesta no fija el límite de destinos.
  destinationLimit: 20,
  traceRetentionDays: 90,
  traceMode: "PERIMETER",
  exitDebounceMs: DEFAULT_EXIT_DEBOUNCE_MS,
  // Heredado de BackgroundTasks.ts de GEOTrack (FAILSAFE_THRESHOLD_MS = 15 min).
  exitDecisionWindowMs: 15 * 60 * 1000,
  exitDecisionExpiry: "AUTO_IF_CONFIRMED_OUTSIDE",
  // Replica el comportamiento heredado: el tránsito se contaba dentro de la
  // jornada a tarifa normal. TODO: confirmar con el empleador.
  transitPaid: true,
  transitRateMultiplier: 1,
  transitCountsTowardOvertime: true,
};

export const DEFAULT_DEVICE_PREFS: DevicePreferences = {
  onboardingCompleted: false,
  disclosureAcceptedVersion: null,
  disclosureAcceptedAtMs: null,
};

type StoredCompany = Omit<CompanyPolicy, "companyEmail"> & { companyEmailSealed: string | null };

export const SettingsService = {
  async load(): Promise<SettingsSnapshot> {
    const [profile, storedCompany, device] = await Promise.all([
      PersistenceService.getKv<PersonProfile>(KV_KEYS.PROFILE),
      PersistenceService.getKv<StoredCompany>(KV_KEYS.COMPANY),
      PersistenceService.getKv<DevicePreferences>(KV_KEYS.DEVICE),
    ]);

    let company: CompanyPolicy = DEFAULT_COMPANY_POLICY;
    if (storedCompany) {
      const { companyEmailSealed, ...rest } = storedCompany;
      company = {
        ...DEFAULT_COMPANY_POLICY,
        ...rest,
        companyEmail: (await FieldCryptoService.open(companyEmailSealed)) ?? "",
      };
    }

    return {
      profile: { ...DEFAULT_PROFILE, ...(profile ?? {}) },
      company,
      device: { ...DEFAULT_DEVICE_PREFS, ...(device ?? {}) },
    };
  },

  async saveProfile(profile: PersonProfile): Promise<void> {
    await PersistenceService.setKv(KV_KEYS.PROFILE, profile);
  },

  async saveCompany(company: CompanyPolicy): Promise<void> {
    const { companyEmail, ...rest } = company;
    const stored: StoredCompany = {
      ...rest,
      companyEmailSealed: await FieldCryptoService.seal(companyEmail),
    };
    await PersistenceService.setKv(KV_KEYS.COMPANY, stored);
  },

  async saveDevice(device: DevicePreferences): Promise<void> {
    await PersistenceService.setKv(KV_KEYS.DEVICE, device);
  },

  /**
   * Aplica un patch. Los campos de empresa exigen `adminUnlocked` (el estado de
   * desbloqueo es de sesión de UI y lo aporta la capa Aplicación).
   */
  async applyPatch(
    current: SettingsSnapshot,
    patch: SettingsPatch,
    ctx: { adminUnlocked: boolean },
  ): Promise<{ ok: true; next: SettingsSnapshot } | { ok: false; code: "ADMIN_LOCKED" | "INVALID_VALUE" }> {
    if (patch.company && !ctx.adminUnlocked) return { ok: false, code: "ADMIN_LOCKED" };

    const next: SettingsSnapshot = {
      ...current,
      profile: { ...current.profile, ...(patch.profile ?? {}) },
      company: { ...current.company, ...(patch.company ?? {}) },
    };

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(next.profile.dailyReminderTime)) {
      return { ok: false, code: "INVALID_VALUE" };
    }
    if (!(next.profile.hourlyRate >= 0) || !(next.company.overtimeMultiplier >= 1)) {
      return { ok: false, code: "INVALID_VALUE" };
    }
    if (!(next.company.defaultRadiusM > 0)) return { ok: false, code: "INVALID_VALUE" };

    if (patch.profile) await SettingsService.saveProfile(next.profile);
    if (patch.company) await SettingsService.saveCompany(next.company);
    return { ok: true, next };
  },
};
