/**
 * SESSION_WATCHDOG (Propuesta Técnica §7.2) — 15–30 min o al boot.
 * Detecta jornada huérfana, pérdida de proveedor o > 12 h. Puede PROPONER
 * AUTO-CLOSE: la clase resultante nunca es VALID (sessionMachine).
 * Idempotente: si la sesión ya está cerrada, el engine rechaza la intención.
 */
import * as Location from "expo-location";
import { MAX_OPEN_SESSION_MS } from "../../../constants/tasks";
import { mealAlreadyStarted } from "../../domain/caPremiums";
import { computeSessionMinutes } from "../../domain/PayrollEngineService";
import { SessionEngineService } from "../../domain/SessionEngineService";
import { observeClock } from "../../evidence/clockSample";
import { TimeAuthorityService } from "../../evidence/TimeAuthorityService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { SettingsService } from "../../persistence/SettingsService";
import { companyCalendar } from "../../../utils/companyPolicy";
import { workdayStartAt } from "../../../utils/dateUtils";
import type { SessionRecord } from "../../../core/contracts";
import { NotificationService } from "../NotificationService";
import { GeofenceRuntimeService } from "../GeofenceRuntimeService";
import { recoverMonitoring } from "../monitoringRecovery";
import { touchServiceHealth } from "../serviceHealth";
import { reviewAbandonedSession } from "../orphanSession";

export async function runSessionWatchdog(): Promise<void> {
  const session = await PersistenceService.getOpenSession();
  if (!session) return;
  await touchServiceHealth("watchdog");
  // Antes del cierre de 12 h y del hueco de huérfana: el último asiento de
  // esas pruebas sigue siendo el del motor, y el hueco se mide con el
  // heartbeat todavía sin renovar.
  await recoverMonitoring("background");
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

  // 4) Avisos de comida y descanso sobre el total del día. No cambian la jornada.
  const current = (await PersistenceService.getOpenSession()) ?? session;
  await remindMealRest(current, now).catch(() => {});

  // 5) Tope de 12 h (solo si no quedó en revisión por abandono).
  const start = current.actualStartAtMs ?? current.declaredStartAtMs;
  if (now - start > MAX_OPEN_SESSION_MS && current.domainStatus !== "CERRADA") {
    const outside = await GeofenceRuntimeService.isCurrentlyOutside();
    await SessionEngineService.dispatch({ type: "AUTO_CLOSE", cause: "MAX_OPEN_12H", confirmedOutside: outside === true }, "WATCHDOG");
  }
}

async function remindMealRest(open: SessionRecord, nowMs: number): Promise<void> {
  const company = (await SettingsService.load()).company;
  const history = companyCalendar(company);
  const day = workdayStartAt(open.actualStartAtMs ?? open.declaredStartAtMs, history);
  const sessions = await PersistenceService.listSessions();
  const same: SessionRecord[] = [];
  let worked = 0;
  for (const s of sessions) {
    if (s.bookkeeping.isDeleted || s.bookkeeping.cancelled) continue;
    const st = s.actualStartAtMs ?? s.declaredStartAtMs;
    if (workdayStartAt(st, history) !== day) continue;
    same.push(s);
    const minutes = computeSessionMinutes(s, company, nowMs);
    if (minutes) worked += minutes.workMinutes + minutes.transitPaidMinutes;
  }
  await NotificationService.scheduleMealRestNotices({
    sessionId: open.id,
    nowMs,
    workedMinutes: worked,
    mealAlreadyStarted: mealAlreadyStarted(same),
    restAcknowledged: same.some((s) => s.bookkeeping.compliance?.restBreaksTaken === true),
  });
}
