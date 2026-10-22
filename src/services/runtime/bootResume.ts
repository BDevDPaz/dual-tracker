/**
 * Reanudación tras reiniciar el teléfono (N-07).
 *
 * Expo no ofrece un arranque de JavaScript en el instante de BOOT_COMPLETED.
 * Lo que sí permite, y ya está declarado:
 *  - RECEIVE_BOOT_COMPLETED en app.json (el manifiesto de Android lo pide).
 *  - La geocerca de expo-location queda en el sistema y puede despertar la
 *    tarea sin abrir la app. Ahí se relanza el servicio.
 *  - expo-background-task (WorkManager) se reprograma al encender y, cuando
 *    corre, el worker ya llama a recoverMonitoring.
 *
 * Límites: en Android 12+ el sistema puede negar el servicio en primer plano
 * si la app está en segundo plano y no está exenta de batería. Ese fallo ya
 * queda como SERVICE_RECOVERY_FAILED. Este módulo solo anota BOOT_RESUME una
 * vez por arranque cuando el reloj de uptime dice que el teléfono se reinició
 * después del último latido. Sin ese reloj no se inventa un reinicio.
 */
import { serializeError } from "../../utils/serializeError";
import { IntegrityLedgerService } from "../domain/IntegrityLedgerService";
import { deviceOffGap } from "../evidence/deviceOffGap";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { LoggingService } from "../persistence/LoggingService";
import { PersistenceService } from "../persistence/PersistenceService";
import { KV_KEYS } from "../persistence/schema";
import { readHeartbeat } from "./heartbeat";
import { recoverMonitoring } from "./monitoringRecovery";
import { readDeviceUptimeMs } from "./deviceUptime";

export async function noteBootResume(origin: "worker" | "geofence" | "breadcrumb" | "boot", opts?: { recover?: boolean }): Promise<boolean> {
  try {
    const session = await PersistenceService.getOpenSession();
    if (!session) return false;
    const last = await readHeartbeat();
    if (last === null) return false;
    const nowMs = TimeAuthorityService.now();
    const gap = deviceOffGap(last, { nowMs, uptimeMs: await readDeviceUptimeMs() });
    if (gap.bootAtMs === null || gap.deviceOffMs === null) return false;
    const noted = await PersistenceService.getKv<{ bootAtMs: number }>(KV_KEYS.BOOT_RESUME);
    if (noted && Math.abs(noted.bootAtMs - gap.bootAtMs) < 5_000) return false;
    await PersistenceService.setKv(KV_KEYS.BOOT_RESUME, { bootAtMs: gap.bootAtMs, origin, notedAtMs: nowMs });
    await PersistenceService.transaction(async (db) => {
      await IntegrityLedgerService.append(
        {
          sessionId: session.id,
          actor: "SYSTEM",
          intent: "BOOT_RESUME",
          fromState: session.domainStatus,
          toState: session.domainStatus,
          reason: "DEVICE_REBOOTED",
          timestampMs: nowMs,
          integrityClass: null,
          data: {
            origin,
            bootAtMs: gap.bootAtMs,
            deviceOffMs: gap.deviceOffMs,
            lastHeartbeatMs: gap.lastHeartbeatMs,
            limit: "EXPO_NO_JS_AT_BOOT_COMPLETED",
          },
        },
        db,
      );
    });
    if (opts?.recover) await recoverMonitoring(origin === "boot" ? "foreground" : "background");
    return true;
  } catch (error) {
    LoggingService.log("NARANJA", "SERVICIOS_ACTIVOS", "WARN", "No se pudo anotar la reanudación tras reinicio", serializeError(error));
    return false;
  }
}
