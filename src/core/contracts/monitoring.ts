/** Estado de monitoreo, latidos y confianza. Informativos: no son la jornada. */
export const SERVICE_COMPONENTS = ["location", "geofence", "worker", "watchdog"] as const;

export type ServiceComponent = (typeof SERVICE_COMPONENTS)[number];

export type MonitoringState = "IDLE" | "STARTING" | "MONITORING" | "DEGRADED" | "RECOVERING" | "FAILED";

export interface ServiceHealthBeat {
  component: ServiceComponent;
  lastHeartbeatMs: number;
}

export interface DeviceIntegritySnapshot {
  developerOptionsEnabled: boolean | null;
  emulator: boolean | null;
  emulatorHits: string[];
  rooted: boolean | null;
  rootHits: string[];
  isDevice: boolean | null;
  checkedAtMs: number | null;
}

export type TrustLabel = "EXCELLENT" | "GOOD" | "FAIR" | "SUSPICIOUS";

export interface LocationTrustSnapshot {
  sessionId: number;
  score: number;
  label: TrustLabel;
}
