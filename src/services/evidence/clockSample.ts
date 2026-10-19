/**
 * Mide la deriva contra hora de red y la deja en el ledger.
 * No bloquea si no hay red. Por encima del umbral, la jornada abierta queda
 * en Revisar (CLOCK_DRIFT). Se llama en primer plano y en tareas de geocerca,
 * miga de pan y vigilante.
 */
import type { SessionRecord } from "../../core/contracts";
import { blockingIntegrityReason } from "../../core/healthPolicy";
import { Store, StoreActions } from "../../core/store";
import { SessionEngineService } from "../domain/SessionEngineService";
import { IntegrityLedgerService } from "../domain/IntegrityLedgerService";
import { PersistenceService } from "../persistence/PersistenceService";
import { CLOCK_DRIFT_THRESHOLD_MS, TimeAuthorityService } from "./TimeAuthorityService";

export type ClockSampleOrigin = "FOREGROUND" | "GEOFENCE" | "BREADCRUMB" | "WATCHDOG";

let lastRecorded: { driftMs: number; suspect: boolean } | null = null;

export async function observeClock(origin: ClockSampleOrigin): Promise<void> {
  const sample = await TimeAuthorityService.sampleTrustedTime();
  const driftMs = TimeAuthorityService.currentDriftMs();
  const exceeded = TimeAuthorityService.isDriftExceeded();
  StoreActions.healthUpdated({
    clockDriftMs: driftMs,
    clockDriftExceeded: exceeded,
    networkTime: sample.offline ? "offline" : sample.agreed ? "online" : "unknown",
  });
  if (!sample.agreed || sample.driftMs === null) return;

  const suspect = Math.abs(sample.driftMs) > CLOCK_DRIFT_THRESHOLD_MS;
  const open = await PersistenceService.getOpenSession();
  const changed = !lastRecorded || Math.abs(lastRecorded.driftMs - sample.driftMs) >= 1000 || lastRecorded.suspect !== suspect;
  if (open && changed) {
    lastRecorded = { driftMs: sample.driftMs, suspect };
    await PersistenceService.transaction(async (db) => {
      await IntegrityLedgerService.append(
        {
          sessionId: open.id,
          actor: "SYSTEM",
          intent: "CLOCK_SAMPLED",
          fromState: open.domainStatus,
          toState: open.domainStatus,
          reason: suspect ? "CLOCK_DRIFT" : "CLOCK_SAMPLE",
          timestampMs: TimeAuthorityService.now(),
          integrityClass: open.integrityClass,
          data: {
            origin,
            driftMs: sample.driftMs,
            thresholdMs: CLOCK_DRIFT_THRESHOLD_MS,
            suspect,
            offline: false,
            hosts: sample.hosts.map((h) => h.host),
          },
        },
        db,
      );
    });
  }
  if (suspect && open && open.integrityClass !== "CONFLICT") {
    await SessionEngineService.dispatch({ type: "INTEGRITY_DEGRADE", cause: "CLOCK_DRIFT" }, "SYSTEM");
  }
}

/** Degrada la jornada abierta si el snapshot ya muestra un sensor que bloquea. */
export async function degradeOpenSessionIfBlocked(open: SessionRecord | null): Promise<void> {
  if (!open || open.integrityClass === "CONFLICT") return;
  const reason = blockingIntegrityReason(Store.getState().health, true);
  if (!reason || reason === "CLEAN") return;
  if (reason === "CLOCK_DRIFT" || reason === "BACKGROUND_PERMISSION_MISSING" || reason === "LOCATION_FOREGROUND_MISSING" || reason === "LOCATION_SERVICES_DISABLED" || reason === "FOREGROUND_SERVICE_STOPPED") {
    await SessionEngineService.dispatch({ type: "INTEGRITY_DEGRADE", cause: reason }, "SYSTEM");
  }
}

export function __resetClockSampleForTests(): void {
  lastRecorded = null;
}
