/**
 * Motor de anomalías. Escribe asientos con severidad y deduplica.
 * No borra hechos, no bloquea fichajes y no toca la nómina ni la máquina de estados.
 */
import { Platform } from "react-native";
import type { SessionRecord, SessionRecordStatus } from "../../core/contracts";
import { isBoundaryFlapping } from "../../core/locationTrust";
import { SAMPLE_STALE_MS, STALE_LOCATION_MS } from "../../core/monitoringState";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { IntegrityLedgerService } from "../domain/IntegrityLedgerService";
import { LoggingService } from "../persistence/LoggingService";
import { PersistenceService } from "../persistence/PersistenceService";
import { KV_KEYS } from "../persistence/schema";
import { serializeError } from "../../utils/serializeError";
import { ANOMALY_SEVERITY, type AnomalyKind } from "./anomalyCatalog";
import { ForegroundWorkService } from "./ForegroundWorkService";
import * as Location from "expo-location";

const SIGNAL_WINDOW_MS = 60 * 60_000;
const FLAP_WINDOW_MS = 10 * 60_000;

type Latch = Record<string, string>;

function latchKey(sessionId: number | null, kind: string): string {
  return `${sessionId ?? "none"}:${kind}`;
}

async function readLatch(): Promise<Latch> {
  const value = await PersistenceService.getKv<unknown>(KV_KEYS.ANOMALY_LATCH);
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Latch;
}

export async function recordAnomaly(input: {
  sessionId: number | null;
  kind: AnomalyKind;
  token: string;
  reason: string;
  state?: SessionRecordStatus | null;
  data?: Record<string, unknown>;
}): Promise<boolean> {
  const key = latchKey(input.sessionId, input.kind);
  const latch = await readLatch();
  if (latch[key] === input.token) return false;
  const intent = input.kind === "GPS_LOST" || input.kind === "GPS_RESTORED" ? input.kind : "ANOMALY";
  const state = input.state ?? null;
  const nowMs = TimeAuthorityService.now();
  await PersistenceService.transaction(async (db) => {
    await IntegrityLedgerService.append(
      {
        sessionId: input.sessionId,
        actor: "SYSTEM",
        intent,
        fromState: state,
        toState: state,
        reason: input.reason,
        timestampMs: nowMs,
        integrityClass: null,
        data: {
          kind: input.kind,
          severity: ANOMALY_SEVERITY[input.kind],
          ...(input.data ?? {}),
        },
      },
      db,
    );
    await PersistenceService.setKv(KV_KEYS.ANOMALY_LATCH, { ...latch, [key]: input.token }, db);
  });
  return true;
}

async function recordSafely(input: Parameters<typeof recordAnomaly>[0]): Promise<void> {
  try {
    await recordAnomaly(input);
  } catch (error) {
    LoggingService.log("NARANJA", "SERVICIOS_ACTIVOS", "WARN", "No se pudo asentar la anomalía", serializeError(error));
  }
}

export async function noteSpatialAnomaly(fact: {
  sessionId: number;
  reason?: string | null;
  timestampMs: number;
}): Promise<void> {
  const reason = fact.reason ?? "";
  const kind: AnomalyKind | null =
    reason === "MOCK_LOCATION" ? "MOCK_LOCATION" : reason === "LOCATION_JUMP_DETECTED" ? "GPS_JUMP" : reason === "IMPOSSIBLE_SPEED" ? "IMPOSSIBLE_TRAVEL" : null;
  if (!kind) return;
  const bucket = Math.floor(fact.timestampMs / (10 * 60_000));
  await recordSafely({
    sessionId: fact.sessionId,
    kind,
    token: kind === "MOCK_LOCATION" ? `mock:${fact.sessionId}` : `${kind}:${bucket}`,
    reason,
  });
}

export async function noteClockDriftAnomaly(sessionId: number, driftMs: number, state: SessionRecordStatus | null): Promise<void> {
  await recordSafely({
    sessionId,
    kind: "CLOCK_DRIFT",
    token: "open",
    reason: "CLOCK_DRIFT",
    state,
    data: { driftMs },
  });
}

