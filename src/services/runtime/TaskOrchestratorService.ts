/**
 * TaskOrchestratorService — Runtime (Propuesta Técnica §5.7, nuevo, OS)
 * ============================================================================
 * Unifica BackgroundTasks.ts (GEOTrack), AutomatedReporting y los defineTask
 * dispersos. Es el director de supervivencia del proceso.
 *  - Inventario: GEOFENCE, BREADCRUMB, SESSION_WATCHDOG, EXIT_DECISION_TIMER,
 *    DAILY_REMINDER, INTEGRITY_SWEEP, PAYROLL_EXPORT (src/constants/tasks.ts).
 *  - Android: FGS de ubicación mientras hay jornada abierta (ForegroundWork).
 *    iOS: geofence + background task. TODO(iOS): significant-change
 *    (Location.startLocationUpdatesAsync con deferred updates) no cableado.
 *  - Idempotencia: una tarea no vuelve a cerrar una sesión ya cerrada (el
 *    engine rechaza; además cada tarea comprueba estado).
 *  - Heartbeat: KV runtime.heartbeat; al rehidratar, un hueco grande con
 *    jornada abierta se anota como OS_KILL en el ledger (boot.ts).
 *  - Exclusión mutua con ConcurrencyGuard (sustituye `isTaskRunningMutex`).
 *
 * defineTasks() DEBE llamarse en el ámbito global del bundle (app/_layout.tsx)
 * para que las tareas headless existan cuando el SO despierta la app.
 */
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { AppState, type AppStateStatus } from "react-native";
import { BREADCRUMB_TASK_NAME, GEOFENCE_TASK_NAME } from "../../constants/geolocation";
import { BACKGROUND_WORKER_MIN_INTERVAL_MIN, BACKGROUND_WORKER_TASK_NAME } from "../../constants/tasks";
import { serializeError } from "../../utils/serializeError";
import { ConcurrencyGuardService, MutexBusyError } from "../domain/ConcurrencyGuardService";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { LoggingService } from "../persistence/LoggingService";
import { PersistenceService } from "../persistence/PersistenceService";
import { KV_KEYS } from "../persistence/schema";
import { readHeartbeat, touchHeartbeat } from "./heartbeat";
import { NotificationService } from "./NotificationService";
import type { ExitDecisionDeadline } from "./tasks";
import {
  runBreadcrumbTask,
  runDailyReminder,
  runExitDecisionTimer,
  runGeofenceTask,
  runIntegritySweep,
  runPayrollExport,
  runSessionWatchdog,
} from "./tasks";

export { HEARTBEAT_GAP_MS } from "../../constants/tasks";
const FOREGROUND_HEARTBEAT_MS = 60 * 1000;

type EnsureReady = () => Promise<void>;
let ensureReady: EnsureReady = async () => {};
let defined = false;
let exitTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;

async function guarded(label: string, work: () => Promise<void>): Promise<void> {
  try {
    await ConcurrencyGuardService.withLock("worker", "WATCHDOG", label, work);
  } catch (error) {
    if (error instanceof MutexBusyError) {
      LoggingService.log("BLANCO", "BACKGROUND_TASK", "DEBUG", `${label} omitida: otra tarea en curso`);
      return;
    }
    throw error;
  }
}

