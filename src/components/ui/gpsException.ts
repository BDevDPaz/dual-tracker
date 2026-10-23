/**
 * Excepciones de GPS en Hoy. Solo presentación: cada caso se apoya en un
 * estado que ya existe (SALIDA, deriva de reloj, aviso de señal, espera).
 * Ninguna excepción cierra la jornada ni cambia el pago.
 */
import type { SessionState } from "../../core/contracts";
import type { GpsNoticeState, MonitoringState } from "../../core/monitoringState";

export type GpsExceptionKind = "signal_delay" | "gps_async" | "no_show" | "zone_exit";

export function selectGpsExceptionKind(input: {
  sessionState: SessionState;
  clockDrift: boolean;
  integrityReason: string | null;
  gps: GpsNoticeState;
  monitoring: MonitoringState;
}): GpsExceptionKind | null {
  if (input.sessionState === "SALIDA") return "zone_exit";
  const open = input.sessionState === "ESPERANDO" || input.sessionState === "ACTIVA" || input.sessionState === "PAUSADA" || input.sessionState === "TRASLADO";
  if (!open) return null;
  if (input.clockDrift || input.integrityReason === "CLOCK_DRIFT") return "gps_async";
  if (
    input.sessionState === "ESPERANDO" &&
    (input.monitoring === "FAILED" || input.integrityReason === "UNRELIABLE_FIX" || input.integrityReason === "PROVIDER_LOSS")
  ) {
    return "no_show";
  }
  if (
    input.gps === "lost" ||
    input.gps === "off" ||
    input.monitoring === "DEGRADED" ||
    input.monitoring === "RECOVERING" ||
    input.monitoring === "FAILED" ||
    input.integrityReason === "PROVIDER_LOSS"
  ) {
    return "signal_delay";
  }
  return null;
}
