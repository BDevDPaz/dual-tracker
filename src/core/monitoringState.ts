/**
 * Estado de monitoreo derivado. Informativo: no es la máquina de la jornada
 * y no cambia el pago. Sale del heartbeat, del último fix y de los asientos
 * de recuperación.
 */
export const MONITORING_STATES = ["IDLE", "STARTING", "MONITORING", "DEGRADED", "RECOVERING", "FAILED"] as const;

export type MonitoringState = (typeof MONITORING_STATES)[number];

/** Sin muestras durante este tiempo: DEGRADED. El mismo umbral del hueco anotado. */
export const SAMPLE_STALE_MS = 5 * 60_000;

/** Ubicación quieta durante horas: anomalía, distinta del degradado de 5 min. */
export const STALE_LOCATION_MS = 2 * 60 * 60_000;

export type RecoveryIntent = "MONITORING_STOPPED_DETECTED" | "SERVICE_RECOVERY" | "SERVICE_RECOVERY_FAILED";

export interface RecoveryMark {
  intent: RecoveryIntent;
  atMs: number;
  success?: boolean;
}

export interface MonitoringObservation {
  nowMs: number;
  /** null si no hay jornada que deba monitorearse. */
  sessionStartedAtMs: number | null;
  lastHeartbeatMs: number | null;
  /** Último fix de esta jornada. null si no hay, o si es anterior al inicio. */
  lastFixMs: number | null;
  recovery: RecoveryMark[];
}

function freshAfter(atMs: number | null, afterMs: number, nowMs: number): boolean {
  return atMs !== null && atMs > afterMs && nowMs - atMs < SAMPLE_STALE_MS;
}

export function deriveMonitoringState(obs: MonitoringObservation): MonitoringState {
  if (obs.sessionStartedAtMs === null) return "IDLE";
  const started = obs.sessionStartedAtMs;
  const marks = obs.recovery.filter((mark) => mark.atMs >= started);
  const last = marks.length ? marks[marks.length - 1] : null;
  const fixMs = obs.lastFixMs !== null && obs.lastFixMs >= started ? obs.lastFixMs : null;
  const sampleAfter = (afterMs: number) => freshAfter(fixMs, afterMs, obs.nowMs);

  if (last?.intent === "SERVICE_RECOVERY_FAILED" && !sampleAfter(last.atMs)) return "FAILED";
  if (last?.intent === "SERVICE_RECOVERY" && last.success === false && !sampleAfter(last.atMs)) return "RECOVERING";
  if (last?.intent === "MONITORING_STOPPED_DETECTED" && !sampleAfter(last.atMs)) return "RECOVERING";

  if (fixMs === null) return obs.nowMs - started >= SAMPLE_STALE_MS ? "DEGRADED" : "STARTING";
  if (obs.nowMs - fixMs >= SAMPLE_STALE_MS) return "DEGRADED";
  return "MONITORING";
}

export type GpsNoticeState = "ok" | "lost" | "mock" | "off" | "unknown";

export function gpsNoticeState(input: {
  servicesEnabled: boolean | null;
  mocked: boolean;
  lastFixMs: number | null;
  nowMs: number;
  sessionOpen: boolean;
}): GpsNoticeState {
  if (input.mocked) return "mock";
  if (input.servicesEnabled === false) return "off";
  if (!input.sessionOpen) return input.servicesEnabled === true ? "ok" : "unknown";
  if (input.lastFixMs === null || input.nowMs - input.lastFixMs >= SAMPLE_STALE_MS) return "lost";
  if (input.servicesEnabled === null) return "unknown";
  return "ok";
}
