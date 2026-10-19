/**
 * Bitácora de diagnóstico de geocerca (Salud).
 *
 * Últimos DIAG_LIMIT eventos: hora, tipo, identificador de región, precisión,
 * aceptado/rechazado y motivo. NO guarda coordenadas. Las coordenadas siguen
 * solo en el esquema cifrado (spatial.coords / kv.lastFix). Esta bitácora
 * vive en app_kv en claro precisamente porque no tiene lat/lon.
 */
import type { GeofenceDiagEvent } from "../../core/contracts";
import { StoreActions } from "../../core/store";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { PersistenceService } from "../persistence/PersistenceService";
import { KV_KEYS } from "../persistence/schema";
import { DIAG_LIMIT } from "./geofencePolicy";

export async function appendGeofenceDiag(event: Omit<GeofenceDiagEvent, "atMs"> & { atMs?: number }): Promise<void> {
  const entry: GeofenceDiagEvent = {
    atMs: event.atMs ?? TimeAuthorityService.now(),
    kind: event.kind,
    region: event.region,
    siteId: event.siteId,
    accuracyM: event.accuracyM,
    accepted: event.accepted,
    reason: event.reason,
  };
  try {
    const prev = (await PersistenceService.getKv<GeofenceDiagEvent[]>(KV_KEYS.GEOFENCE_DIAG)) ?? [];
    const next = [...(Array.isArray(prev) ? prev : []), entry].slice(-DIAG_LIMIT);
    await PersistenceService.setKv(KV_KEYS.GEOFENCE_DIAG, next);
    StoreActions.healthUpdated({ geofenceDiag: next });
  } catch {
    // El diagnóstico nunca debe impedir un fichaje.
  }
}

export async function readGeofenceDiag(): Promise<GeofenceDiagEvent[]> {
  try {
    const rows = await PersistenceService.getKv<GeofenceDiagEvent[]>(KV_KEYS.GEOFENCE_DIAG);
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((r) => !!r && typeof r.atMs === "number" && typeof r.kind === "string" && typeof r.accepted === "boolean")
      .slice(-DIAG_LIMIT);
  } catch {
    return [];
  }
}
