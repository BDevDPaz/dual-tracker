/**
 * ForegroundWorkService — Runtime (Propuesta Técnica §5.8, nuevo, Android)
 * ============================================================================
 * Servicio en primer plano de ubicación, obligatorio para rastreo confiable
 * en Android 10+. Notificación persistente NO alarmista:
 * "Jornada en curso · monitoreo de zona activa".
 *  - Se inicia al pasar a ESPERANDO o ACTIVA y se detiene al CERRADA.
 *  - En PAUSADA el servicio SIGUE en marcha. Pararlo deja la jornada en
 *    «servicio en primer plano detenido» y un toque de resolver no cuaja.
 *    El almuerzo no graba destino personal: TraceRecorder no almacena migas
 *    en PAUSADA. La geocerca nativa sigue activa.
 *  - El perfil de muestreo (intervalos) lo decide TraceRecorderService.
 *    Con batería baja el intervalo se alarga; el servicio no se reinicia
 *    si la banda no cambió.
 *
 * Base: startActiveTracking de LEDTracker (startLocationUpdatesAsync con
 * foregroundService), con perfiles adaptativos y copy de la propuesta.
 * En iOS no hay FGS: deferred updates (significant-change de Expo) más la
 * geocerca. Sin validar en un iPhone.
 */
import * as Location from "expo-location";
import { Platform } from "react-native";
import type { SessionRecordStatus, TraceMode } from "../../core/contracts";
import { BREADCRUMB_TASK_NAME } from "../../constants/geolocation";
import { t } from "../../i18n";
import type { ForegroundNotice } from "./monitoringSnapshot";
import { renderForegroundBody } from "./monitoringSnapshot";
import { serializeError } from "../../utils/serializeError";
import { IntegrityLedgerService } from "../domain/IntegrityLedgerService";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { TraceRecorderService } from "../evidence/TraceRecorderService";
import { LoggingService } from "../persistence/LoggingService";
import { PersistenceService } from "../persistence/PersistenceService";

let currentProfileKey: string | null = null;
/** Misma causa no se vuelve a asentar hasta que un arranque tenga éxito. */
let lastFailureKey: string | null = null;
/** Texto ya aplicado a la notificación. null hasta el primer arranque. */
let appliedBody: string | null = null;

export type ForegroundSyncReason = "NOT_REQUIRED" | "UNCHANGED" | "STARTED" | "BACKGROUND_DENIED" | "START_FAILED";

export interface ForegroundSyncResult {
  status: "running" | "stopped";
  reason: ForegroundSyncReason;
  errorName: string | null;
}

function errorNameOf(error: unknown): string {
  if (error instanceof Error && error.name) return error.name;
  return "Error";
}

async function recordStartFailure(reason: "BACKGROUND_DENIED" | "START_FAILED", errorName: string | null): Promise<void> {
  const key = `${reason}:${errorName ?? ""}`;
  if (lastFailureKey === key) return;
  try {
    const session = await PersistenceService.getOpenSession();
    const state = session?.domainStatus ?? null;
    await PersistenceService.transaction(async (db) => {
      await IntegrityLedgerService.append(
        {
          sessionId: session?.id ?? null,
          actor: "SYSTEM",
          intent: "FOREGROUND_SERVICE_START_FAILED",
          fromState: state,
          toState: state,
          reason,
          timestampMs: TimeAuthorityService.now(),
          integrityClass: null,
          data: { severity: "HIGH", errorName, reason },
        },
        db,
      );
    });
    lastFailureKey = key;
  } catch (error) {
    LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "No se pudo anotar el fallo del servicio en primer plano", serializeError(error));
  }
}

