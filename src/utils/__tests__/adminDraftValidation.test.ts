/** TP-2 (wireframes de Ajustes §10): los rangos de la UI son los del repositorio. */
import { DEFAULT_COMPANY_POLICY } from "../../services/persistence/SettingsService";
import { invalidCompanyFields } from "../../services/domain/policyValidation";
import { MAX_ARRIVAL_DWELL_MS } from "../../services/domain/arrivalDwell";
import { ADMIN_FIELD_LIMITS, adminDraftErrors, isCompanyEmail } from "../adminDraftValidation";

const ok = { overtimeMultiplier: "1.5", traceRetentionDays: "30", defaultRadiusM: "200", arrivalDwellMin: "0", companyEmail: "" };

describe("adminDraftValidation", () => {
  test("los límites coinciden con invalidCompanyFields en los bordes", () => {
    const L = ADMIN_FIELD_LIMITS;
    const bad = (patch: Partial<typeof DEFAULT_COMPANY_POLICY>) => invalidCompanyFields({ ...DEFAULT_COMPANY_POLICY, ...patch });
    expect(bad({ overtimeMultiplier: L.overtimeMultiplier.min })).toEqual([]);
    expect(bad({ overtimeMultiplier: L.overtimeMultiplier.max })).toEqual([]);
    expect(bad({ overtimeMultiplier: L.overtimeMultiplier.max + 0.01 })).toContain("overtimeMultiplier");
    expect(bad({ traceRetentionDays: L.traceRetentionDays.max })).toEqual([]);
    expect(bad({ traceRetentionDays: L.traceRetentionDays.max + 1 })).toContain("traceRetentionDays");
    expect(bad({ traceRetentionDays: L.traceRetentionDays.min - 1 })).toContain("traceRetentionDays");
    expect(bad({ defaultRadiusM: L.defaultRadiusM.max })).toEqual([]);
    expect(bad({ defaultRadiusM: L.defaultRadiusM.max + 1 })).toContain("defaultRadiusM");
    expect(L.arrivalDwellMin.max * 60_000).toBe(MAX_ARRIVAL_DWELL_MS);
  });

  test("errores por campo", () => {
    expect(adminDraftErrors(ok)).toEqual({});
    expect(adminDraftErrors({ ...ok, overtimeMultiplier: "" })).toEqual({ overtimeMultiplier: "number" });
    expect(adminDraftErrors({ ...ok, overtimeMultiplier: "0,9" })).toEqual({ overtimeMultiplier: "multiplierRange" });
    expect(adminDraftErrors({ ...ok, overtimeMultiplier: "10,5" })).toEqual({ overtimeMultiplier: "multiplierRange" });
    expect(adminDraftErrors({ ...ok, traceRetentionDays: "0" })).toEqual({ traceRetentionDays: "retentionRange" });
    expect(adminDraftErrors({ ...ok, traceRetentionDays: "7.5" })).toEqual({ traceRetentionDays: "retentionRange" });
    expect(adminDraftErrors({ ...ok, defaultRadiusM: "10001" })).toEqual({ defaultRadiusM: "radiusRange" });
    expect(adminDraftErrors({ ...ok, defaultRadiusM: "0" })).toEqual({ defaultRadiusM: "radiusRange" });
    expect(adminDraftErrors({ ...ok, arrivalDwellMin: "31" })).toEqual({ arrivalDwellMin: "dwellRange" });
    expect(adminDraftErrors({ ...ok, arrivalDwellMin: "-1" })).toEqual({ arrivalDwellMin: "dwellRange" });
    expect(adminDraftErrors({ ...ok, arrivalDwellMin: "2.5" })).toEqual({ arrivalDwellMin: "dwellRange" });
    expect(adminDraftErrors({ ...ok, companyEmail: "rrhh" })).toEqual({ companyEmail: "email" });
  });

  test("correo de empresa: vacío vale; si hay texto, nombre@dominio", () => {
    expect(isCompanyEmail("")).toBe(true);
    expect(isCompanyEmail("  rrhh@empresa.com ")).toBe(true);
    expect(isCompanyEmail("rrhh@empresa")).toBe(false);
    expect(isCompanyEmail("rrhh empresa@x.com")).toBe(false);
  });
});
