/**
 * Caso de uso: iniciar jornada (Propuesta Técnica §7.1, flujo "Iniciar jornada").
 *   UI → START_DAY → SessionEngine valida el sitio (SiteRegistry) → ESPERANDO
 *   → efectos: GeofenceRuntime.startMonitoring + ForegroundWork (vía puertos)
 *   → asiento en el ledger.
 * Aquí solo se añade la comprobación de que el sitio tiene coordenadas; sin
 * ellas la geocerca no puede armarse y la llegada deberá confirmarse a mano.
 */
import type { IntentOrigin } from "../../../core/contracts";
import { SessionEngineService } from "../../domain/SessionEngineService";
import { SiteRegistryService } from "../../domain/SiteRegistryService";

export async function startDay(
  input: { siteId: number; clientId?: string | null; note?: string | null },
  origin: IntentOrigin = "UI",
) {
  const site = await SiteRegistryService.get(input.siteId);
  const result = await SessionEngineService.dispatch({ type: "START_DAY", siteId: input.siteId, clientId: input.clientId ?? null, note: input.note ?? null }, origin);
  return { result, geofenceReady: SiteRegistryService.isGeofenceReady(site) };
}
