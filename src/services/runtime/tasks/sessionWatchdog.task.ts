/**
 * SESSION_WATCHDOG (Propuesta Técnica §7.2) — 15–30 min o al boot.
 * Detecta jornada huérfana, pérdida de proveedor o > 12 h. Puede PROPONER
 * AUTO-CLOSE: la clase resultante nunca es VALID (sessionMachine).
 * Idempotente: si la sesión ya está cerrada, el engine rechaza la intención.
 */
import * as Location from "expo-location";
import { MAX_OPEN_SESSION_MS } from "../../../constants/tasks";
import { SessionEngineService } from "../../domain/SessionEngineService";
import { TimeAuthorityService } from "../../evidence/TimeAuthorityService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { GeofenceRuntimeService } from "../GeofenceRuntimeService";

export async function runSessionWatchdog(): Promise<void> {
  const session = await PersistenceService.getOpenSession();
  if (!session) return;
  const now = TimeAuthorityService.now();

  // 1) Salida pendiente cuyo debounce venció en segundo plano.
  await GeofenceRuntimeService.checkPendingExit();

  // 2) Proveedor de ubicación apagado con jornada abierta.
  const enabled = await Location.hasServicesEnabledAsync().catch(() => null);
  if (enabled === false) await GeofenceRuntimeService.reportProviderLoss(session);

  // 3) Tope de 12 h.
  const start = session.actualStartAtMs ?? session.declaredStartAtMs;
  if (now - start > MAX_OPEN_SESSION_MS) {
    const outside = await GeofenceRuntimeService.isCurrentlyOutside();
    await SessionEngineService.dispatch({ type: "AUTO_CLOSE", cause: "MAX_OPEN_12H", confirmedOutside: outside === true }, "WATCHDOG");
  }
  // TODO(propuesta): criterio de "jornada huérfana" distinto del tope de 12 h
  // (p. ej. ESPERANDO sin llegada N horas) no está definido.
}
