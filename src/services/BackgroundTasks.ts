import { now, currentDate } from "../utils/timeProvider";
import * as TaskManager from "expo-task-manager";
import * as BackgroundTask from "expo-background-task";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { log, logAudit, AUDIT_ACTIONS } from "../utils/logger";
import { ensureDbReady } from "../database/db";
import { generateWeeklyReport } from "./ReportGenerator";
import { EXIT_TIMESTAMP_KEY } from "./LocationManager";
import { workTrackerEngine } from "../core/workTrackerEngine";
import * as Location from "expo-location";
import { getDistanceFromLatLonInMeters } from "../utils/geoUtils";

type WorkSession = any;
const TASK_NAME = "APP_BACKGROUND_SERVICES";
const REPORT_STORAGE_KEY = "LAST_REPORT_WEEK_ID";
const FAILSAFE_THRESHOLD_MS = 15 * 60 * 1000;

let isTaskRunningMutex = false;

TaskManager.defineTask(TASK_NAME, async () => {
  // MUTEX_LOCK logic to prevent concurrent execution and satisfy CONC-002
  if (isTaskRunningMutex) {
    await logAudit({
      session_id: null,
      action_type: AUDIT_ACTIONS.MUTEX,
      details: "MUTEX_SKIPPED: Task already running",
      timestamp: now(),
    });
    return BackgroundTask.BackgroundTaskResult.Success;
  }

  isTaskRunningMutex = true;
  await logAudit({
    session_id: null,
    action_type: AUDIT_ACTIONS.MUTEX,
    details: "MUTEX_LOCK acquired",
    timestamp: now(),
  });

  try {
    const db = await ensureDbReady();
    const nowTime = now();
    await workTrackerEngine.dispatch({ type: "BACKGROUND_TASK_STARTED" });

    try {
      const lastExitStr = await AsyncStorage.getItem(EXIT_TIMESTAMP_KEY);
      if (lastExitStr) {
        const exitTime = parseInt(lastExitStr, 10);
        if (Number.isNaN(exitTime) || exitTime > nowTime) {
          await AsyncStorage.removeItem(EXIT_TIMESTAMP_KEY);
        } else if (nowTime - exitTime > FAILSAFE_THRESHOLD_MS) {
          // Re-load fresh state from DB as per CONC-004 recommendation
          const session = await db.getFirstAsync<WorkSession>(
            "SELECT * FROM work_sessions WHERE isDeleted = 0 ORDER BY id DESC LIMIT 1",
          );
          const engineState = workTrackerEngine.getState();
          const isPendingExit = engineState.runtime.geofence.lastExitTimestampMs !== null;

          if (session?.id && session.status === "ACTIVE_WORK") {
            if (!isPendingExit) {
              await logAudit({
                session_id: session.id,
                action_type: "AUTO_CHECKOUT_FAILSAFE_SKIPPED",
                details: "Failsafe omitido: No hay salida pendiente confirmada.",
                timestamp: now(),
              });
              log(
                "BLANCO",
                "UBICACION",
                "DEBUG",
                `Failsafe omitido para sesión #${session.id}: No hay salida pendiente confirmada.`,
              );
              return;
            }

            // Robustez: Confirmar que sigue fuera del sitio antes del Failsafe
            // Robustez: Confirmar que sigue fuera del sitio antes del Failsafe
            try {
              const loc = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
              });
              const dist = getDistanceFromLatLonInMeters(
                loc.coords.latitude,
                loc.coords.longitude,
                session.target_latitude || 0,
                session.target_longitude || 0,
              );

              if (dist > 200) {
                log(
                  "AMARILLO",
                  "ADVERTENCIA",
                  "WARN",
                  `Auto Check-out (FAILSAFE) necesario para sesión #${session.id}. Usuario sigue fuera (dist=${dist.toFixed(0)}m).`,
                );
                await logAudit({
                  session_id: session.id,
                  action_type: "AUTO_CHECKOUT_FAILSAFE_EXECUTED",
                  details: `Failsafe ejecutado: Usuario sigue fuera (dist=${dist.toFixed(0)}m).`,
                  timestamp: now(),
                });
                await workTrackerEngine.dispatch({
                  type: "SESSION_AUTO_CHECKOUT_FAILSAFE",
                  sessionId: session.id,
                  endAtMs: exitTime,
                });
              } else {
                log(
                  "AZUL",
                  "UBICACION",
                  "INFO",
                  `Failsafe cancelado para sesión #${session.id}: Usuario regresó (dist=${dist.toFixed(0)}m).`,
                );
                await logAudit({
                  session_id: session.id,
                  action_type: "AUTO_CHECKOUT_FAILSAFE_SKIPPED",
                  details: `Failsafe omitido: Usuario regresó al sitio (dist=${dist.toFixed(0)}m).`,
                  timestamp: now(),
                });
                await AsyncStorage.removeItem(EXIT_TIMESTAMP_KEY);
                await workTrackerEngine.dispatch({
                  type: "SESSION_EXIT_RESOLVED_CONTINUE",
                  sessionId: session.id,
                });
              }
            } catch (locError) {
              // Si falla el GPS, por seguridad en failsafe procedemos con el cierre si ha pasado el tiempo
              log(
                "AMARILLO",
                "UBICACION",
                "WARN",
                "Fallo al obtener ubicación para confirmación de failsafe. Procediendo por timeout.",
                locError,
              );
              await workTrackerEngine.dispatch({
                type: "SESSION_AUTO_CHECKOUT_FAILSAFE",
                sessionId: session.id,
                endAtMs: exitTime,
              });
            }
          } else {
            await AsyncStorage.removeItem(EXIT_TIMESTAMP_KEY);
          }
        }
      }
    } catch (failsafeError) {
      log("ROJO", "ERROR_CRITICO", "ERROR", "Error en Failsafe de fondo", failsafeError);
    }

    // Weekly Report logic
    try {
      const today = currentDate();
      const day = today.day();
      const isReportWindow = (day === 0 && today.hour() >= 20) || day === 1 || day === 2;
      if (isReportWindow) {
        const targetWeek = day === 0 ? today : today.subtract(1, "week");
        const startTs = targetWeek.startOf("isoWeek").valueOf();
        const endTs = targetWeek.endOf("isoWeek").valueOf();
        const currentWeekId = targetWeek.startOf("isoWeek").format("YYYY-MM-DD");
        const lastReported = await AsyncStorage.getItem(REPORT_STORAGE_KEY);

        if (lastReported !== currentWeekId) {
          const pdfUri = await generateWeeklyReport(false, {
            start: startTs,
            end: endTs,
          });
          if (pdfUri) {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: "📄 Reporte Semanal Listo",
                body: "Toca para revisar y enviar tu nómina.",
                data: { action: "GENERATE_REPORT_PROMPT" },
                sound: true,
              },
              trigger: null,
            });
            await AsyncStorage.setItem(REPORT_STORAGE_KEY, currentWeekId);
          }
        }
      }
    } catch (reportError) {
      log("ROJO", "ERROR_CRITICO", "ERROR", "Error en Reporte", reportError);
    }

    await workTrackerEngine.dispatch({ type: "BACKGROUND_TASK_FINISHED" });
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (criticalError) {
    log("ROJO", "ERROR_CRITICO", "ERROR", "Error en BackgroundTasks", criticalError);
    return BackgroundTask.BackgroundTaskResult.Failed;
  } finally {
    isTaskRunningMutex = false;
    await logAudit({
      session_id: null,
      action_type: AUDIT_ACTIONS.MUTEX,
      details: "MUTEX_UNLOCK released",
      timestamp: now(),
    });
  }
});

export const BackgroundTasks = {
  register: async () => {
    try {
      const status = await BackgroundTask.getStatusAsync();
      if (status === BackgroundTask.BackgroundTaskStatus.Restricted) return;
      const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
      if (!isRegistered) {
        await BackgroundTask.registerTaskAsync(TASK_NAME, {
          minimumInterval: 15,
        });
        log("VERDE", "SERVICIOS_ACTIVOS", "INFO", "Servicios de fondo registrados.");
      }
    } catch (e) {
      log("ROJO", "ERROR_CRITICO", "ERROR", "Error registrando tasks", e);
    }
  },
  unregister: async () => {
    try {
      if (await TaskManager.isTaskRegisteredAsync(TASK_NAME)) {
        await BackgroundTask.unregisterTaskAsync(TASK_NAME);
      }
    } catch (e) {
      log("ROJO", "ERROR_CRITICO", "ERROR", "Error unregistering", e);
    }
  },
  triggerForTesting: async () => {
    if (__DEV__) await BackgroundTask.triggerTaskWorkerForTestingAsync();
  },
};
