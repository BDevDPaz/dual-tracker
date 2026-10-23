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
import type * as SQLite from "expo-sqlite";
import type {
  CompanyPolicy,
  DevicePreferences,
  PersonProfile,
  SettingsPatch,
  SettingsSnapshot,
} from "../../core/contracts";
import { DEFAULT_SITE_RADIUS_METERS } from "../../constants/geolocation";
import { parsePortalUrl } from "./employerPortal";
import {
  DEFAULT_DESTINATION_LIMIT,
  DEFAULT_EXIT_DEBOUNCE_MS,
  DEFAULT_EXIT_DECISION_WINDOW_MS,
  DEFAULT_TRACE_RETENTION_DAYS,
} from "../../config/provisional";
import { bootstrapLocaleTag, resolveInitialLanguage } from "../../i18n/locale";
import { invalidCompanyFields, sanitizeCompanyPolicy } from "../domain/policyValidation";
import { DEFAULT_PAYROLL_POLICY_ID } from "../domain/payrollPolicies";
import { setCorporateTimezone } from "../../utils/dateUtils";
import { markPersisted } from "../../core/refresh/dataRevision";
import { FieldCryptoService } from "./FieldCryptoService";
import { PersistenceService } from "./PersistenceService";
import { KV_KEYS } from "./schema";

/** Valores por defecto. Los de perfil/tarifa/multiplicador vienen de GEOTrack. */
export const DEFAULT_PROFILE: PersonProfile = {
  employeeName: "",
  hourlyRate: 25.0,
  // Fallback de producto. load() lo sustituye por el idioma del dispositivo
  // cuando el perfil aún no se ha guardado (ver resolveInitialLanguage).
  language: "es",
  dailyReminderTime: "07:00",
  theme: "dark",
  highContrast: false,
};

