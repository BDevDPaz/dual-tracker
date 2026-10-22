import type { PermissionState } from "../core/contracts";

/**
 * Cadena de tarjetas de permiso. "unknown" es "aún no hay respuesta".
 * Si la petición anterior ya terminó y el SO sigue en unknown (falló),
 * la siguiente no se queda apagada para siempre.
 * previous === null es la primera tarjeta.
 */
export function permissionCardEnabled(previous: PermissionState | null, previousAttempted: boolean, busy: boolean): boolean {
  if (busy) return false;
  if (previous === null || previous !== "unknown") return true;
  return previousAttempted;
}
