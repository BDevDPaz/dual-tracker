/**
 * Relanzamiento best-effort del servicio en primer plano.
 * Android 12+ puede negar el arranque desde segundo plano
 * (ForegroundServiceStartNotAllowedException) salvo exenciones, por ejemplo
 * la app libre de optimización de batería. Android 14 exige además el tipo
 * location. Si no arranca, queda en el ledger y se pide abrir Dual Tracker.
 * No cambia la jornada ni el pago. El umbral de huérfana (45 min) no se toca.
 */
import type { SessionRecord } from "../../core/contracts";
import { t } from "../../i18n";
import { serializeError } from "../../utils/serializeError";
import { IntegrityLedgerService } from "../domain/IntegrityLedgerService";
import { monitoredSiteId } from "../domain/siteVisits";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { LoggingService } from "../persistence/LoggingService";
import { PersistenceService } from "../persistence/PersistenceService";
import { KV_KEYS } from "../persistence/schema";
import { SettingsService } from "../persistence/SettingsService";
import { ForegroundWorkService } from "./ForegroundWorkService";
import { GeofenceRuntimeService } from "./GeofenceRuntimeService";
import { readHeartbeat } from "./heartbeat";
import { NotificationService } from "./NotificationService";

/**
 * A partir de aquí el hueco se anota (5 min). No es el umbral de jornada
 * huérfana: ese sigue en HEARTBEAT_GAP_MS (45 min) y no se redeclara aquí.
 */
export const MONITORING_GAP_MS = 5 * 60_000;
const RECOVERY_ATTEMPTS = 3;
const BACKGROUND_COOLDOWN_MS = 60_000;

let lastBackgroundAt = 0;
let inflight: Promise<void> | null = null;

export function __resetMonitoringRecoveryForTests(): void {
  lastBackgroundAt = 0;
  inflight = null;
}

async function noteMonitoringGap(sessionId: number): Promise<void> {
  const last = await readHeartbeat();
  const now = TimeAuthorityService.now();
  if (last === null || now - last < MONITORING_GAP_MS) return;
  const noted = await PersistenceService.getKv<{ lastHeartbeatMs: number }>(KV_KEYS.MONITORING_GAP_NOTE);
  if (noted && noted.lastHeartbeatMs === last) return;
  const gapSeconds = Math.floor((now - last) / 1000);
  await PersistenceService.transaction(async (db) => {
    await IntegrityLedgerService.append(
      {
        sessionId,
        actor: "WATCHDOG",
        intent: "MONITORING_GAP",
        fromState: null,
        toState: null,
        reason: "HEARTBEAT_GAP",
        timestampMs: now,
        integrityClass: null,
        data: { gapSeconds, lastHeartbeatMs: last },
      },
      db,
    );
  });
  await PersistenceService.setKv(KV_KEYS.MONITORING_GAP_NOTE, { lastHeartbeatMs: last, gapSeconds });
}

async function ensureGeofences(session: SessionRecord): Promise<void> {
  if (await GeofenceRuntimeService.isMonitoring()) return;
  const siteId = monitoredSiteId(session);
  if (siteId === null) return;
  await GeofenceRuntimeService.startMonitoring(session.id, siteId).catch(() => {});
}

async function recoverBody(origin: "background" | "foreground"): Promise<void> {
  const session = await PersistenceService.getOpenSession();
  if (!session) return;
  await noteMonitoringGap(session.id);
  if (!(await ForegroundWorkService.isRunning()) && ForegroundWorkService.shouldRun(session.domainStatus)) {
    const now = TimeAuthorityService.now();
    const cooled = origin === "background" && lastBackgroundAt !== 0 && now - lastBackgroundAt < BACKGROUND_COOLDOWN_MS;
    if (!cooled) {
      if (origin === "background") lastBackgroundAt = now;
      const lastHeartbeatMs = await readHeartbeat();
      const gapSeconds = lastHeartbeatMs === null ? null : Math.max(0, Math.floor((now - lastHeartbeatMs) / 1000));
      await PersistenceService.transaction(async (db) => {
        await IntegrityLedgerService.append(
          {
            sessionId: session.id,
            actor: "WATCHDOG",
            intent: "MONITORING_STOPPED_DETECTED",
            fromState: session.domainStatus,
            toState: session.domainStatus,
            reason: "FGS_NOT_RUNNING",
            timestampMs: now,
            integrityClass: null,
            data: { lastHeartbeatMs, gapSeconds },
          },
          db,
        );
      });
      const settings = await SettingsService.load();
      let recovered = false;
      let lastError: string | null = null;
      for (let attempt = 1; attempt <= RECOVERY_ATTEMPTS; attempt++) {
        const result = await ForegroundWorkService.sync(session.domainStatus, settings.company.traceMode);
        const success = result.status === "running";
        await PersistenceService.transaction(async (db) => {
          await IntegrityLedgerService.append(
            {
              sessionId: session.id,
              actor: "WATCHDOG",
              intent: "SERVICE_RECOVERY",
              fromState: session.domainStatus,
              toState: session.domainStatus,
              reason: success ? "RESTARTED" : "RETRY",
              timestampMs: TimeAuthorityService.now(),
              integrityClass: null,
              data: { attempt, success, errorName: result.errorName, result: result.reason },
            },
            db,
          );
        });
        if (success) {
          recovered = true;
          break;
        }
        lastError = result.errorName ?? result.reason;
      }
      if (!recovered) {
        await PersistenceService.transaction(async (db) => {
          await IntegrityLedgerService.append(
            {
              sessionId: session.id,
              actor: "WATCHDOG",
              intent: "SERVICE_RECOVERY_FAILED",
              fromState: session.domainStatus,
              toState: session.domainStatus,
              reason: "ATTEMPTS_EXHAUSTED",
              timestampMs: TimeAuthorityService.now(),
              integrityClass: null,
              data: { severity: "HIGH", attempts: RECOVERY_ATTEMPTS, errorName: lastError },
            },
            db,
          );
        });
        await NotificationService.notifyImmediate(t("notifications.monitoringStoppedTitle"), t("notifications.monitoringStoppedBody"));
      }
    }
  }
  await ensureGeofences(session);
}

/** Si la jornada está abierta y el FGS no corre, intenta arrancarlo (hasta 3 veces). */
export function recoverMonitoring(origin: "background" | "foreground"): Promise<void> {
  if (inflight) return inflight;
  inflight = recoverBody(origin)
    .catch((error) => {
      LoggingService.log("ROJO", "ERROR_CRITICO", "ERROR", "Fallo al revisar el monitoreo", serializeError(error));
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
