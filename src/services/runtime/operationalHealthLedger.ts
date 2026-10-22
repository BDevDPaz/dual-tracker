/**
 * Asientos de salud operacional. Solo cuando el estado cambia: el ancla
 * queda en KV y un refresco igual no escribe. No toca la jornada ni la nómina.
 * La primera lectura concreta también se asienta (antes no había ancla).
 */
import type { LedgerIntent, PermissionState, SessionRecordStatus, SystemHealthSnapshot } from "../../core/contracts";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { IntegrityLedgerService } from "../domain/IntegrityLedgerService";
import { LoggingService } from "../persistence/LoggingService";
import { PersistenceService } from "../persistence/PersistenceService";
import { KV_KEYS } from "../persistence/schema";
import { serializeError } from "../../utils/serializeError";

type Tri = "granted" | "revoked" | "unknown" | "na";
type Gps = "enabled" | "disabled" | "unknown";
type Battery = "enabled" | "disabled" | "unknown" | "na";

interface OpsState {
  location: Tri;
  background: Tri;
  notifications: Tri;
  precise: Tri;
  gps: Gps;
  battery: Battery;
}

const EMPTY: OpsState = {
  location: "unknown",
  background: "unknown",
  notifications: "unknown",
  precise: "unknown",
  gps: "unknown",
  battery: "unknown",
};

interface OpsEvent {
  intent: LedgerIntent;
  reason: string;
  data: Record<string, unknown>;
}

function permTri(state: PermissionState): Tri {
  if (state === "granted") return "granted";
  if (state === "unknown") return "unknown";
  return "revoked";
}

export function opsStateFrom(snapshot: SystemHealthSnapshot): OpsState {
  return {
    location: permTri(snapshot.locationForeground),
    background: permTri(snapshot.locationBackground),
    notifications: permTri(snapshot.notifications),
    precise:
      snapshot.locationAccuracy === "fine"
        ? "granted"
        : snapshot.locationAccuracy === "coarse"
          ? "revoked"
          : snapshot.locationAccuracy === "n/a"
            ? "na"
            : "unknown",
    gps: snapshot.locationServicesEnabled === true ? "enabled" : snapshot.locationServicesEnabled === false ? "disabled" : "unknown",
    battery:
      snapshot.batteryOptimization === "restricted"
        ? "enabled"
        : snapshot.batteryOptimization === "unrestricted"
          ? "disabled"
          : snapshot.batteryOptimization === "n/a"
            ? "na"
            : "unknown",
  };
}

function readOps(value: unknown): OpsState | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<OpsState>;
  if (typeof row.location !== "string" || typeof row.gps !== "string") return null;
  return { ...EMPTY, ...row } as OpsState;
}

function pushPermission(out: OpsEvent[], key: "location" | "background" | "notifications" | "precise", prev: Tri, next: Tri): void {
  if (next === "unknown" || next === "na" || prev === next) return;
  const granted = next === "granted";
  out.push({
    intent: granted ? "PERMISSION_GRANTED" : "PERMISSION_REVOKED",
    reason: `${granted ? "PERMISSION_GRANTED" : "PERMISSION_REVOKED"}_${key}`,
    data: { permission: key, ...(!granted || key === "precise" ? { severity: "HIGH" } : {}) },
  });
}

export function diffOperational(prev: OpsState | null, next: OpsState): OpsEvent[] {
  const was = prev ?? EMPTY;
  const out: OpsEvent[] = [];
  pushPermission(out, "location", was.location, next.location);
  pushPermission(out, "background", was.background, next.background);
  pushPermission(out, "notifications", was.notifications, next.notifications);
  if (next.notifications === "revoked" && was.notifications !== "revoked") {
    out.push({ intent: "NOTIFICATION_DISABLED", reason: "NOTIFICATION_DISABLED", data: { severity: "MEDIUM" } });
  }
  pushPermission(out, "precise", was.precise, next.precise);
  if (next.gps !== "unknown" && was.gps !== next.gps) {
    const enabled = next.gps === "enabled";
    out.push({
      intent: enabled ? "GPS_ENABLED" : "GPS_DISABLED",
      reason: enabled ? "GPS_ENABLED" : "GPS_DISABLED",
      data: enabled ? {} : { severity: "HIGH" },
    });
  }
  if ((next.battery === "enabled" || next.battery === "disabled") && was.battery !== next.battery) {
    const on = next.battery === "enabled";
    out.push({
      intent: on ? "BATTERY_OPTIMIZATION_ENABLED" : "BATTERY_OPTIMIZATION_DISABLED",
      reason: on ? "BATTERY_OPTIMIZATION_ENABLED" : "BATTERY_OPTIMIZATION_DISABLED",
      data: on ? { severity: "MEDIUM" } : {},
    });
  }
  return out;
}

export async function recordOperationalChanges(
  snapshot: SystemHealthSnapshot,
  session: { id: number; domainStatus: SessionRecordStatus } | null,
): Promise<void> {
  const prev = readOps(await PersistenceService.getKv<unknown>(KV_KEYS.OPS_HEALTH));
  const next = opsStateFrom(snapshot);
  const events = diffOperational(prev, next);
  if (!events.length && prev) return;
  const nowMs = TimeAuthorityService.now();
  await PersistenceService.transaction(async (db) => {
    for (const event of events) {
      await IntegrityLedgerService.append(
        {
          sessionId: session?.id ?? null,
          actor: "SYSTEM",
          intent: event.intent,
          fromState: session?.domainStatus ?? null,
          toState: session?.domainStatus ?? null,
          reason: event.reason,
          timestampMs: nowMs,
          integrityClass: null,
          data: event.data,
        },
        db,
      );
    }
    await PersistenceService.setKv(KV_KEYS.OPS_HEALTH, next, db);
  });
}

export async function recordOperationalChangesSafely(
  snapshot: SystemHealthSnapshot,
  session: { id: number; domainStatus: SessionRecordStatus } | null,
): Promise<void> {
  try {
    await recordOperationalChanges(snapshot, session);
  } catch (error) {
    LoggingService.log("NARANJA", "PERMISOS", "WARN", "No se pudo asentar el cambio operacional", serializeError(error));
  }
}
