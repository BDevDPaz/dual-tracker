/**
 * Decisiones de la guía de permisos (onboarding, Salud y Soporte).
 * Nada de aquí bloquea el alta, VALIDADA por batería, ni el pago.
 */
import type { OsSettingsTarget, PermissionState } from "../core/contracts";

/** Android 11: el segundo plano «todo el tiempo» vive en los ajustes de la app. */
export const ANDROID_11_API = 30;
/** Android 13: POST_NOTIFICATIONS. */
export const ANDROID_13_API = 33;

export type BatteryOptimizationState = "restricted" | "unrestricted" | "n/a" | "unknown";

export interface GuidanceModel {
  bodyKey: string;
  stepKeys: string[];
  extraKeys: string[];
  actionLabelKey: string;
  target: OsSettingsTarget;
  titleKey: string;
}

export type ContinueTone = "ready" | "limited" | "partial";

const TRACKED = ["locationForeground", "locationBackground", "notifications"] as const;

export function androidApiLevel(os: string, version: string | number): number | null {
  if (os !== "android") return null;
  const parsed = typeof version === "number" ? version : Number.parseInt(version, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isSamsungManufacturer(brand: string | null | undefined, manufacturer: string | null | undefined): boolean {
  return `${brand ?? ""} ${manufacturer ?? ""}`.toLowerCase().includes("samsung");
}

/** El CTA refleja lo concedido. enabled es siempre true: el alta no se bloquea. */
export function continuePresentation(snapshot: {
  locationForeground: PermissionState;
  locationBackground: PermissionState;
  notifications: PermissionState;
}): { tone: ContinueTone; labelKey: string; enabled: true } {
  const granted = TRACKED.filter((key) => snapshot[key] === "granted").length;
  if (granted === 0) return { tone: "limited", labelKey: "onboarding.continueLimited", enabled: true };
  if (granted < TRACKED.length) return { tone: "partial", labelKey: "onboarding.continuePartial", enabled: true };
  return { tone: "ready", labelKey: "common.continue", enabled: true };
}

export function backgroundDegraded(background: PermissionState): boolean {
  return background === "denied" || background === "blocked";
}

export function showAlwaysAllowGuidance(input: {
  platform: string;
  apiLevel: number | null;
  foreground: PermissionState;
  background: PermissionState;
}): boolean {
  if (input.platform !== "android") return false;
  if (input.apiLevel != null && input.apiLevel < ANDROID_11_API) return false;
  return input.foreground === "granted" && input.background !== "granted";
}

const BACKGROUND_GUIDE: GuidanceModel = {
  bodyKey: "onboarding.permBgAlwaysBody",
  stepKeys: [
    "onboarding.permBgStepSettings",
    "onboarding.permBgStepPermissions",
    "onboarding.permBgStepAlways",
    "onboarding.permBgStepPrecise",
  ],
  extraKeys: [],
  actionLabelKey: "onboarding.permOpenSettings",
  target: "LOCATION",
  titleKey: "onboarding.permBgTitle",
};

export function backgroundGuidance(input: {
  platform: string;
  apiLevel: number | null;
  foreground: PermissionState;
  background: PermissionState;
}): GuidanceModel | null {
  return showAlwaysAllowGuidance(input) ? BACKGROUND_GUIDE : null;
}

export function notificationGuidance(input: {
  platform: string;
  apiLevel: number | null;
  notifications: PermissionState;
}): GuidanceModel | null {
  if (input.platform !== "android") return null;
  if (input.apiLevel != null && input.apiLevel < ANDROID_13_API) return null;
  if (input.notifications !== "blocked") return null;
  return {
    bodyKey: "onboarding.permNotifBlockedBody",
    stepKeys: ["onboarding.permNotifStepSettings", "onboarding.permNotifStepNotifications", "onboarding.permNotifStepAllow"],
    extraKeys: [],
    actionLabelKey: "onboarding.permOpenSettings",
    target: "NOTIFICATIONS",
    titleKey: "onboarding.permNotifTitle",
  };
}

export function showBatteryCard(input: { platform: string; battery: BatteryOptimizationState }): boolean {
  return input.platform === "android" && input.battery !== "n/a";
}

/** Guía accionable solo si la optimización sigue sin resolverse. La tarjeta en sí puede mostrarse colapsada. */
export function batteryGuidance(input: {
  platform: string;
  battery: BatteryOptimizationState;
  samsung: boolean;
}): GuidanceModel | null {
  if (!showBatteryCard(input)) return null;
  if (input.battery === "unrestricted") return null;
  return {
    bodyKey: "onboarding.permBatteryBody",
    stepKeys: ["onboarding.permBatteryStepSettings", "onboarding.permBatteryStepUnrestricted"],
    extraKeys: input.samsung ? ["onboarding.permBatterySamsung"] : [],
    actionLabelKey: "onboarding.permBatteryOpen",
    target: "BATTERY",
    titleKey: "onboarding.permBatteryTitle",
  };
}

export function firstPendingIndex(states: PermissionState[], enabled: boolean[]): number {
  for (let i = 0; i < states.length; i++) {
    if (states[i] !== "granted" && enabled[i]) return i;
  }
  return -1;
}

/** Los problemas de Soporte que ya hablan de permisos reutilizan la misma guía. */
export function troubleGuidance(id: string): GuidanceModel | null {
  if (id === "permissionAlways") return BACKGROUND_GUIDE;
  if (id === "samsungBattery") {
    return {
      bodyKey: "onboarding.permBatteryBody",
      stepKeys: ["onboarding.permBatteryStepSettings", "onboarding.permBatteryStepUnrestricted"],
      extraKeys: ["onboarding.permBatterySamsung"],
      actionLabelKey: "onboarding.permBatteryOpen",
      target: "BATTERY",
      titleKey: "onboarding.permBatteryTitle",
    };
  }
  if (id === "notifications") {
    return {
      bodyKey: "onboarding.permNotifBlockedBody",
      stepKeys: ["onboarding.permNotifStepSettings", "onboarding.permNotifStepNotifications", "onboarding.permNotifStepAllow"],
      extraKeys: [],
      actionLabelKey: "onboarding.permOpenSettings",
      target: "NOTIFICATIONS",
      titleKey: "onboarding.permNotifTitle",
    };
  }
  return null;
}

export function guidanceForHealthSensor(
  sensor: string,
  input: {
    platform: string;
    apiLevel: number | null;
    samsung: boolean;
    foreground: PermissionState;
    background: PermissionState;
    notifications: PermissionState;
    battery: BatteryOptimizationState;
  },
): GuidanceModel | null {
  if (sensor === "locationBackground") return backgroundGuidance(input);
  if (sensor === "notifications") return notificationGuidance(input);
  if (sensor === "batteryOptimization") return batteryGuidance(input);
  return null;
}
