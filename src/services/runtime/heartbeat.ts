/**
 * Heartbeat del proceso (KV runtime.heartbeat). Lo escriben el primer plano,
 * el worker y las tareas de geocerca / miga. El vigilante lo lee para decidir
 * si la jornada quedó huérfana.
 */
import { HEARTBEAT_GAP_MS } from "../../constants/tasks";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { PersistenceService } from "../persistence/PersistenceService";
import { KV_KEYS } from "../persistence/schema";

export { HEARTBEAT_GAP_MS };

export async function touchHeartbeat(): Promise<void> {
  await PersistenceService.setKv(KV_KEYS.HEARTBEAT, TimeAuthorityService.now()).catch(() => {});
}

export async function readHeartbeat(): Promise<number | null> {
  const value = await PersistenceService.getKv<number>(KV_KEYS.HEARTBEAT);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
