import * as TaskManager from "expo-task-manager";
import * as BackgroundTask from "expo-background-task";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BackgroundTaskName } from "../core/contracts";
import { log } from "../utils/logger";
import { now as nowMs } from "../utils/timeProvider";
import { persistenceService } from "./PersistenceService";

/**
 * ============================================================================
 * TaskOrchestratorService — Propuesta 5.7
 * ----------------------------------------------------------------------------
 * Unifica BackgroundTasks.ts + AutomatedReporting + los `TaskManager.defineTask`
 * dispersos (ver Consolidated_AUDIT.md, tareas OS) en un director único de
 * supervivencia de proceso. Inventario fijo de 7 tareas (Propuesta §7):
 * GEOFENCE, BREADCRUMB, SESSION_WATCHDOG, EXIT_DECISION_TIMER, DAILY_REMINDER,
 * INTEGRITY_SWEEP, PAYROLL_EXPORT.
 *
 * Reglas de frontera:
 *  - Idempotencia: una tarea NUNCA vuelve a cerrar una sesión ya CERRADA.
 *    Cada handler registrado aquí debe re-verificar el estado persistido
 *    antes de mutar nada (los handlers reales de negocio viven en
 *    SessionEngineService; este servicio solo orquesta el ciclo de vida de
 *    las tareas nativas y el heartbeat de supervivencia).
 *  - Heartbeat: en boot, `heartbeat()` compara el último latido persistido
 *    contra ahora. Si el proceso murió con una jornada ACTIVA, reporta
 *    `needsOsKillLedgerEntry: true` — este servicio NO escribe el ledger
 *    directamente (esa autoridad es de IntegrityLedgerService/SessionEngine);
 *    solo detecta y reporta el hecho, tal como exige la propuesta ("se
 *    reconstruye estado y se anota OS_KILL en el ledger").
 * ============================================================================
 */

const HEARTBEAT_KEY = "dualtracker.taskOrchestrator.lastHeartbeatAtMs";
const HEARTBEAT_SESSION_KEY = "dualtracker.taskOrchestrator.heartbeatSessionId";
/** Si el gap entre latidos supera esto, se asume que el SO mató el proceso. */
const HEARTBEAT_KILL_GAP_MS = 3 * 60 * 1000;
/** Frecuencia esperada del heartbeat en primer plano/segundo plano. */
export const HEARTBEAT_INTERVAL_MS = 60 * 1000;

/** Descriptor estático de una tarea de segundo plano del inventario fijo. */
export interface BackgroundTaskDescriptor {
  name: BackgroundTaskName;
  /** Nombre real registrado en TaskManager (namespaced para evitar colisiones). */
  taskManagerName: string;
  description: string;
}

const TASK_INVENTORY: Record<BackgroundTaskName, BackgroundTaskDescriptor> = {
  GEOFENCE: {
    name: "GEOFENCE",
    taskManagerName: "DT_TASK_GEOFENCE",
    description: "Enter/Exit nativo. Hecho espacial, nunca cierra nómina sola.",
  },
  BREADCRUMB: {
    name: "BREADCRUMB",
    taskManagerName: "DT_TASK_BREADCRUMB",
    description: "Punto de traza en ACTIVA/TRASLADO. Sin efecto de pago directo.",
  },
  SESSION_WATCHDOG: {
    name: "SESSION_WATCHDOG",
    taskManagerName: "DT_TASK_SESSION_WATCHDOG",
    description: "Detecta jornada huérfana, OS kill o >12h. Puede proponer AUTO-CLOSE.",
  },
  EXIT_DECISION_TIMER: {
    name: "EXIT_DECISION_TIMER",
    taskManagerName: "DT_TASK_EXIT_DECISION_TIMER",
    description: "Notificación de decisión tras la primera salida. Si expira: CONFLICT o AUTO.",
  },
  DAILY_REMINDER: {
    name: "DAILY_REMINDER",
    taskManagerName: "DT_TASK_DAILY_REMINDER",
    description: "Solo aviso a hora configurada. No inventa sesión.",
  },
  INTEGRITY_SWEEP: {
    name: "INTEGRITY_SWEEP",
    taskManagerName: "DT_TASK_INTEGRITY_SWEEP",
    description:
      "Relee permisos y deriva de reloj al rehidratar o cada N horas. Recalifica integridad.",
  },
  PAYROLL_EXPORT: {
    name: "PAYROLL_EXPORT",
    taskManagerName: "DT_TASK_PAYROLL_EXPORT",
    description: "Arma EvidencePack al fin de semana o manual. No recalcula con otra política.",
  },
};

type TaskRunner = () => Promise<void>;

export interface HeartbeatResult {
  needsOsKillLedgerEntry: boolean;
  sessionId: number | null;
  gapMs: number | null;
}

class TaskOrchestratorService {
  private readonly registeredTasks = new Set<BackgroundTaskName>();
  /** Guarda de idempotencia en memoria: última sesión ya procesada por tarea. */
  private readonly lastHandledSessionByTask = new Map<BackgroundTaskName, number | null>();

