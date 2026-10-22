/**
 * Salud real del sistema (PermissionsHealthService, Propuesta Técnica §5.9;
 * Propuesta de Producto §5.15 lista de sensores).
 */
import type { DeviceIntegritySnapshot, LocationTrustSnapshot, MonitoringState, ServiceHealthBeat } from "./monitoring";
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
  /**
   * Hora de red: "online" si dos fuentes concordaron, "offline" si no se pudo
   * medir, "unknown" si todavía no se intentó. No bloquea VALIDADA.
   */
  networkTime: "unknown" | "online" | "offline";
  /** Geocerca nativa registrada. */
  isMonitoring: boolean;
  /** Último hecho espacial persistido. */
  lastSpatialFactAt: number | null;
  /**
   * Hubo un fix simulado en la jornada abierta. Solo aviso: no bloquea
   * VALIDADA y no cambia el pago. El fichaje automático sí queda suspendido.
   */
  mockLocation: boolean;
  /** Estado de monitoreo derivado. No es el estado de la jornada. */
  monitoringState: MonitoringState;
  /** Último heartbeat agregado (KV o el componente más reciente). */
  lastHeartbeatAt: number | null;
  /** Latidos por componente. Vacío si la tabla todavía no tiene filas. */
  serviceHealth: ServiceHealthBeat[];
  /** Integridad del dispositivo. null si aún no hubo una lectura concreta. */
  deviceIntegrity: DeviceIntegritySnapshot | null;
  /** Puntaje informativo de la jornada abierta o, si no hay, de la última. */
  locationTrust: LocationTrustSnapshot | null;
  locationServicesEnabled: boolean | null;
  /**
   * Precisión del permiso de ubicación en Android 12+. "coarse" es solo
   * aproximada: no cuenta como concedida del todo. "n/a" fuera de Android.
   * No bloquea VALIDADA y no cambia el pago.
   */
  locationAccuracy: "fine" | "coarse" | "unknown" | "n/a";
  checkedAtMs: number | null;
  /** Estado de la cadena del ledger (spec v1.3 §5.5). */
  ledger: {
    /** Incidente abierto (sin reconocer). */
    broken: import("./ledger").LedgerIncident | null;
    acknowledgedBreaks: number;
  };
  /** FieldCrypto v1.3 §11: reflejo del estado del cifrado de campos. */
  fieldCrypto: FieldCryptoHealth;
  /**
   * Últimos eventos de geocerca para Salud. Sin coordenadas: la región es el
   * identificador SESSION_n_SITE_n, no lat/lon.
   */
  geofenceDiag: GeofenceDiagEvent[];
}

export type GeofenceDiagKind = "ENTER" | "EXIT" | "SAMPLE" | "REGISTER" | "ERROR";

export interface GeofenceDiagEvent {
  atMs: number;
  kind: GeofenceDiagKind;
  region: string | null;
  siteId: number | null;
  accuracyM: number | null;
  accepted: boolean;
  reason: string | null;
}

export interface FieldCryptoHealth {
  status: "UNINITIALIZED" | "READY" | "NEEDS_MIGRATE" | "KEY_MISSING" | "UNAVAILABLE";
  lostKids: string[];
  /** Sesiones con nota o rastro cifrados con un kid perdido (§14). */
  affectedSessionIds: number[];
  /** false en web: no apta para jornadas certificadas (§12). */
  platformSupported: boolean;
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
  | "networkTime"
  | "mockLocation"
  | "monitoringState"
  | "lastHeartbeatAt"
  | "deviceIntegrity"
>;
