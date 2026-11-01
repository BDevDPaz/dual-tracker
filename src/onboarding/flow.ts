/**
 * Decisiones del alta (estructura). La UI no inventa un visto: cada fila
 * sale del estado que publica PermissionsHealthService.
 */
import type { OsSettingsTarget, PermissionState } from "../core/contracts";
import type { LegalBlock } from "../i18n/legal";
import { ANDROID_13_API, showBatteryCard, type BatteryOptimizationState } from "../utils/permissionGuidance";

export type LocationAccuracy = "fine" | "coarse" | "unknown" | "n/a";
export type PermissionSubstep = "fine" | "background" | "notifications";
export type HomeBannerId = "background" | "battery" | "notifications";

export interface ReadyRow {
  id: "fine" | "background" | "battery" | "notifications" | "reminder" | "rate";
  /** Visto solo con el estado positivo confirmado. La tarifa es informativa. */
  ok: boolean;
  kind: "status" | "info";
  /** Ajuste que abre el aviso. La tarifa no abre nada. */
  settings: OsSettingsTarget | null;
}

const REMINDER_STEP_MINUTES = 15;
const DAY_MINUTES = 24 * 60;
const DEFAULT_REMINDER_MINUTES = 7 * 60;

/** Ubicación precisa. En iOS el SO no distingue coarse (accuracy "n/a"). */
export function preciseLocationOk(foreground: PermissionState, accuracy: LocationAccuracy): boolean {
  if (foreground !== "granted") return false;
  return accuracy === "fine" || accuracy === "n/a";
}

/**
 * Android 12 y anteriores no tienen el diálogo POST_NOTIFICATIONS.
 * Sin nivel de API no se omite: no hay prueba de que el sistema no lo pida.
 */
export function notificationsPromptAvailable(platform: string, apiLevel: number | null): boolean {
  if (platform !== "android") return true;
  if (apiLevel == null) return true;
  return apiLevel >= ANDROID_13_API;
}

export function permissionSubsteps(platform: string, apiLevel: number | null): PermissionSubstep[] {
  const steps: PermissionSubstep[] = ["fine", "background"];
  if (notificationsPromptAvailable(platform, apiLevel)) steps.push("notifications");
  return steps;
}

export function substepIndex(steps: readonly PermissionSubstep[], focus: string | undefined): number {
  if (!focus) return 0;
  const index = steps.indexOf(focus as PermissionSubstep);
  return index >= 0 ? index : 0;
}

/** Los dos ajustes opcionales. En iOS la batería no existe: basta el segundo plano. */
export function backgroundBundleActive(input: {
  platform: string;
  background: PermissionState;
  battery: BatteryOptimizationState;
}): boolean {
  if (input.background !== "granted") return false;
  if (!showBatteryCard({ platform: input.platform, battery: input.battery })) return true;
  return input.battery === "unrestricted";
}

/**
 * Banners de Hoy. Solo si el sistema confirma el hueco.
 * "unknown" no es «apagado» y no pinta un aviso.
 */
export function homeOptionalBanners(input: {
  platform: string;
  background: PermissionState;
  battery: BatteryOptimizationState;
  notifications: PermissionState;
}): HomeBannerId[] {
  const banners: HomeBannerId[] = [];
  if (input.background === "denied" || input.background === "blocked") banners.push("background");
  if (input.platform === "android" && input.battery === "restricted") banners.push("battery");
  if (input.notifications === "denied" || input.notifications === "blocked") banners.push("notifications");
  return banners;
}

export function homeBannerSettingsTarget(id: HomeBannerId): OsSettingsTarget {
  if (id === "battery") return "BATTERY";
  if (id === "notifications") return "NOTIFICATIONS";
  return "LOCATION";
}