export const TaskOrchestratorService = {
  /**
   * Define las tareas headless. `bootstrap` prepara SQLite y puertos cuando
   * el SO despierta la app sin UI (lo aporta core/boot.ts).
   */
  defineTasks(bootstrap: EnsureReady): void {
    ensureReady = bootstrap;
    if (defined) return;
    defined = true;

    TaskManager.defineTask(GEOFENCE_TASK_NAME, async (body) => {
      await ensureReady();
      await runGeofenceTask(body as Parameters<typeof runGeofenceTask>[0]);
    });

    TaskManager.defineTask(BREADCRUMB_TASK_NAME, async (body) => {
      await ensureReady();
      await runBreadcrumbTask(body as Parameters<typeof runBreadcrumbTask>[0], TaskOrchestratorService.heartbeat);
    });

    TaskManager.defineTask(BACKGROUND_WORKER_TASK_NAME, async () => {
      try {
        await ensureReady();
        await TaskOrchestratorService.runWorker();
        return BackgroundTask.BackgroundTaskResult.Success;
      } catch (error) {
        LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "Error en worker de fondo", serializeError(error));
        return BackgroundTask.BackgroundTaskResult.Failed;
      }
    });
  },

  /** Registra el worker periódico (expo-background-task, mínimo 15 min). */
  async registerBackgroundWorker(): Promise<boolean> {
    try {
      const status = await BackgroundTask.getStatusAsync();
      if (status === BackgroundTask.BackgroundTaskStatus.Restricted) {
        LoggingService.log("NARANJA", "SERVICIOS_ACTIVOS", "WARN", "Tareas de fondo restringidas por el sistema");
        return false;
      }
      if (!(await TaskManager.isTaskRegisteredAsync(BACKGROUND_WORKER_TASK_NAME))) {
        await BackgroundTask.registerTaskAsync(BACKGROUND_WORKER_TASK_NAME, { minimumInterval: BACKGROUND_WORKER_MIN_INTERVAL_MIN });
      }
      return true;
    } catch (error) {
      LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "Error registrando tareas de fondo", serializeError(error));
      return false;
    }
  },

  /** Worker: watchdog + temporizador de salida + barrido + exportación. */
  async runWorker(): Promise<void> {
    await guarded("BACKGROUND_WORKER", async () => {
      // El vigilante lee el heartbeat anterior: si este worker lo renovara antes,
      // un hueco de más de 45 min no se vería.
      await runExitDecisionTimer().catch((e) => LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "EXIT_DECISION_TIMER", serializeError(e)));
      await runSessionWatchdog().catch((e) => LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "SESSION_WATCHDOG", serializeError(e)));
      await TaskOrchestratorService.heartbeat();
      await runIntegritySweep().catch((e) => LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "INTEGRITY_SWEEP", serializeError(e)));
      await runPayrollExport().catch((e) => LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "PAYROLL_EXPORT", serializeError(e)));
    });
  },

  /** Watchdog al boot (§7.2 "o al boot"). */
  async runBootChecks(): Promise<void> {
    await guarded("BOOT_CHECKS", async () => {
      await runExitDecisionTimer();
      await runSessionWatchdog();
      await runDailyReminder();
    });
  },

  async heartbeat(): Promise<void> {
    await touchHeartbeat();
  },

  async lastHeartbeat(): Promise<number | null> {
    return readHeartbeat();
  },

  /** Heartbeat y re-anclaje del reloj mientras la app está en primer plano. */
  startForegroundLoop(onForeground: () => void): void {
    if (!heartbeatTimer) {
      heartbeatTimer = setInterval(() => {
        TaskOrchestratorService.heartbeat();
      }, FOREGROUND_HEARTBEAT_MS);
    }
    if (!appStateSub) {
      appStateSub = AppState.addEventListener("change", (s: AppStateStatus) => {
        if (s === "active") {
          TaskOrchestratorService.heartbeat();
          onForeground();
        }
      });
    }
  },

  stopForegroundLoop(): void {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    appStateSub?.remove();
    appStateSub = null;
  },

  // -------------------------------------------------------------------------
  // EXIT_DECISION_TIMER (puerto que usa SessionEngine)
  // -------------------------------------------------------------------------
  async scheduleExitDecision(sessionId: number, firstExitAtMs: number, windowMs: number): Promise<void> {
    const deadline: ExitDecisionDeadline = { sessionId, firstExitAtMs, deadlineMs: TimeAuthorityService.now() + windowMs };
    await PersistenceService.setKv(KV_KEYS.EXIT_DECISION, deadline);
    await NotificationService.notifyExitDetected(sessionId, firstExitAtMs);
    if (exitTimer) clearTimeout(exitTimer);
    exitTimer = setTimeout(() => {
      exitTimer = null;
      guarded("EXIT_DECISION_TIMER", async () => {
        await runExitDecisionTimer();
      }).catch(() => {});
    }, windowMs + 1000);
  },

  async cancelExitDecision(sessionId: number): Promise<void> {
    if (exitTimer) clearTimeout(exitTimer);
    exitTimer = null;
    await PersistenceService.deleteKv(KV_KEYS.EXIT_DECISION).catch(() => {});
    await NotificationService.dismissExit(sessionId);
  },

  /** Solo desarrollo: fuerza el worker (portado de triggerForTesting). */
  async triggerForTesting(): Promise<void> {
    if (__DEV__) await BackgroundTask.triggerTaskWorkerForTestingAsync();
  },
};
