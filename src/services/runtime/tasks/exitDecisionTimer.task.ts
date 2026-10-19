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
import { MIN_DWELL_BEFORE_EXIT_MS } from "../geofencePolicy";
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
  if (!session || session.id !== d.sessionId || session.domainStatus !== "SALIDA") {
    await PersistenceService.deleteKv(KV_KEYS.EXIT_DECISION);
    return false;
  }
  const outside = await GeofenceRuntimeService.isCurrentlyOutside();
  // Un EXIT a los pocos segundos de llegar, sin un fix claramente fuera, es el
  // rebote de Android (cierre de 0.00 h). Se vuelve a ACTIVA en vez de cerrar.
  const start = session.actualStartAtMs ?? session.declaredStartAtMs;
  const end = session.bookkeeping.firstExitAtMs ?? d.firstExitAtMs;
  if (end - start < MIN_DWELL_BEFORE_EXIT_MS && outside !== true) {
    const stayed = await SessionEngineService.dispatch({ type: "STAY_WORKING" }, "WATCHDOG");
    if (stayed.ok) {
      await PersistenceService.deleteKv(KV_KEYS.EXIT_DECISION);
      await NotificationService.dismissExit(d.sessionId);
      return false;
    }
  }
  await PersistenceService.deleteKv(KV_KEYS.EXIT_DECISION);
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
