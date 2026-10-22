/**
 * Arma el estado de monitoreo y el texto de la notificación persistente.
 * Lee lo que ya escribieron el heartbeat, el último fix y la recuperación.
 */
import * as Location from "expo-location";
import type { SessionRecord, SessionRecordStatus } from "../../core/contracts";
import { countBoundaryFlips, scoreLocationTrust, type TrustScore } from "../../core/locationTrust";
import {
  deriveMonitoringState,
  gpsNoticeState,
  type GpsNoticeState,
  type MonitoringObservation,
  type MonitoringState,
  type RecoveryMark,
} from "../../core/monitoringState";
import { t } from "../../i18n";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { PersistenceService } from "../persistence/PersistenceService";
import type { DeviceIntegrityEvidence } from "../../core/deviceIntegrityAssess";
import { readHeartbeat } from "./heartbeat";
import { readServiceHealth } from "./serviceHealth";

const RECOVERY_INTENTS = ["MONITORING_STOPPED_DETECTED", "SERVICE_RECOVERY", "SERVICE_RECOVERY_FAILED"] as const;

export interface ForegroundNotice {
  site: string;
  gps: GpsNoticeState;
  monitoring: MonitoringState;
}

export function renderForegroundBody(notice: ForegroundNotice | null): string {
  if (!notice) return t("notifications.fgsBody");
  return t("notifications.fgsLive", {
    site: notice.site,
    gps: t(`notifications.gps.${notice.gps}`),
    monitoring: t(`health.monitoring.${notice.monitoring}`),
  });
}

function sessionStart(session: SessionRecord): number {
  return session.actualStartAtMs ?? session.declaredStartAtMs;
}

export async function loadMonitoringObservation(session: SessionRecord | null, nowMs = TimeAuthorityService.now()): Promise<MonitoringObservation> {
  if (!session) return { nowMs, sessionStartedAtMs: null, lastHeartbeatMs: null, lastFixMs: null, recovery: [] };
  const started = sessionStart(session);
  const [heartbeat, fix, components] = await Promise.all([readHeartbeat(), PersistenceService.getLastFix(), readServiceHealth()]);
  const componentBeat = components.reduce<number | null>((best, row) => (best === null || row.lastHeartbeatMs > best ? row.lastHeartbeatMs : best), null);
  const lastHeartbeatMs = [heartbeat, componentBeat].reduce<number | null>((best, value) => {
    if (value === null) return best;
    return best === null || value > best ? value : best;
  }, null);
  const marks: RecoveryMark[] = [];
  for (const intent of RECOVERY_INTENTS) {
    const rows = await PersistenceService.listLedger({ sessionId: session.id, intent });
    for (const row of rows) {
      let success: boolean | undefined;
      if (intent === "SERVICE_RECOVERY") {
        try {
          success = JSON.parse(row.payloadJson).data?.success === true;
        } catch {
          success = false;
        }
      }
      marks.push({ intent, atMs: row.timestampMs, success });
    }
  }
  marks.sort((a, b) => a.atMs - b.atMs);
  const lastFixMs = fix && fix.timestampMs >= started ? fix.timestampMs : null;
  return { nowMs, sessionStartedAtMs: started, lastHeartbeatMs, lastFixMs, recovery: marks };
}

export async function buildForegroundNotice(session: SessionRecord | null): Promise<ForegroundNotice | null> {
  if (!session) return null;
  const nowMs = TimeAuthorityService.now();
  const observation = await loadMonitoringObservation(session, nowMs);
  const site = session.siteId !== null ? await PersistenceService.getSite(session.siteId) : null;
  const alias = site?.alias?.trim() || t("notifications.fgsNoSite");
  const mocked = (await PersistenceService.countMockedFacts(session.id)) > 0;
  const services = await Location.hasServicesEnabledAsync().catch(() => null);
  return {
    site: alias,
    gps: gpsNoticeState({
      servicesEnabled: services,
      mocked,
      lastFixMs: observation.lastFixMs,
      nowMs,
      sessionOpen: true,
    }),
    monitoring: deriveMonitoringState(observation),
  };
}

export async function locationTrustForSession(sessionId: number, rooted: boolean): Promise<TrustScore & { sessionId: number }> {
  const facts = await PersistenceService.listSpatialFacts(sessionId);
  const accuraciesM = facts.map((fact) => fact.accuracyM).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const mocked = facts.some((fact) => fact.mocked === true || fact.reason === "MOCK_LOCATION");
  const jumpCount = facts.filter((fact) => fact.reason === "LOCATION_JUMP_DETECTED" || fact.reason === "IMPOSSIBLE_SPEED").length;
  const ledger = await PersistenceService.listLedger({ sessionId });
  const signalLossCount = ledger.filter((entry) => entry.intent === "GPS_LOST").length;
  const gapCount = ledger.filter((entry) => entry.intent === "MONITORING_GAP").length;
  const anomalyJumps = ledger.filter((entry) => {
    if (entry.intent !== "ANOMALY") return false;
    try {
      const kind = JSON.parse(entry.payloadJson).data?.kind;
      return kind === "GPS_JUMP" || kind === "IMPOSSIBLE_TRAVEL";
    } catch {
      return false;
    }
  }).length;
  const score = scoreLocationTrust({
    accuraciesM,
    mocked,
    rooted,
    jumpCount: Math.max(jumpCount, anomalyJumps),
    boundaryFlips: countBoundaryFlips(facts),
    signalLossCount,
    gapCount,
  });
  return { sessionId, ...score };
}

export async function rootedFromSession(sessionId: number, current: DeviceIntegrityEvidence | null): Promise<boolean> {
  if (current?.rooted) return true;
  const rows = await PersistenceService.listLedger({ sessionId, intent: "DEVICE_INTEGRITY" });
  return rows.some((entry) => {
    try {
      return JSON.parse(entry.payloadJson).data?.rooted === true;
    } catch {
      return false;
    }
  });
}

export type { SessionRecordStatus };
