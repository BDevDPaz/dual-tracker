/**
 * Espera opcional antes del fichaje automático.
 * 0 ms (o ausente) es el comportamiento de siempre: la llegada fiable entra ya.
 * Un valor del sitio gana al de la empresa. No cambia la fórmula de la nómina:
 * cuando la espera se cumple, la hora de llegada sigue siendo la primera
 * lectura dentro del sitio.
 */
export const MAX_ARRIVAL_DWELL_MS = 30 * 60_000;

export function normalizeArrivalDwellMs(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value < 0 || value > MAX_ARRIVAL_DWELL_MS) return null;
  return value;
}

/** Milisegundos que hay que permanecer dentro antes del auto check-in. */
export function resolveArrivalDwellMs(
  site: { arrivalDwellMs?: number | null } | null | undefined,
  company: { arrivalDwellMs?: number | null },
): number {
  if (site && site.arrivalDwellMs !== null && site.arrivalDwellMs !== undefined) return site.arrivalDwellMs > 0 ? site.arrivalDwellMs : 0;
  const globalMs = company.arrivalDwellMs;
  return typeof globalMs === "number" && globalMs > 0 ? globalMs : 0;
}
