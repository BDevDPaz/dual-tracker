/**
 * JSON canónico (claves ordenadas, sin espacios) para que el mismo contenido
 * produzca siempre el mismo hash en el dispositivo del empleado y en el del
 * empleador (Propuesta Técnica §5.3 y §5.10).
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortDeep(v);
    }
    return out;
  }
  return value;
}
