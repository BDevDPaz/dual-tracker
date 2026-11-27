/**
 * EXIT_DECISION_TIMER (Propuesta Técnica §7.2 y §7.3).
 * Tras SALIDA, si el usuario no decide dentro de company.exitDecisionWindowMs,
 * al vencer el plazo se pregunta a isCurrentlyOutside() ANTES de borrar el plazo:
 *  - estancia corta (rebote de Android) y sin fix claramente fuera → STAY_WORKING;
 *  - fix fiable fuera (true) → AUTO_CLOSE a la hora de la PRIMERA salida. La
 *    política solo decide la clase: "AUTO_IF_CONFIRMED_OUTSIDE" → AUTO (si la
 *    primera salida fue fiable); "CONFLICT" → CONFLICT (sessionMachine);
 *  - fix fiable dentro (false) → STAY_WORKING;
 *  - sin fix fiable (null) → no cierra ni reprograma: la jornada sigue en SALIDA
 *    con la hoja, hasta que el usuario decida, una muestra la vea dentro
 *    (STAY_WORKING) o el watchdog la cierre por el tope de 12 h (no si se
 *    amplió la jornada ni si está en revisión por abandono).
 * Ninguna política cierra sin un fix fiable fuera.
 *
 * El plazo vive en app_kv (EXIT_DECISION), pero el cierre solo lo ejecuta el
 * proceso que armó la hoja (failsafeArmedInProcess, D-17): el worker de fondo y
 * el temporizador en primer plano lo revisan solo si ese flag sigue en memoria.
 * Si el proceso muere, el plazo NO sobrevive: al arrancar, boot() borra
 * EXIT_DECISION, anota EXIT_REOPEN y reabre la hoja (exitReopened) sin cierre
 * automático. Si la app sigue viva en segundo plano, expo-task-manager ejecuta
 * las tareas en ese mismo runtime JS: el flag se comparte y el plazo sí puede
 * cerrar la jornada.
 */
import { SessionEngineService } from "../../domain/SessionEngineService";
import { TimeAuthorityService } from "../../evidence/TimeAuthorityService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { KV_KEYS } from "../../persistence/schema";
import { GeofenceRuntimeService } from "../GeofenceRuntimeService";
import { MIN_DWELL_BEFORE_EXIT_MS } from "../geofencePolicy";
import { NotificationService } from "../NotificationService";

export interface ExitDecisionDeadline {
  sessionId: number;
  firstExitAtMs: number;
  deadlineMs: number;
}

/** El cierre de 15 min solo vive en el proceso que mostró la hoja. Reabrir no lo hereda (D-17). */
let failsafeArmedInProcess = false;

export function armExitFailsafeInProcess(): void {
  failsafeArmedInProcess = true;
}

export function disarmExitFailsafeInProcess(): void {
  failsafeArmedInProcess = false;
}

export async function runExitDecisionTimer(): Promise<boolean> {
  if (!failsafeArmedInProcess) return false;
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
  disarmExitFailsafeInProcess();
  if (outside !== true) {
    if (outside === false) {
      const stayed = await SessionEngineService.dispatch({ type: "STAY_WORKING" }, "WATCHDOG");
      if (stayed.ok) await NotificationService.dismissExit(d.sessionId);
    }
    return false;
  }
  const r = await SessionEngineService.dispatch(
    { type: "AUTO_CLOSE", cause: "EXIT_DECISION_EXPIRED", confirmedOutside: true },
    "WATCHDOG",
  );
  if (r.ok && r.data?.session) {
    await NotificationService.dismissExit(d.sessionId);
    await NotificationService.notifyAutoClose(r.data.session);
  }
  return r.ok;
}
