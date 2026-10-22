/**
 * i18n — t("seccion.clave", { param }) con caída a ES.
 * El idioma activo lo fija el perfil (settings.profile.language) vía setLanguage.
 * useLanguage() / useSyncExternalStore re-renderiza cada componente suscrito
 * (tabs montadas, cabeceras, modales, pills) en el mismo instante.
 */
import { useSyncExternalStore } from "react";
import { en } from "./en";
import { es } from "./es";
import { bootstrapLocaleTag, resolveInitialLanguage, type Language } from "./locale";

export type { Language };

const listeners = new Set<() => void>();

let current: Language = resolveInitialLanguage(undefined, bootstrapLocaleTag());

export function setLanguage(lang: Language): void {
  if (lang !== "es" && lang !== "en") return;
  if (current === lang) return;
  current = lang;
  for (const listener of listeners) listener();
}

export function getLanguage(): Language {
  return current;
}

export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Idioma activo. Provoca re-render al cambiar, también dentro de React.memo. */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage);
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

const HEALTH_VALUE_KEY: Record<string, string> = {
  running: "health.values.running",
  stopped: "health.values.stopped",
  "n/a": "health.values.na",
  unknown: "health.values.unknown",
  restricted: "health.values.restricted",
  unrestricted: "health.values.unrestricted",
};

/** Estado crudo de un sensor (running, n/a, …) → etiqueta del idioma activo. */
export function tHealthValue(value: string): string {
  const key = HEALTH_VALUE_KEY[value];
  if (!key) return value;
  const label = t(key);
  return label === key ? value : label;
}

const LINE_KIND_KEY: Record<string, string> = {
  REGULAR: "reports.regular",
  OVERTIME_DAILY: "reports.overtime",
  OVERTIME_WEEKLY: "reports.overtime",
  OVERTIME_DOUBLE: "reports.doubleTime",
  TRANSIT: "reports.transit",
  LUNCH_DEDUCTION: "reports.lunch",
  PAUSE_DEDUCTION: "reports.pause",
};

/** Tipo de línea de nómina (REGULAR, …) → etiqueta del idioma activo. */
export function tLineKind(kind: string): string {
  const key = LINE_KIND_KEY[kind];
  if (!key) return kind;
  const label = t(key);
  return label === key ? kind : label;
}

/**
 * Aviso del statement (CODIGO o CODIGO#idJornada) → etiqueta legible del idioma.
 * Solo presentación: el código guardado/sellado no cambia. Código desconocido → se
 * devuelve tal cual (el llamador escapa HTML).
 */
export function tWarning(code: string, lang: Language = current): string {
  const m = /^([A-Z0-9_]+)(?:#(\d+))?$/.exec(code);
  if (!m) return code;
  const key = `warningCodes.${m[1]}`;
  const label = t(key, {}, lang);
  if (label === key) return code;
  return m[2] ? `${label} (${t("warningCodes.sessionRef", { id: m[2] }, lang)})` : label;
}

export { es, en };
export { MICROCOPY, MICROCOPY_VERSION } from "./microcopy";
export { bootstrapLocaleTag, languageFromLocaleTag, readDeviceLocaleTag, resolveInitialLanguage } from "./locale";
