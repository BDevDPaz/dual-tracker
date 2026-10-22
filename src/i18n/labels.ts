/**
 * Etiquetas de presentación. El código guardado (intent, rol, tipo de traza,
 * motivo) no cambia: solo lo que se lee en pantalla.
 */
import { getLanguage, t, type Language } from "./index";

const SPATIAL_TYPES = ["ENTER", "EXIT", "DWELL", "BREADCRUMB", "ACCURACY_DROP"] as const;
const PACK_ROLES = ["EMPLOYEE_RECEIPT", "EMPLOYEE_PDF", "EMPLOYER_DOSSIER", "EMPLOYER_PDF", "MANIFEST_JSON"] as const;

function translated(key: string, fallbackKey: string, lang: Language): string {
  const label = t(key, {}, lang);
  return label === key ? t(fallbackKey, {}, lang) : label;
}

/** «2 horas 5 minutos». Si el texto no es «Nh Mm», se devuelve tal cual. */
export function spokenDuration(timeString: string, lang: Language = getLanguage()): string {
  const match = /^(\d+)h\s+(\d+)m$/.exec(timeString.trim());
  if (!match) return timeString;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const hourUnit = t(hours === 1 ? "a11y.hour" : "a11y.hours", {}, lang);
  const minuteUnit = t(minutes === 1 ? "a11y.minute" : "a11y.minutes", {}, lang);
  return `${hours} ${hourUnit} ${minutes} ${minuteUnit}`;
}

/** Mañana 5–11, tarde 12–18, y el resto un título neutro (no «Buenos días» de noche). */
export function reminderTitleForHour(hour: number, lang: Language = getLanguage()): string {
  if (hour >= 5 && hour < 12) return t("notifications.reminderMorning", {}, lang);
  if (hour >= 12 && hour < 19) return t("notifications.reminderAfternoon", {}, lang);
  return t("notifications.reminderTitle", {}, lang);
}

export function tSpatialType(type: string, lang: Language = getLanguage()): string {
  const key = (SPATIAL_TYPES as readonly string[]).includes(type) ? `trace.types.${type}` : "trace.types.unknown";
  return translated(key, "trace.types.unknown", lang);
}

export function tPackFileRole(role: string, lang: Language = getLanguage()): string {
  const key = (PACK_ROLES as readonly string[]).includes(role) ? `report.fileRoles.${role}` : "report.fileRoles.unknown";
  return translated(key, "report.fileRoles.unknown", lang);
}

export function tReviewReason(code: string, lang: Language = getLanguage()): string {
  return translated(`reviewReasons.${code}`, "reviewReasons.unknown", lang);
}

export function tLedgerIntent(intent: string, lang: Language = getLanguage()): string {
  return translated(`ledger.${intent}`, "ledger.unknown", lang);
}