function sessionStart(session: SessionRecord): number {
  return session.actualStartAtMs ?? session.declaredStartAtMs;
}

/** Revisa señal, hueco largo, servicio parado y aleteo. Idempotente. */
export async function reviewMonitoringAnomalies(session: SessionRecord): Promise<void> {
  const now = TimeAuthorityService.now();
  const started = sessionStart(session);
  const fix = await PersistenceService.getLastFix();
  const fixMs = fix && fix.timestampMs >= started ? fix.timestampMs : null;
  const services = await Location.hasServicesEnabledAsync().catch(() => null);
  const lost = services !== false && (fixMs === null ? now - started >= SAMPLE_STALE_MS : now - fixMs >= SAMPLE_STALE_MS);
  if (lost) {
    await recordSafely({
      sessionId: session.id,
      kind: "GPS_LOST",
      token: "open",
      reason: "GPS_LOST",
      state: session.domainStatus,
      data: { lastFixMs: fixMs },
    });
  } else if (fixMs !== null) {
    const latch = await readLatch();
    if (latch[latchKey(session.id, "GPS_LOST")] === "open") {
      const wrote = await recordAnomaly({
        sessionId: session.id,
        kind: "GPS_RESTORED",
        token: `restored:${fixMs}`,
        reason: "GPS_RESTORED",
        state: session.domainStatus,
        data: { lastFixMs: fixMs },
      }).catch(() => false);
      if (wrote) {
        const next = await readLatch();
        delete next[latchKey(session.id, "GPS_LOST")];
        await PersistenceService.setKv(KV_KEYS.ANOMALY_LATCH, next);
      }
    }
  }

  if (fixMs !== null && now - fixMs >= STALE_LOCATION_MS) {
    await recordSafely({
      sessionId: session.id,
      kind: "STALE_LOCATION",
      token: `stale:${fixMs}`,
      reason: "STALE_LOCATION",
      state: session.domainStatus,
      data: { lastFixMs: fixMs, ageMs: now - fixMs },
    });
  }

  if (Platform.OS === "android" && ForegroundWorkService.shouldRun(session.domainStatus)) {
    const running = await ForegroundWorkService.isRunning().catch(() => false);
    if (!running) {
      await recordSafely({
        sessionId: session.id,
        kind: "SERVICE_STOPPED",
        token: "stopped",
        reason: "SERVICE_STOPPED",
        state: session.domainStatus,
      });
    } else {
      const latch = await readLatch();
      const key = latchKey(session.id, "SERVICE_STOPPED");
      if (latch[key] === "stopped") {
        delete latch[key];
        await PersistenceService.setKv(KV_KEYS.ANOMALY_LATCH, latch);
      }
    }
  }

  const transitions = await PersistenceService.listSpatialFacts(session.id, ["ENTER", "EXIT"]);
  if (isBoundaryFlapping(transitions, now, FLAP_WINDOW_MS)) {
    await recordSafely({
      sessionId: session.id,
      kind: "BOUNDARY_FLAPPING",
      token: `flap:${Math.floor(now / FLAP_WINDOW_MS)}`,
      reason: "BOUNDARY_FLAPPING",
      state: session.domainStatus,
    });
  }

  const losses = (await PersistenceService.listLedger({ sessionId: session.id, intent: "GPS_LOST" })).filter(
    (entry) => now - entry.timestampMs <= SIGNAL_WINDOW_MS,
  );
  if (losses.length >= 3) {
    await recordSafely({
      sessionId: session.id,
      kind: "FREQUENT_SIGNAL_LOSS",
      token: `loss:${losses[0].id}`,
      reason: "FREQUENT_SIGNAL_LOSS",
      state: session.domainStatus,
      data: { count: losses.length },
    });
  }
}

export async function reviewMonitoringAnomaliesSafely(session: SessionRecord | null): Promise<void> {
  if (!session) return;
  try {
    await reviewMonitoringAnomalies(session);
  } catch (error) {
    LoggingService.log("NARANJA", "SERVICIOS_ACTIVOS", "WARN", "No se pudo revisar anomalías de monitoreo", serializeError(error));
  }
}