export const ForegroundWorkService = {
  /** ¿Debe estar corriendo en este estado? El almuerzo también: si no, Android lo da por parado. */
  shouldRun(status: SessionRecordStatus | "NO_INICIADA"): boolean {
    return status === "ESPERANDO" || status === "ACTIVA" || status === "PAUSADA" || status === "TRASLADO" || status === "SALIDA";
  },

  async isRunning(): Promise<boolean> {
    return Location.hasStartedLocationUpdatesAsync(BREADCRUMB_TASK_NAME).catch(() => false);
  },

  /**
   * Sincroniza el servicio con el estado de la jornada. Idempotente.
   * `relabel` reinicia la notificación persistente para aplicar el idioma
   * activo (el texto queda fijado al arrancar el FGS).
   */
  async sync(
    status: SessionRecordStatus | "NO_INICIADA",
    mode: TraceMode,
    opts?: { relabel?: boolean; battery?: number | null; notice?: ForegroundNotice | null },
  ): Promise<ForegroundSyncResult> {
    const profile = ForegroundWorkService.shouldRun(status) ? TraceRecorderService.profileFor(status, mode, opts?.battery) : null;
    if (!profile) {
      await ForegroundWorkService.stop();
      return { status: "stopped", reason: "NOT_REQUIRED", errorName: null };
    }
    const key = `${Platform.OS}:${profile.timeIntervalMs}:${profile.distanceIntervalM}`;
    const body = opts?.notice !== undefined || opts?.relabel ? renderForegroundBody(opts?.notice ?? null) : (appliedBody ?? renderForegroundBody(null));
    const running = await ForegroundWorkService.isRunning();
    if (running && key === currentProfileKey && !opts?.relabel && body === appliedBody) {
      lastFailureKey = null;
      return { status: "running", reason: "UNCHANGED", errorName: null };
    }
    try {
      const bg = await Location.getBackgroundPermissionsAsync();
      if (bg.status !== "granted") {
        LoggingService.log("NARANJA", "UBICACION", "WARN", "FGS no iniciado: sin ubicación en segundo plano");
        await recordStartFailure("BACKGROUND_DENIED", null);
        return { status: "stopped", reason: "BACKGROUND_DENIED", errorName: null };
      }
      if (running) await Location.stopLocationUpdatesAsync(BREADCRUMB_TASK_NAME).catch(() => {});
      const ios = Platform.OS === "ios";
      await Location.startLocationUpdatesAsync(BREADCRUMB_TASK_NAME, {
        accuracy: status === "TRASLADO" ? Location.Accuracy.High : Location.Accuracy.Balanced,
        timeInterval: profile.timeIntervalMs,
        distanceInterval: profile.distanceIntervalM,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        activityType: Location.ActivityType.Other,
        // iOS: deferred updates es el significant-change que Expo expone aquí.
        // No se ha medido en un iPhone.
        ...(ios
          ? {
              deferredUpdatesInterval: profile.timeIntervalMs,
              deferredUpdatesDistance: profile.distanceIntervalM,
            }
          : {
              foregroundService: {
                notificationTitle: t("notifications.fgsTitle"),
                notificationBody: body,
                killServiceOnDestroy: false,
              },
            }),
      });
      currentProfileKey = key;
      appliedBody = body;
      lastFailureKey = null;
      LoggingService.log("VERDE", "SERVICIOS_ACTIVOS", "INFO", "Servicio en primer plano activo", { status, platform: Platform.OS });
      return { status: "running", reason: "STARTED", errorName: null };
    } catch (error) {
      const errorName = errorNameOf(error);
      LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "No se pudo iniciar el servicio en primer plano", serializeError(error));
      await recordStartFailure("START_FAILED", errorName);
      return { status: "stopped", reason: "START_FAILED", errorName };
    }
  },

  async stop(): Promise<void> {
    currentProfileKey = null;
    appliedBody = null;
    if (await ForegroundWorkService.isRunning()) {
      await Location.stopLocationUpdatesAsync(BREADCRUMB_TASK_NAME).catch(() => {});
      LoggingService.log("NARANJA", "MONITOREO_DETENIDO", "INFO", "Servicio en primer plano detenido");
    }
  },

  __resetForTests(): void {
    currentProfileKey = null;
    lastFailureKey = null;
    appliedBody = null;
  },
};
