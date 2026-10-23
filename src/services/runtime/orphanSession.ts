/**
 * Jornada huérfana (tanda 1).
 * Si el heartbeat lleva más que HEARTBEAT_GAP_MS sin renovarse Y no hay un
 * fix dentro del sitio, la jornada pasa a Revisar (ORPHAN_SESSION).
 * No se cierra y no se inventa una hora. El operario confirma el fin (con
 * nota) o sigue trabajando.
 */
import type { SessionRecord } from "../../core/contracts";
import { HEARTBEAT_GAP_MS } from "../../constants/tasks";
import { SessionEngineService } from "../domain/SessionEngineService";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { PersistenceService } from "../persistence/PersistenceService";
import { GeofenceRuntimeService } from "./GeofenceRuntimeService";
import { readHeartbeat } from "./heartbeat";
import { NotificationService } from "./NotificationService";

export type OrphanReview = "marked" | "held" | "clear";

/**
 * `held` = ya está en revisión por abandono (no cerrar sola).
 * `marked` = acaba de pasar a Revisar.
 * `clear` = no aplica (hay heartbeat reciente, o el último fix está dentro).
 */
export async function reviewAbandonedSession(session?: SessionRecord | null): Promise<OrphanReview> {
  const open = session === undefined ? await PersistenceService.getOpenSession() : session;
  if (!open) return "clear";
  if (open.bookkeeping.integrityReason === "ORPHAN_SESSION") return "held";
  const last = await readHeartbeat();
  const now = TimeAuthorityService.now();
  // Sin heartbeat previo no hay hueco medido (primer arranque). No se inventa el abandono.
  if (last === null || now - last <= HEARTBEAT_GAP_MS) return "clear";
  const outside = await GeofenceRuntimeService.isCurrentlyOutside();
  // false = dentro del sitio. Con fix interior no es jornada huérfana.
  if (outside === false) return "clear";
  const result = await SessionEngineService.dispatch({ type: "MARK_ORPHAN" }, "WATCHDOG");
  if (!result.ok) return result.detail === "ALREADY_ORPHAN" ? "held" : "clear";
  await NotificationService.notifyOrphan(open.id);
  return "marked";
}
