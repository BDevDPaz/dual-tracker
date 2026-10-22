/**
 * Catálogo de severidad de fallos operacionales y anomalías.
 * LOW / MEDIUM / HIGH / CRITICAL. No cambia la nómina.
 * Los colores del log se mapean aquí; CRITICAL no tiene color: es root.
 */
export const SEVERITY_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export type AnomalySeverity = (typeof SEVERITY_LEVELS)[number];

export const ANOMALY_KINDS = [
  "MOCK_LOCATION",
  "GPS_JUMP",
  "IMPOSSIBLE_TRAVEL",
  "CLOCK_DRIFT",
  "BOUNDARY_FLAPPING",
  "FREQUENT_SIGNAL_LOSS",
  "GPS_LOST",
  "GPS_RESTORED",
  "STALE_LOCATION",
  "SERVICE_STOPPED",
] as const;

export type AnomalyKind = (typeof ANOMALY_KINDS)[number];

export const ANOMALY_SEVERITY: Record<AnomalyKind, AnomalySeverity> = {
  MOCK_LOCATION: "HIGH",
  GPS_JUMP: "HIGH",
  IMPOSSIBLE_TRAVEL: "HIGH",
  CLOCK_DRIFT: "HIGH",
  BOUNDARY_FLAPPING: "MEDIUM",
  FREQUENT_SIGNAL_LOSS: "MEDIUM",
  GPS_LOST: "HIGH",
  GPS_RESTORED: "LOW",
  STALE_LOCATION: "MEDIUM",
  SERVICE_STOPPED: "HIGH",
};

/** Fallos que ya se asientan con estos textos. El catálogo no les cambia el payload. */
export const OPERATIONAL_SEVERITY = {
  PERMISSION_REVOKED: "HIGH",
  PRECISE_LOCATION_REVOKED: "HIGH",
  NOTIFICATION_DISABLED: "MEDIUM",
  GPS_DISABLED: "HIGH",
  BATTERY_OPTIMIZATION_ENABLED: "MEDIUM",
  SERVICE_RECOVERY_FAILED: "HIGH",
  FOREGROUND_SERVICE_START_FAILED: "HIGH",
  MONITORING_GAP: "MEDIUM",
  DEVELOPER_OPTIONS: "LOW",
  EMULATOR: "HIGH",
  ROOTED: "CRITICAL",
} as const satisfies Record<string, AnomalySeverity>;

/** Colores de LoggingService. VERDE no es un fallo. */
export const LOG_COLOR_SEVERITY = {
  VERDE: null,
  BLANCO: "LOW",
  AZUL: "LOW",
  AMARILLO: "LOW",
  NARANJA: "MEDIUM",
  ROJO: "HIGH",
} as const satisfies Record<string, AnomalySeverity | null>;

const RANK: Record<AnomalySeverity, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

export function maxSeverity(levels: (AnomalySeverity | null | undefined)[]): AnomalySeverity | null {
  let best: AnomalySeverity | null = null;
  for (const level of levels) {
    if (!level) continue;
    if (!best || RANK[level] > RANK[best]) best = level;
  }
  return best;
}
