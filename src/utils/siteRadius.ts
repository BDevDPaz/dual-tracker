/**
 * Radio de geocerca tecleado en Sitios. Vacío, NaN o ≤ 0 no es un radio:
 * la pantalla lo explica y no lo guarda. El redondeo es el que ya usaba el alta.
 */
export function parseSiteRadius(raw: string): number | null {
  const text = raw.trim().replace(",", ".");
  if (text === "") return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0) return null;
  const rounded = Math.round(n);
  return rounded > 0 ? rounded : null;
}
