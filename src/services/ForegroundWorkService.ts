import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { log } from "../utils/logger";
import { geofenceRuntimeService } from "./GeofenceRuntimeService";

/**
 * ============================================================================
 * ForegroundWorkService — Propuesta 5.8 (nuevo, Android)
 * ----------------------------------------------------------------------------
 * "Servicio en primer plano de ubicación, obligatorio para rastreo confiable
 * en Android 10+. Muestra notificación persistente no alarmista: 'Jornada en
 * curso · monitoreo de zona activa'. Se inicia al pasar a ESPERANDO/ACTIVA y
 * se detiene al CERRADA."
 *
 * Usa `Location.startLocationUpdatesAsync` con la opción `foregroundService`
 * de expo-location (Android): el SO exige una notificación persistente
 * mientras el proceso mantiene un stream de ubicación activo en background.
 * En iOS, `foregroundService` es ignorado de forma segura por la librería.
 *
 * Este servicio NO decide transiciones de dominio: `start`/`stop` los invoca
 * el ensamblador (wave de SessionEngineService) exactamente en las
 * transiciones GEOFENCE_CREATED/ACTIVA -> arranca, CERRADA -> detiene.
 *
 * Bono de fiabilidad: cada muestra de ubicación recibida mientras el
 * servicio en primer plano corre se reenvía a
 * `geofenceRuntimeService.reportLocationSample` para las regiones
 * actualmente monitoreadas, de forma que ACCURACY_DROP/PROVIDER_LOSS/DWELL
 * puedan detectarse también fuera de los eventos nativos Enter/Exit.
 * ============================================================================
 */

/** Nombre de la tarea nativa de actualizaciones de ubicación en primer plano. */
export const FOREGROUND_WORK_TASK_NAME = "DT_FOREGROUND_LOCATION_TASK";

const DEFAULT_TIME_INTERVAL_MS = 60_000;
const DEFAULT_DISTANCE_INTERVAL_METERS = 25;

const DEFAULT_NOTIFICATION_TITLE = "Dual Tracker";
const DEFAULT_NOTIFICATION_BODY = "Jornada en curso · monitoreo de zona activa";

export interface ForegroundWorkStartOptions {
  notificationTitle?: string;
  notificationBody?: string;
  notificationColor?: string;
}

if (!TaskManager.isTaskDefined(FOREGROUND_WORK_TASK_NAME)) {
  TaskManager.defineTask(FOREGROUND_WORK_TASK_NAME, async ({ data, error }: any) => {
    if (error) {
      log(
        "ROJO",
        "FOREGROUND_WORK",
        "ERROR",
        "Tarea de ubicación en primer plano reportó error nativo",
        error,
      );
      return;
    }
    if (!data) return;

    const locations = (data as { locations?: Location.LocationObject[] }).locations;
    if (!locations || locations.length === 0) return;

    const latest = locations[locations.length - 1];

    try {
      const regions = await geofenceRuntimeService.listMonitoredRegions();
      for (const region of regions) {
        await geofenceRuntimeService.reportLocationSample(region.identifier, latest);
      }
    } catch (sampleError) {
      log(
        "ROJO",
        "FOREGROUND_WORK",
        "ERROR",
        "Fallo reenviando muestra de ubicación a GeofenceRuntimeService",
        sampleError,
      );
    }
  });
}

class ForegroundWorkService {
  private runningSessionId: number | null = null;

  /**
   * Inicia (o reinicia, si ya corría para otra sesión) el servicio de
   * ubicación en primer plano de Android con la notificación persistente no
   * alarmista requerida por la Propuesta 5.8. Idempotente: si ya corre para
   * la misma `sessionId`, no reinicia el stream nativo.
   */
  async start(sessionId: number, options?: ForegroundWorkStartOptions): Promise<boolean> {
    if (this.runningSessionId === sessionId && (await this.isRunning())) {
      return true;
    }

    try {
      const fgPerm = await Location.getForegroundPermissionsAsync();
      if (fgPerm.status !== "granted") {
        log(
          "ROJO",
          "FOREGROUND_WORK",
          "ERROR",
          "Permiso de ubicación en primer plano no concedido: no se puede iniciar",
        );
        return false;
      }

      const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(
        FOREGROUND_WORK_TASK_NAME,
      ).catch(() => false);

      if (alreadyStarted) {
        await Location.stopLocationUpdatesAsync(FOREGROUND_WORK_TASK_NAME).catch(() => undefined);
      }

      await Location.startLocationUpdatesAsync(FOREGROUND_WORK_TASK_NAME, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: DEFAULT_TIME_INTERVAL_MS,
        distanceInterval: DEFAULT_DISTANCE_INTERVAL_METERS,
        showsBackgroundLocationIndicator: false,
        foregroundService: {
          notificationTitle: options?.notificationTitle ?? DEFAULT_NOTIFICATION_TITLE,
          notificationBody: options?.notificationBody ?? DEFAULT_NOTIFICATION_BODY,
          ...(options?.notificationColor ? { notificationColor: options.notificationColor } : {}),
        },
      });

      this.runningSessionId = sessionId;
      log("VERDE", "FOREGROUND_WORK", "INFO", "Servicio de ubicación en primer plano iniciado", {
        sessionId,
      });
      return true;
    } catch (error) {
      log(
        "ROJO",
        "FOREGROUND_WORK",
        "ERROR",
        "Fallo iniciando servicio de ubicación en primer plano",
        error,
      );
      return false;
    }
  }

  /** Detiene el servicio de ubicación en primer plano (no-op si no corría). */
  async stop(): Promise<void> {
    try {
      const started = await Location.hasStartedLocationUpdatesAsync(
        FOREGROUND_WORK_TASK_NAME,
      ).catch(() => false);

      if (started) {
        await Location.stopLocationUpdatesAsync(FOREGROUND_WORK_TASK_NAME);
        log("NARANJA", "FOREGROUND_WORK", "INFO", "Servicio de ubicación en primer plano detenido");
      }
    } catch (error) {
      log(
        "ROJO",
        "FOREGROUND_WORK",
        "ERROR",
        "Fallo deteniendo servicio de ubicación en primer plano",
        error,
      );
    } finally {
      this.runningSessionId = null;
    }
  }

  /** true si el stream de ubicación en primer plano está activo ahora mismo. */
  async isRunning(): Promise<boolean> {
    try {
      return await Location.hasStartedLocationUpdatesAsync(FOREGROUND_WORK_TASK_NAME);
    } catch {
      return false;
    }
  }
}

/** Instancia única — un solo servicio de primer plano Android por proceso. */
export const foregroundWorkService = new ForegroundWorkService();
