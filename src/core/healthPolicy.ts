/**
 * Qué sensores impiden VALIDADA y cuáles solo avisan.
 * Ubicación (en uso, segundo plano y servicios del sistema), servicio en
 * primer plano y reloj bloquean. Batería, avisos, red, geocerca y el último
 * hecho espacial no bloquean.
 */
import type { HealthSensor, IntegrityReason, SystemHealthSnapshot } from "./contracts";

export type SensorImpact = "blocking" | "warning";

export const HEALTH_SENSOR_IMPACT: Record<HealthSensor, SensorImpact> = {
  locationForeground: "blocking",
  locationBackground: "blocking",
  notifications: "warning",
  foregroundService: "blocking",
  batteryOptimization: "warning",
  clockDriftMs: "blocking",
  isMonitoring: "warning",
  lastSpatialFactAt: "warning",
  networkTime: "warning",
};

export function sensorBlocksValid(sensor: HealthSensor): boolean {
  return HEALTH_SENSOR_IMPACT[sensor] === "blocking";
}

/**
 * Motivo de bloqueo de VALIDADA a partir del snapshot, o null si el entorno
 * no impide certificar. "unknown" / "n/a" no bloquean: todavía no hay lectura.
 * El servicio en primer plano solo bloquea con jornada abierta (antes de
 * abrirla no tiene que estar corriendo).
 */
export function blockingIntegrityReason(h: SystemHealthSnapshot, sessionOpen: boolean): IntegrityReason | null {
  if (h.locationForeground === "denied" || h.locationForeground === "blocked") return "LOCATION_FOREGROUND_MISSING";
  if (h.locationBackground === "denied" || h.locationBackground === "blocked") return "BACKGROUND_PERMISSION_MISSING";
  if (h.locationServicesEnabled === false) return "LOCATION_SERVICES_DISABLED";
  if (sessionOpen && h.foregroundService === "stopped") return "FOREGROUND_SERVICE_STOPPED";
  if (h.clockDriftExceeded) return "CLOCK_DRIFT";
  return null;
}
