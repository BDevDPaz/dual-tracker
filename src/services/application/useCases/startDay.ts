/**
 * Caso de uso: iniciar jornada (Propuesta Técnica §7.1, flujo "Iniciar jornada").
 *   UI → START_DAY → SessionEngine valida el sitio (SiteRegistry) → ESPERANDO
 *   → efectos: GeofenceRuntime.startMonitoring + ForegroundWork (vía puertos)
 *   → asiento en el ledger.
 * Aquí solo se añade la comprobación de que el sitio tiene coordenadas; sin
 * ellas la geocerca no puede armarse y la llegada deberá confirmarse a mano.
 *
 * Guarda de aviso dual (Propuesta de calidad §9: "START_DAY sin
 * disclosureAccepted no despacha al engine"): sin aceptación vigente la
 * intención no llega a SessionEngine. sessionMachine mantiene su propio
 * rechazo DISCLOSURE_NOT_ACCEPTED como defensa en profundidad.
 */
import type { IntentOrigin } from "../../../core/contracts";
import { DualDisclosureService } from "../../domain/DualDisclosureService";
import type { DispatchResult } from "../../domain/SessionEngineService";
import { SessionEngineService } from "../../domain/SessionEngineService";
import { SiteRegistryService } from "../../domain/SiteRegistryService";
import { SettingsService } from "../../persistence/SettingsService";

export async function startDay(
  input: { siteId: number; clientId?: string | null; note?: string | null },
  origin: IntentOrigin = "UI",
): Promise<{ result: DispatchResult; geofenceReady: boolean }> {
  const { device } = await SettingsService.load();
  if (!DualDisclosureService.isAccepted(device)) {
    return { result: { ok: false, code: "DISCLOSURE_NOT_ACCEPTED" }, geofenceReady: false };
  }
  const site = await SiteRegistryService.get(input.siteId);
  const result = await SessionEngineService.dispatch({ type: "START_DAY", siteId: input.siteId, clientId: input.clientId ?? null, note: input.note ?? null }, origin);
  return { result, geofenceReady: SiteRegistryService.isGeofenceReady(site) };
}
