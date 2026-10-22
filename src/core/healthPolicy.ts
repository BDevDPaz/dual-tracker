/**
 * Qué sensores impiden VALIDADA y cuáles solo avisan.
 * Ubicación (en uso, segundo plano y servicios del sistema), servicio en
 * primer plano y reloj bloquean. Batería, avisos, red, geocerca y el último
 * hecho espacial no bloquean.
 */
import type { HealthSensor, IntegrityReason, SystemHealthSnapshot } from "./contracts";
import { SAMPLE_STALE_MS } from "./monitoringState";

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
  mockLocation: "warning",
  monitoringState: "warning",
  lastHeartbeatAt: "warning",
  deviceIntegrity: "warning",
};

export function sensorBlocksValid(sensor: HealthSensor): boolean {
  return HEALTH_SENSOR_IMPACT[sensor] === "blocking";
}

/**
 * Verde solo si la lectura existe y tiene menos de 5 min.
 * Sin lectura: verde cuando no se exige (no hay jornada abierta).
 * Una lectura de hace horas no queda verde.
 */
export function readingLooksOk(atMs: number | null, nowMs: number, required: boolean): boolean {
  if (atMs === null || !Number.isFinite(atMs)) return !required;
  return nowMs - atMs < SAMPLE_STALE_MS;
}

/** Android 12+ concedió solo la ubicación aproximada. No es un permiso pleno. */
export function approximateLocation(h: Pick<SystemHealthSnapshot, "locationAccuracy">): boolean {
  return h.locationAccuracy === "coarse";
}

/**
 * Cómo se muestra la ubicación en uso. La aproximada no cuenta como concedida
 * del todo y no bloquea VALIDADA: es un aviso. Apagar los servicios del
 * sistema sigue bloqueando.
 */
export function foregroundLocationHealth(h: Pick<SystemHealthSnapshot, "locationForeground" | "locationServicesEnabled" | "locationAccuracy">): {
  ok: boolean;
  blocksValid: boolean;
  approximate: boolean;
} {
  const approximate = approximateLocation(h);
  const servicesOff = h.locationServicesEnabled === false;
  return {
    approximate,
    ok: h.locationForeground === "granted" && !servicesOff && !approximate,
    blocksValid: servicesOff || (approximate ? false : sensorBlocksValid("locationForeground")),
  };
}

/**
 * Motivo de bloqueo de VALIDADA a partir del snapshot, o null si el entorno
 * no impide certificar. "unknown" / "n/a" no bloquean: todavía no hay lectura.
 * El servicio en primer plano solo bloquea con jornada abierta (antes de
 * abrirla no tiene que estar corriendo). La ubicación aproximada no entra:
 * es un aviso y no cambia el pago.
 */
export function blockingIntegrityReason(h: SystemHealthSnapshot, sessionOpen: boolean): IntegrityReason | null {
  if (h.locationForeground === "denied" || h.locationForeground === "blocked") return "LOCATION_FOREGROUND_MISSING";
  if (h.locationBackground === "denied" || h.locationBackground === "blocked") return "BACKGROUND_PERMISSION_MISSING";
  if (h.locationServicesEnabled === false) return "LOCATION_SERVICES_DISABLED";
  if (sessionOpen && h.foregroundService === "stopped") return "FOREGROUND_SERVICE_STOPPED";
  if (h.clockDriftExceeded) return "CLOCK_DRIFT";
  return null;
}