export const DEFAULT_COMPANY_POLICY: CompanyPolicy = {
  // GEOTrack traía "LEON'S ELECTRICAL DESIGN" en duro; aquí queda vacío
  // hasta que la zona admin lo configure.
  employerName: "",
  companyEmail: "",
  overtimeMultiplier: 1.5,
  overtimePolicyId: DEFAULT_PAYROLL_POLICY_ID,
  defaultRadiusM: DEFAULT_SITE_RADIUS_METERS,
  destinationLimit: DEFAULT_DESTINATION_LIMIT,
  traceRetentionDays: DEFAULT_TRACE_RETENTION_DAYS,
  traceMode: "PERIMETER",
  exitDebounceMs: DEFAULT_EXIT_DEBOUNCE_MS,
  exitDecisionWindowMs: DEFAULT_EXIT_DECISION_WINDOW_MS,
  employerPortalEnabled: false,
  employerPortalUrl: null,
  exitDecisionExpiry: "AUTO_IF_CONFIRMED_OUTSIDE",
  // Replica el comportamiento heredado: el tránsito se contaba dentro de la
  // jornada a tarifa normal. TODO: confirmar con el empleador.
  transitPaid: true,
  transitRateMultiplier: 1,
  transitCountsTowardOvertime: true,
  timezone: "America/Los_Angeles",
  /** Espera de 2 min antes del fichaje automático. 0 sigue siendo inmediato. */
  arrivalDwellMs: 120_000,
  /** Precisión máxima de una lectura «buena». Por encima solo se pregunta. */
  arrivalAccuracyM: 50,
  /** Lecturas buenas dentro del radio antes del fichaje automático. */
  arrivalReadings: 2,
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
      company = sanitizeCompanyPolicy(
        {
          ...rest,
          companyEmail: (await FieldCryptoService.decrypt("settings.companyEmail", KV_KEYS.COMPANY, companyEmailSealed).catch(() => null)) ?? "",
        },
        DEFAULT_COMPANY_POLICY,
      );
    }
    setCorporateTimezone(company.timezone);

    return {
      profile: {
        ...DEFAULT_PROFILE,
        ...(profile ?? {}),
        language: resolveInitialLanguage(profile?.language, bootstrapLocaleTag()),
      },
      company,
      device: { ...DEFAULT_DEVICE_PREFS, ...(device ?? {}) },
    };
  },

  async saveProfile(profile: PersonProfile): Promise<void> {
    await PersistenceService.setKv(KV_KEYS.PROFILE, profile);
    markPersisted("settings");
  },

  async saveCompany(company: CompanyPolicy, database?: SQLite.SQLiteDatabase): Promise<void> {
    const invalid = invalidCompanyFields(company);
    if (invalid.length) throw new Error(`INVALID_COMPANY_POLICY:${invalid.join(",")}`);
    setCorporateTimezone(company.timezone);
    const { companyEmail, ...rest } = company;
    const stored: StoredCompany = {
      ...rest,
      companyEmailSealed: (await FieldCryptoService.encrypt("settings.companyEmail", KV_KEYS.COMPANY, companyEmail)).stored,
    };
    await PersistenceService.setKv(KV_KEYS.COMPANY, stored, database);
    markPersisted("settings");
  },

  async saveDevice(device: DevicePreferences): Promise<void> {
    await PersistenceService.setKv(KV_KEYS.DEVICE, device);
    markPersisted("settings");
  },

  /**
   * Aplica un patch. Los campos de empresa exigen `adminUnlocked` (el estado de
   * desbloqueo es de sesión de UI y lo aporta la capa Aplicación).
   */
  async applyPatch(
    current: SettingsSnapshot,
    patch: SettingsPatch,
    ctx: { adminUnlocked: boolean },
  ): Promise<{ ok: true; next: SettingsSnapshot } | { ok: false; code: "ADMIN_LOCKED" | "INVALID_VALUE" | "PORTAL_URL_INVALID" }> {
    if (patch.company && !ctx.adminUnlocked) return { ok: false, code: "ADMIN_LOCKED" };
    // El historial de calendario solo cambia por el caso de uso de §5.1 (prospectivo + ledger).
    if (patch.company && "calendarHistory" in patch.company) return { ok: false, code: "INVALID_VALUE" };

    const next: SettingsSnapshot = {
      ...current,
      profile: { ...current.profile, ...(patch.profile ?? {}) },
      company: { ...current.company, ...(patch.company ?? {}) },
    };

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(next.profile.dailyReminderTime)) {
      return { ok: false, code: "INVALID_VALUE" };
    }
    if (!Number.isFinite(next.profile.hourlyRate) || next.profile.hourlyRate < 0) return { ok: false, code: "INVALID_VALUE" };
    if (next.profile.language !== "es" && next.profile.language !== "en") return { ok: false, code: "INVALID_VALUE" };
    if (invalidCompanyFields(next.company).length) return { ok: false, code: "INVALID_VALUE" };
    const portalUrl = next.company.employerPortalUrl ?? "";
    const portalParsed = parsePortalUrl(portalUrl);
    if (portalUrl.trim() && !portalParsed.ok) return { ok: false, code: "PORTAL_URL_INVALID" };
    if (next.company.employerPortalEnabled === true && !portalParsed.ok) return { ok: false, code: "PORTAL_URL_INVALID" };
    if (next.profile.theme !== undefined && !["system", "dark", "light"].includes(next.profile.theme)) {
      return { ok: false, code: "INVALID_VALUE" };
    }
    if (next.profile.highContrast !== undefined && typeof next.profile.highContrast !== "boolean") {
      return { ok: false, code: "INVALID_VALUE" };
    }
    if (next.profile.comprobanteTheme !== undefined && next.profile.comprobanteTheme !== "light" && next.profile.comprobanteTheme !== "dark") {
      return { ok: false, code: "INVALID_VALUE" };
    }

    if (patch.profile) await SettingsService.saveProfile(next.profile);
    if (patch.company) await SettingsService.saveCompany(next.company);
    return { ok: true, next };
  },
};
