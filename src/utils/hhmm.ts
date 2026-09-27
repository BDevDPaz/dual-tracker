/**
 * Máscara "HH:mm" para Input (almuerzo, recordatorio, calendario, edición).
 * Solo dígitos, máximo 4, dos puntos automáticos tras la hora: "1230" → "12:30".
 */
export const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function maskHHmm(raw: string): string {
  const digits = (raw ?? "").replace(/\D/g, "").slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export function isValidHHmm(value: string): boolean {
  return HHMM_RE.test((value ?? "").trim());
}
