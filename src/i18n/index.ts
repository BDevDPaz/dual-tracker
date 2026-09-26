/**
 * i18n — t("seccion.clave", { param }) con caída a ES.
 * El idioma activo lo fija el perfil (settings.profile.language) vía setLanguage.
 */
import { en } from "./en";
import { es } from "./es";

export type Language = "es" | "en";

let current: Language = "es";

export function setLanguage(lang: Language): void {
  current = lang;
}

export function getLanguage(): Language {
  return current;
}

function lookup(dict: unknown, path: string[]): string | undefined {
  let node: unknown = dict;
  for (const p of path) {
    if (node && typeof node === "object" && p in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[p];
    } else return undefined;
  }
  return typeof node === "string" ? node : undefined;
}

/** Traduce una clave con interpolación {param}. Devuelve la clave si no existe. */
export function t(key: string, params: Record<string, string | number> = {}, lang: Language = current): string {
  const path = key.split(".");
  const raw = (lang === "en" ? lookup(en, path) : undefined) ?? lookup(es, path) ?? key;
  return raw.replace(/\{(\w+)\}/g, (_m, k: string) => String(params[k] ?? `{${k}}`));
}

export { es, en };
export { MICROCOPY, MICROCOPY_VERSION } from "./microcopy";
