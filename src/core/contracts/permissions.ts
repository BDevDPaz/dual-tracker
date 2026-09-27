/**
 * Salud real del sistema (PermissionsHealthService, Propuesta Técnica §5.9;
 * Propuesta de Producto §5.15 lista de sensores).
 */
export type PermissionState = "unknown" | "granted" | "denied" | "blocked";

export type PermissionKey = "locationForeground" | "locationBackground" | "notifications";

export type OsSettingsTarget = "APP" | "LOCATION" | "BATTERY" | "NOTIFICATIONS";

export interface SystemHealthSnapshot {
  locationForeground: PermissionState;
  locationBackground: PermissionState;
  notifications: PermissionState;
  /** Android: servicio en primer plano de ubicación activo. iOS: "n/a". */
  foregroundService: "running" | "stopped" | "n/a" | "unknown";
  /** Android: true = el SO puede restringir la app. */
  batteryOptimization: "restricted" | "unrestricted" | "n/a" | "unknown";
  /** Deriva de reloj medida por TimeAuthority (ms, valor absoluto). */
  clockDriftMs: number;
  clockDriftExceeded: boolean;
  /** Geocerca nativa registrada. */
  isMonitoring: boolean;
  /** Último hecho espacial persistido. */
  lastSpatialFactAt: number | null;
  locationServicesEnabled: boolean | null;
  checkedAtMs: number | null;
  /** Estado de la cadena del ledger (spec v1.3 §5.5). */
  ledger: {
    /** Incidente abierto (sin reconocer). */
    broken: import("./ledger").LedgerIncident | null;
    acknowledgedBreaks: number;
  };
}

/** Impacto de cada sensor en la integridad (copy vía i18n, clave = sensor). */
export type HealthSensor = keyof Pick<
  SystemHealthSnapshot,
  | "locationForeground"
  | "locationBackground"
  | "notifications"
  | "foregroundService"
  | "batteryOptimization"
  | "clockDriftMs"
  | "isMonitoring"
  | "lastSpatialFactAt"
>;
