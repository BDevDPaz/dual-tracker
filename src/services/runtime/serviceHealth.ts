/**
 * Latido por componente. La tabla es local y aditiva.
 * Primer plano: el heartbeat agregado sigue en ~60 s (KV).
 * Segundo plano: cada componente se marca cuando corre (miga, geocerca, worker, vigilante).
 * No hay un temporizador nuevo de 30 s.
 */
import type { ServiceComponent } from "../../core/contracts";
import { SERVICE_COMPONENTS } from "../../core/contracts";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { PersistenceService } from "../persistence/PersistenceService";

export type { ServiceComponent };

export async function touchServiceHealth(component: ServiceComponent, atMs = TimeAuthorityService.now()): Promise<void> {
  await PersistenceService.upsertServiceHealth(component, atMs).catch(() => {});
}

function isServiceComponent(value: string): value is ServiceComponent {
  return (SERVICE_COMPONENTS as readonly string[]).includes(value);
}

export async function readServiceHealth(): Promise<{ component: ServiceComponent; lastHeartbeatMs: number }[]> {
  const rows = await PersistenceService.listServiceHealth().catch(() => [] as { component: string; lastHeartbeatMs: number }[]);
  const beats: { component: ServiceComponent; lastHeartbeatMs: number }[] = [];
  for (const row of rows) {
    if (isServiceComponent(row.component)) beats.push({ component: row.component, lastHeartbeatMs: row.lastHeartbeatMs });
  }
  return beats;
}
