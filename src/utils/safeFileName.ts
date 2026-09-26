/**
 * Nombre de archivo seguro para artefactos (Propuesta Técnica §4.5:
 * "El archivo se nombra de forma segura y se trata como artefacto").
 * Solo [A-Za-z0-9._-], longitud acotada, sin rutas.
 */
export function safeFileName(raw: string, extension: string): string {
  const base = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+/, "")
    .slice(0, 80);
  const ext = extension.replace(/[^A-Za-z0-9]/g, "");
  return `${base || "artefacto"}.${ext}`;
}
