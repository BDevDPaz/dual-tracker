/**
 * SESSION_WATCHDOG (Propuesta Técnica §7.2) — 15–30 min o al boot.
 * Detecta jornada huérfana, pérdida de proveedor o > 12 h. Puede PROPONER
 * AUTO-CLOSE: la clase resultante nunca es VALID (sessionMachine).
 * Idempotente: si la sesión ya está cerrada, el engine rechaza la intención.
 */
import * as Location from "expo-location";
import { MAX_OPEN_SESSION_MS } from "../../../constants/tasks";
import { SessionEngineService } from "../../domain/SessionEngineService";
import { observeClock } from "../../evidence/clockSample";
import { TimeAuthorityService } from "../../evidence/TimeAuthorityService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { GeofenceRuntimeService } from "../GeofenceRuntimeService";
import { reviewAbandonedSession } from "../orphanSession";

export async function runSessionWatchdog(): Promise<void> {
  const session = await PersistenceService.getOpenSession();
  if (!session) return;
  const now = TimeAuthorityService.now();

  // Hora de red también en el vigilante. Sin red no bloquea.
  await observeClock("WATCHDOG").catch(() => {});

  // 1) Salida pendiente cuyo debounce venció en segundo plano.
  await GeofenceRuntimeService.checkPendingExit();

  // 2) Proveedor de ubicación apagado con jornada abierta.
  const enabled = await Location.hasServicesEnabledAsync().catch(() => null);
  if (enabled === false) await GeofenceRuntimeService.reportProviderLoss(session);

  // 3) Jornada huérfana: hueco de heartbeat y sin fix dentro del sitio.
  //    Revisar, sin cerrar. Si ya está en revisión, el tope de 12 h no inventa horas.
  const fresh = await PersistenceService.getOpenSession();
  const orphan = await reviewAbandonedSession(fresh ?? session);
  if (orphan !== "clear") return;

  // 4) Tope de 12 h (solo si no quedó en revisión por abandono).
  const current = (await PersistenceService.getOpenSession()) ?? session;
  const start = current.actualStartAtMs ?? current.declaredStartAtMs;
  if (now - start > MAX_OPEN_SESSION_MS && current.domainStatus !== "CERRADA") {
    const outside = await GeofenceRuntimeService.isCurrentlyOutside();
    await SessionEngineService.dispatch({ type: "AUTO_CLOSE", cause: "MAX_OPEN_12H", confirmedOutside: outside === true }, "WATCHDOG");
  }
}
