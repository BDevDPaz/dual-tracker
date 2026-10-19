/**
 * Informe de soporte para compartir. Lista blanca: si un campo no está aquí,
 * no sale. Sin coordenadas y sin campos sensibles descifrados.
 */
import type { GeofenceDiagEvent, SettingsSnapshot, SystemHealthSnapshot } from "../core/contracts";
import { SUPPORT_CONTENT_VERSION } from "./contentVersion";

export interface SupportDiagnostic {
  kind: "dual-tracker.support-diagnostic.v1";
  contentVersion: string;
  exportedAtMs: number;
  appVersion: string;
  build: string;
  settings: {
    language: "es" | "en";
    dailyReminderTime: string;
    traceMode: string;
    overtimePolicyId: string;
    overtimeMultiplier: number;
    defaultRadiusM: number;
    traceRetentionDays: number;
    destinationLimit: number;
    transitPaid: boolean;
    transitRateMultiplier: number;
    transitCountsTowardOvertime: boolean;
    workdayStartMinutes: number;
    workweekStartDay: number;
    onboardingCompleted: boolean;
    disclosureAccepted: boolean;
    exitDecisionExpiry: string;
    /** Sin la dirección. Solo si está apagado, encendido o sin configurar. */
    employerPortal: "unconfigured" | "disabled" | "enabled";
  };
  permissions: {
    foreground: string;
    background: string;
    notifications: string;
    foregroundService: string;
    battery: string;
    monitoring: boolean;
    servicesEnabled: boolean | null;
    clockDriftExceeded: boolean;
    cryptoStatus: string;
  };
  geofenceDiag: {
    atMs: number;
    kind: string;
    region: string | null;
    siteId: number | null;
    accuracyM: number | null;
    accepted: boolean;
    reason: string | null;
  }[];
  tipsDismissed: string[];
}

function keyDenied(key: string): boolean {
  const k = key.toLowerCase();
  if (
    k === "lat" ||
    k === "lon" ||
    k === "note" ||
    k === "notes" ||
    k === "alias" ||
    k === "address" ||
    k === "email" ||
    k === "pin" ||
    k === "coords" ||
    k === "payload" ||
    k === "secret"
  ) {
    return true;
  }
  return (
    k.includes("latitude") ||
    k.includes("longitude") ||
    k.includes("targetlat") ||
    k.includes("targetlon") ||
    k.includes("manualnote") ||
    k.includes("hourlyrate") ||
    k.includes("employeename") ||
    k.includes("employername") ||
    k.includes("companyemail")
  );
}

export function diagnosticIsSafe(value: unknown): boolean {
  const walk = (node: unknown): boolean => {
    if (node == null || typeof node === "number" || typeof node === "boolean") return true;
    if (typeof node === "string") return !node.includes("enc:v1") && !node.includes("@");
    if (Array.isArray(node)) return node.every(walk);
    if (typeof node === "object") {
      for (const [key, child] of Object.entries(node)) {
        if (keyDenied(key)) return false;
        if (!walk(child)) return false;
      }
      return true;
    }
    return false;
  };
  return walk(value);
}

function portalStatus(enabled: boolean | undefined, url: string | null | undefined): "unconfigured" | "disabled" | "enabled" {
  const text = (url ?? "").trim();
  if (!text) return "unconfigured";
  return enabled === true ? "enabled" : "disabled";
}

function diagRow(event: GeofenceDiagEvent): SupportDiagnostic["geofenceDiag"][number] {
  return {
    atMs: event.atMs,
    kind: event.kind,
    region: event.region,
    siteId: event.siteId,
    accuracyM: event.accuracyM,
    accepted: event.accepted,
    reason: event.reason,
  };
}

export function buildSupportDiagnostic(input: {
  nowMs: number;
  appVersion: string;
  build: string;
  settings: SettingsSnapshot;
  health: SystemHealthSnapshot;
  tipsDismissed: readonly string[];
}): SupportDiagnostic {
  const calendar = input.settings.company.calendarHistory?.[0];
  const doc: SupportDiagnostic = {
    kind: "dual-tracker.support-diagnostic.v1",
    contentVersion: SUPPORT_CONTENT_VERSION,
    exportedAtMs: input.nowMs,
    appVersion: input.appVersion,
    build: input.build,
    settings: {
      language: input.settings.profile.language,
      dailyReminderTime: input.settings.profile.dailyReminderTime,
      traceMode: input.settings.company.traceMode,
      overtimePolicyId: input.settings.company.overtimePolicyId,
      overtimeMultiplier: input.settings.company.overtimeMultiplier,
      defaultRadiusM: input.settings.company.defaultRadiusM,
      traceRetentionDays: input.settings.company.traceRetentionDays,
      destinationLimit: input.settings.company.destinationLimit,
      transitPaid: input.settings.company.transitPaid,
      transitRateMultiplier: input.settings.company.transitRateMultiplier,
      transitCountsTowardOvertime: input.settings.company.transitCountsTowardOvertime,
      workdayStartMinutes: calendar?.workdayStartMinutes ?? 0,
      workweekStartDay: calendar?.workweekStartDay ?? 1,
      onboardingCompleted: input.settings.device.onboardingCompleted,
      disclosureAccepted: input.settings.device.disclosureAcceptedVersion != null,
      exitDecisionExpiry: input.settings.company.exitDecisionExpiry,
      employerPortal: portalStatus(input.settings.company.employerPortalEnabled, input.settings.company.employerPortalUrl),
    },
    permissions: {
      foreground: input.health.locationForeground,
      background: input.health.locationBackground,
      notifications: input.health.notifications,
      foregroundService: input.health.foregroundService,
      battery: input.health.batteryOptimization,
      monitoring: input.health.isMonitoring,
      servicesEnabled: input.health.locationServicesEnabled,
      clockDriftExceeded: input.health.clockDriftExceeded,
      cryptoStatus: input.health.fieldCrypto.status,
    },
    geofenceDiag: (input.health.geofenceDiag ?? []).map(diagRow),
    tipsDismissed: [...input.tipsDismissed],
  };
  return doc;
}
