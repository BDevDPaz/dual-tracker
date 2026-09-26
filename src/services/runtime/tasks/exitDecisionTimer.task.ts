/**
 * EXIT_DECISION_TIMER (Propuesta Técnica §7.2 y §7.3).
 * Tras SALIDA, si el usuario no decide dentro de company.exitDecisionWindowMs:
 *  - política "CONFLICT": cierre a la hora de la PRIMERA salida, clase CONFLICT.
 *  - política "AUTO_IF_CONFIRMED_OUTSIDE": AUTO solo si un fix fiable confirma
 *    que sigue fuera; si no, CONFLICT.
 * El plazo se guarda en app_kv para sobrevivir a la muerte del proceso; lo
 * revisa el worker de fondo y, en primer plano, un temporizador.
 */
import { SessionEngineService } from "../../domain/SessionEngineService";
import { TimeAuthorityService } from "../../evidence/TimeAuthorityService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { KV_KEYS } from "../../persistence/schema";
import { t } from "../../../i18n";
import { GeofenceRuntimeService } from "../GeofenceRuntimeService";
import { NotificationService } from "../NotificationService";

export interface ExitDecisionDeadline {
  sessionId: number;
  firstExitAtMs: number;
  deadlineMs: number;
}

export async function runExitDecisionTimer(): Promise<boolean> {
  const d = await PersistenceService.getKv<ExitDecisionDeadline>(KV_KEYS.EXIT_DECISION);
  if (!d) return false;
  if (TimeAuthorityService.now() < d.deadlineMs) return false;
  const session = await PersistenceService.getOpenSession();
  await PersistenceService.deleteKv(KV_KEYS.EXIT_DECISION);
  if (!session || session.id !== d.sessionId || session.domainStatus !== "SALIDA") return false;
  const outside = await GeofenceRuntimeService.isCurrentlyOutside();
  const r = await SessionEngineService.dispatch(
    { type: "AUTO_CLOSE", cause: "EXIT_DECISION_EXPIRED", confirmedOutside: outside === true },
    "WATCHDOG",
  );
  if (r.ok) {
    await NotificationService.dismissExit(d.sessionId);
    await NotificationService.notifyImmediate(t("notifications.exitDecisionExpiredTitle"), t("notifications.exitDecisionExpiredBody"), {
      kind: "SESSION_REVIEW",
      sessionId: d.sessionId,
    });
  }
  return r.ok;
}