export function readyRows(input: {
  platform: string;
  foreground: PermissionState;
  accuracy: LocationAccuracy;
  background: PermissionState;
  battery: BatteryOptimizationState;
  notifications: PermissionState;
}): ReadyRow[] {
  const rows: ReadyRow[] = [
    {
      id: "fine",
      ok: preciseLocationOk(input.foreground, input.accuracy),
      kind: "status",
      settings: "LOCATION",
    },
    {
      id: "background",
      ok: input.background === "granted",
      kind: "status",
      settings: "LOCATION",
    },
  ];
  if (showBatteryCard({ platform: input.platform, battery: input.battery })) {
    rows.push({
      id: "battery",
      ok: input.battery === "unrestricted",
      kind: "status",
      settings: "BATTERY",
    });
  }
  rows.push({
    id: "notifications",
    ok: input.notifications === "granted",
    kind: "status",
    settings: "NOTIFICATIONS",
  });
  rows.push({
    id: "reminder",
    ok: input.notifications === "granted",
    kind: "status",
    settings: "NOTIFICATIONS",
  });
  rows.push({ id: "rate", ok: true, kind: "info", settings: null });
  return rows;
}

export function readyHeadline(rows: readonly ReadyRow[]): "onboarding.readyTitle" | "onboarding.readyAlmost" {
  const pending = rows.some((row) => row.kind === "status" && !row.ok);
  return pending ? "onboarding.readyAlmost" : "onboarding.readyTitle";
}

export function nameNeedsError(name: string): boolean {
  return name.trim().length < 2;
}

export function lockedRateAmount(rate: number): string {
  return (Number.isFinite(rate) ? rate : 0).toFixed(2);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Salto de 15 minutos. Una hora suelta se encaja en la rejilla antes de moverla. */
export function stepReminderTime(hhmm: string, direction: -1 | 1): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  const raw = match ? Number(match[1]) * 60 + Number(match[2]) : DEFAULT_REMINDER_MINUTES;
  const snapped = Math.round(raw / REMINDER_STEP_MINUTES) * REMINDER_STEP_MINUTES;
  const next = snapped + direction * REMINDER_STEP_MINUTES;
  const mod = ((next % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return `${pad(Math.floor(mod / 60))}:${pad(mod % 60)}`;
}

export function formatReminderClock(hhmm: string, hour24: boolean): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!match) return hhmm;
  if (hour24) return `${match[1]}:${match[2]}`;
  const hour = Number(match[1]);
  const suffix = hour < 12 ? "AM" : "PM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${match[2]} ${suffix}`;
}

/** hourCycle del dispositivo. Sin ciclo, se mira si la muestra de la tarde lleva AM/PM. */
export function clockIs24Hour(hourCycle: string | undefined, afternoonSample: string): boolean {
  if (hourCycle === "h23" || hourCycle === "h24") return true;
  if (hourCycle === "h11" || hourCycle === "h12") return false;
  return !/\b(am|pm)\b/i.test(afternoonSample);
}

export function readDeviceHour24(): boolean {
  try {
    const fmt = new Intl.DateTimeFormat(undefined, { hour: "numeric" });
    return clockIs24Hour(fmt.resolvedOptions().hourCycle, fmt.format(new Date(2020, 0, 1, 15, 0, 0)));
  } catch {
    return false;
  }
}

export interface DisclosureSection {
  id: "during" | "retention" | "purpose";
  headingKey: "onboarding.avisoDuring" | "onboarding.avisoRetention" | "onboarding.avisoPurpose";
  items: LegalBlock[];
}

const DISCLOSURE_GROUPS: { id: DisclosureSection["id"]; headingKey: DisclosureSection["headingKey"]; keys: string[] }[] = [
  { id: "during", headingKey: "onboarding.avisoDuring", keys: ["perimeter", "breadcrumb", "lunch"] },
  { id: "retention", headingKey: "onboarding.avisoRetention", keys: ["retention"] },
  { id: "purpose", headingKey: "onboarding.avisoPurpose", keys: ["recipients", "purpose"] },
];

/**
 * Tres bloques visuales. El texto de cada ítem es el de legal.ts, en el
 * mismo orden: no se añaden frases (ni «en el teléfono» ni el cierre de 12 h,
 * que ese texto no contiene).
 */
export function disclosureSections(blocks: readonly LegalBlock[]): DisclosureSection[] {
  const byKey = new Map(blocks.map((block) => [block.key, block]));
  return DISCLOSURE_GROUPS.map((group) => ({
    id: group.id,
    headingKey: group.headingKey,
    items: group.keys.flatMap((key) => {
      const block = byKey.get(key);
      return block ? [block] : [];
    }),
  })).filter((section) => section.items.length > 0);
}