  /** Devuelve el descriptor estático de una tarea del inventario fijo. */
  getDescriptor(name: BackgroundTaskName): BackgroundTaskDescriptor {
    return TASK_INVENTORY[name];
  }

  listInventory(): BackgroundTaskDescriptor[] {
    return Object.values(TASK_INVENTORY);
  }

  /**
   * Registra una tarea nativa una sola vez (guard de idempotencia de
   * definición). El `runner` es responsable de re-verificar el estado
   * persistido antes de mutar cualquier sesión.
   */
  register(name: BackgroundTaskName, runner: TaskRunner): void {
    const descriptor = TASK_INVENTORY[name];
    if (!descriptor) {
      throw new Error(`Tarea desconocida fuera del inventario fijo: ${name}`);
    }

    if (TaskManager.isTaskDefined(descriptor.taskManagerName)) {
      this.registeredTasks.add(name);
      return;
    }

    TaskManager.defineTask(descriptor.taskManagerName, async () => {
      try {
        await runner();
        return BackgroundTask.BackgroundTaskResult.Success;
      } catch (error) {
        log("ROJO", "SERVICIOS_ACTIVOS", "ERROR", `TaskOrchestrator: fallo ejecutando ${name}`, {
          error: String(error),
        });
        return BackgroundTask.BackgroundTaskResult.Failed;
      }
    });

    this.registeredTasks.add(name);
  }

  async unregister(name: BackgroundTaskName): Promise<void> {
    const descriptor = TASK_INVENTORY[name];
    if (!descriptor) return;

    if (TaskManager.isTaskDefined(descriptor.taskManagerName)) {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(descriptor.taskManagerName);
      if (isRegistered) {
        await TaskManager.unregisterTaskAsync(descriptor.taskManagerName);
      }
    }

    this.registeredTasks.delete(name);
  }

  isRegistered(name: BackgroundTaskName): boolean {
    return this.registeredTasks.has(name);
  }

  /**
   * Guarda de idempotencia explícita: verifica si `sessionId` ya fue
   * procesado por `taskName` en esta corrida de proceso, y de lo contrario
   * lo marca como manejado. Los handlers reales SIEMPRE deben, además,
   * releer el estado persistido de la sesión (esta guarda en memoria no
   * sobrevive un OS kill; es una defensa adicional, no la única).
   */
  markHandledIfNew(taskName: BackgroundTaskName, sessionId: number | null): boolean {
    const last = this.lastHandledSessionByTask.get(taskName);
    if (last === sessionId) {
      return false;
    }
    this.lastHandledSessionByTask.set(taskName, sessionId);
    return true;
  }

  /**
   * Debe llamarse periódicamente (foreground timer o cada ejecución de
   * SESSION_WATCHDOG) mientras haya una jornada abierta. Persiste el latido
   * en AsyncStorage para poder detectar un OS kill al reabrir la app.
   */
  async beat(sessionId: number): Promise<void> {
    await AsyncStorage.multiSet([
      [HEARTBEAT_KEY, String(nowMs())],
      [HEARTBEAT_SESSION_KEY, String(sessionId)],
    ]);
  }

  /** Limpia el heartbeat cuando la jornada cierra limpiamente. */
  async clearHeartbeat(): Promise<void> {
    await AsyncStorage.multiRemove([HEARTBEAT_KEY, HEARTBEAT_SESSION_KEY]);
  }

  /**
   * Llamar en boot. Detecta si el proceso fue matado por el SO mientras
   * había una jornada ACTIVA: heartbeat persistido + gap mayor al esperado,
   * y la sesión referenciada sigue abierta en persistencia (idempotencia:
   * si ya está CERRADA, no hay nada que anotar).
   */
  async heartbeat(): Promise<HeartbeatResult> {
    const [[, lastBeatStr], [, sessionIdStr]] = await AsyncStorage.multiGet([
      HEARTBEAT_KEY,
      HEARTBEAT_SESSION_KEY,
    ]);

    if (!lastBeatStr || !sessionIdStr) {
      return { needsOsKillLedgerEntry: false, sessionId: null, gapMs: null };
    }

    const lastBeatMs = parseInt(lastBeatStr, 10);
    const sessionId = parseInt(sessionIdStr, 10);
    if (!Number.isFinite(lastBeatMs) || !Number.isFinite(sessionId)) {
      return { needsOsKillLedgerEntry: false, sessionId: null, gapMs: null };
    }

    const gapMs = nowMs() - lastBeatMs;
    if (gapMs < HEARTBEAT_KILL_GAP_MS) {
      return { needsOsKillLedgerEntry: false, sessionId, gapMs };
    }

    // Idempotencia dura: releer el estado persistido, no solo la memoria.
    const session = await persistenceService.getSessionRecord(sessionId).catch(() => null);

    if (!session || session.domainStatus === "CERRADA") {
      // Ya se cerró (por SessionEngine, por watchdog, o manualmente).
      await this.clearHeartbeat();
      return { needsOsKillLedgerEntry: false, sessionId, gapMs };
    }

    return { needsOsKillLedgerEntry: true, sessionId, gapMs };
  }
}

export const taskOrchestratorService = new TaskOrchestratorService();
export { TASK_INVENTORY };
