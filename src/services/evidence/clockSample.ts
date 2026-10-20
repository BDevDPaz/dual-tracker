/**
 * Mide la deriva contra hora de red y la deja en el ledger.
 * No bloquea si no hay red. Una muestra suelta, lenta o en ráfaga no es
 * deriva: hacen falta varias lecturas coherentes, separadas en el tiempo.
 * Si la jornada ya tiene ubicación buena, esa deriva es un aviso y no quita
 * VALIDADA. El salto del reloj local sigue bloqueando por otro camino.
 */
import type { SessionRecord } from "../../core/contracts";
import { blockingIntegrityReason } from "../../core/healthPolicy";
import { Store, StoreActions } from "../../core/store";
import { SessionEngineService } from "../domain/SessionEngineService";
import { IntegrityLedgerService } from "../domain/IntegrityLedgerService";
import { PersistenceService } from "../persistence/PersistenceService";
import { KV_KEYS } from "../persistence/schema";
import {
  CLOCK_DRIFT_CONFIRM_SAMPLES,
  CLOCK_DRIFT_CONFIRM_SPAN_MS,
  CLOCK_DRIFT_CONSISTENCY_MS,
  CLOCK_DRIFT_THRESHOLD_MS,
  CLOCK_SAMPLE_MIN_INTERVAL_MS,
  TimeAuthorityService,
  type NetworkTimeSample,
} from "./TimeAuthorityService";

export type ClockSampleOrigin = "FOREGROUND" | "GEOFENCE" | "BREADCRUMB" | "WATCHDOG";

export interface DriftProbe {
  atMs: number;
  driftMs: number;
}

interface ClockProbeState {
  atMs: number;
  samples: DriftProbe[];
}

const EMPTY: ClockProbeState = { atMs: 0, samples: [] };
let memory: ClockProbeState | null = null;
let inflight: Promise<void> | null = null;

