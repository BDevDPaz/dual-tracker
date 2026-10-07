/**
 * Idioma inicial. El perfil guardado gana; si aún no hay perfil (primer
 * arranque, antes de completar el alta), se usa el idioma del dispositivo.
 * Solo es y en: cualquier otra etiqueta cae al español (idioma base del
 * producto). En Jest el dispositivo se fija en "es" para que la suite no
 * dependa del locale de la máquina.
 */
export type Language = "es" | "en";

export function languageFromLocaleTag(tag: string | null | undefined): Language {
  const primary = (tag ?? "").trim().toLowerCase().split(/[-_]/)[0];
  if (primary === "en") return "en";
  if (primary === "es") return "es";
  return "es";
}

/** Etiqueta BCP 47 del dispositivo (Intl de Hermes). Vacío → "es". */
export function readDeviceLocaleTag(): string {
  try {
    const tag = Intl.DateTimeFormat().resolvedOptions().locale;
    if (tag && tag.trim()) return tag.trim();
  } catch {
    /* Hermes sin Intl completo. */
  }
  return "es";
}

/**
 * Etiqueta que usa el arranque para el idioma por defecto. En test es siempre
 * "es": el locale de Node/CI no es el del teléfono.
 */
export function bootstrapLocaleTag(): string {
  if (process.env.NODE_ENV === "test") return "es";
  return readDeviceLocaleTag();
}

/** Preferencia guardada si es válida; si no, el idioma del dispositivo. */
export function resolveInitialLanguage(stored: unknown, localeTag: string): Language {
  if (stored === "es" || stored === "en") return stored;
  return languageFromLocaleTag(localeTag);
}
