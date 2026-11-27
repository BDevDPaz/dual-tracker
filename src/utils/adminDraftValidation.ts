/**
 * Validación en línea del borrador de la zona administrativa (Ajustes).
 * Los rangos son los mismos que aplica el repositorio al guardar
 * (services/domain/policyValidation.invalidCompanyFields); la UI no importa
 * servicios, así que se repiten aquí y un test comprueba que coinciden.
 * Un valor fuera de rango se marca en su campo: no se recorta en silencio.
 */
export const ADMIN_FIELD_LIMITS = {
  overtimeMultiplier: { min: 1, max: 10 },
  traceRetentionDays: { min: 1, max: 3650 },
  defaultRadiusM: { min: 1, max: 10_000 },
  /** Igual que MAX_ARRIVAL_DWELL_MS (30 min). */
  arrivalDwellMin: { min: 0, max: 30 },
} as const;

export type AdminFieldError = "number" | "multiplierRange" | "retentionRange" | "radiusRange" | "dwellRange" | "email";

export interface AdminDraftFields {
  overtimeMultiplier: string;
  traceRetentionDays: string;
  defaultRadiusM: string;
  arrivalDwellMin: string;
  companyEmail: string;
}

export type AdminDraftErrors = Partial<Record<keyof AdminDraftFields, AdminFieldError>>;

/** "1,5" y "1.5" valen lo mismo. Vacío → NaN. */
export function parseDraftNumber(s: string): number {
  return s.trim() === "" ? NaN : Number(s.trim().replace(",", "."));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Correo de empresa: vacío vale (no configurado); si hay texto, nombre@dominio.tld. */
export function isCompanyEmail(s: string): boolean {
  const v = s.trim();
  return v === "" || EMAIL_RE.test(v);
}

export function adminDraftErrors(d: AdminDraftFields): AdminDraftErrors {
  const errors: AdminDraftErrors = {};
  const L = ADMIN_FIELD_LIMITS;

  const multiplier = parseDraftNumber(d.overtimeMultiplier);
  if (!Number.isFinite(multiplier)) errors.overtimeMultiplier = "number";
  else if (multiplier < L.overtimeMultiplier.min || multiplier > L.overtimeMultiplier.max) errors.overtimeMultiplier = "multiplierRange";

  const retention = parseDraftNumber(d.traceRetentionDays);
  if (!Number.isFinite(retention)) errors.traceRetentionDays = "number";
  else if (!Number.isInteger(retention) || retention < L.traceRetentionDays.min || retention > L.traceRetentionDays.max) errors.traceRetentionDays = "retentionRange";

  const radius = parseDraftNumber(d.defaultRadiusM);
  if (!Number.isFinite(radius)) errors.defaultRadiusM = "number";
  else if (Math.round(radius) < L.defaultRadiusM.min || radius > L.defaultRadiusM.max) errors.defaultRadiusM = "radiusRange";

  const dwell = parseDraftNumber(d.arrivalDwellMin);
  if (!Number.isFinite(dwell)) errors.arrivalDwellMin = "number";
  else if (!Number.isInteger(dwell) || dwell < L.arrivalDwellMin.min || dwell > L.arrivalDwellMin.max) errors.arrivalDwellMin = "dwellRange";

  if (!isCompanyEmail(d.companyEmail)) errors.companyEmail = "email";
  return errors;
}