/** ¿Estas lecturas son la misma deriva, y no una ráfaga ni un vaivén? */
export function clockDriftConfirmed(samples: readonly DriftProbe[]): boolean {
  if (samples.length < CLOCK_DRIFT_CONFIRM_SAMPLES) return false;
  const window = samples.slice(-CLOCK_DRIFT_CONFIRM_SAMPLES);
  const span = window[window.length - 1].atMs - window[0].atMs;
  if (span < CLOCK_DRIFT_CONFIRM_SPAN_MS) return false;
  const drifts = window.map((s) => s.driftMs);
  if (drifts.some((d) => Math.abs(d) <= CLOCK_DRIFT_THRESHOLD_MS)) return false;
  const sign = Math.sign(drifts[0]);
  if (sign === 0 || drifts.some((d) => Math.sign(d) !== sign)) return false;
  const abs = drifts.map((d) => Math.abs(d));
  return Math.max(...abs) - Math.min(...abs) <= CLOCK_DRIFT_CONSISTENCY_MS;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

async function loadState(): Promise<ClockProbeState> {
  if (memory) return memory;
  try {
    const stored = await PersistenceService.getKv<ClockProbeState>(KV_KEYS.CLOCK_PROBE);
    if (stored && typeof stored.atMs === "number" && Array.isArray(stored.samples)) {
      const samples = stored.samples.filter(
        (s): s is DriftProbe => !!s && typeof s.atMs === "number" && typeof s.driftMs === "number",
      );
      memory = { atMs: stored.atMs, samples };
      return memory;
    }
  } catch {
    // Sin KV se sigue con la memoria de este proceso.
  }
  memory = { atMs: 0, samples: [] };
  return memory;
}

async function saveState(state: ClockProbeState): Promise<void> {
  memory = state;
  try {
    await PersistenceService.setKv(KV_KEYS.CLOCK_PROBE, state);
  } catch {
    // La memoria de este proceso ya tiene el tope; la próxima ráfaga no entra.
  }
}

async function alreadyFlagged(sessionId: number): Promise<boolean> {
  const rows = await IntegrityLedgerService.listForSession(sessionId);
  return rows.some((e) => e.intent === "CLOCK_SAMPLED" && e.reason === "CLOCK_DRIFT");
}

/** Ubicación buena: un ENTER fiable, o una llegada ya confirmada sin hechos aún. */
async function locationEvidenceGood(session: SessionRecord): Promise<boolean> {
  const enters = await PersistenceService.listSpatialFacts(session.id, ["ENTER"]);
  if (enters.length > 0) return enters.some((f) => f.reliable);
  return session.actualStartAtMs !== null && session.domainStatus !== "ESPERANDO";
}

async function appendSample(
  session: SessionRecord,
  origin: ClockSampleOrigin,
  reason: "CLOCK_DRIFT" | "CLOCK_SAMPLE",
  sample: NetworkTimeSample,
  driftMs: number,
  extra: Record<string, unknown>,
): Promise<void> {
  await PersistenceService.transaction(async (db) => {
    await IntegrityLedgerService.append(
      {
        sessionId: session.id,
        actor: "SYSTEM",
        intent: "CLOCK_SAMPLED",
        fromState: session.domainStatus,
        toState: session.domainStatus,
        reason,
        timestampMs: TimeAuthorityService.now(),
        integrityClass: session.integrityClass,
        data: {
          origin,
          driftMs,
          thresholdMs: CLOCK_DRIFT_THRESHOLD_MS,
          suspect: reason === "CLOCK_DRIFT",
          offline: false,
          hosts: sample.hosts.map((h) => h.host),
          rttMs: sample.hosts.map((h) => h.rttMs),
          ...extra,
        },
      },
      db,
    );
  });
}

async function observeClockBody(origin: ClockSampleOrigin): Promise<void> {
  const now = TimeAuthorityService.now();
  const state = await loadState();
  if (state.atMs > 0 && now - state.atMs < CLOCK_SAMPLE_MIN_INTERVAL_MS) return;
  const claimed: ClockProbeState = { atMs: now, samples: state.samples };
  await saveState(claimed);

  const sample = await TimeAuthorityService.sampleTrustedTime();
  StoreActions.healthUpdated({
    clockDriftMs: TimeAuthorityService.currentDriftMs(),
    clockDriftExceeded: TimeAuthorityService.isDriftExceeded(),
    networkTime: sample.offline ? "offline" : sample.agreed ? "online" : "unknown",
  });

  const open = await PersistenceService.getOpenSession();
  if (!sample.agreed || sample.driftMs === null) return;

  const samples = [...claimed.samples, { atMs: now, driftMs: sample.driftMs }].slice(-8);
  await saveState({ atMs: now, samples });
  if (!open) return;
  if (await alreadyFlagged(open.id)) return;

  if (clockDriftConfirmed(samples)) {
    const window = samples.slice(-CLOCK_DRIFT_CONFIRM_SAMPLES);
    const driftMs = Math.round(median(window.map((s) => s.driftMs)));
    const goodLocation = await locationEvidenceGood(open);
    await appendSample(open, origin, "CLOCK_DRIFT", sample, driftMs, {
      warningOnly: goodLocation,
      samples: window.length,
      spanMs: window[window.length - 1].atMs - window[0].atMs,
    });
    if (!goodLocation && open.integrityClass !== "CONFLICT") {
      await SessionEngineService.dispatch({ type: "INTEGRITY_DEGRADE", cause: "CLOCK_DRIFT" }, "SYSTEM");
    }
    return;
  }

  const prior = await IntegrityLedgerService.listForSession(open.id);
  if (prior.some((e) => e.intent === "CLOCK_SAMPLED")) return;
  await appendSample(open, origin, "CLOCK_SAMPLE", sample, sample.driftMs, { warningOnly: false });
}

export function observeClock(origin: ClockSampleOrigin): Promise<void> {
  if (inflight) return inflight;
  inflight = observeClockBody(origin).finally(() => {
    inflight = null;
  });
  return inflight;
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
  inflight = null;
  memory = { ...EMPTY, samples: [] };
}
