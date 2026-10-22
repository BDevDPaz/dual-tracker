/**
 * Cobertura de monitoreo de una jornada. Informativa.
 * No entra en la nómina ni en la máquina de estados.
 *
 * El tiempo sin monitoreo es la unión de:
 *  - MONITORING_GAP (del último latido, o gapSeconds, hasta el asiento)
 *  - GPS_LOST hasta GPS_RESTORED (o hasta el fin de la ventana)
 *  - servicio parado (MONITORING_STOPPED_DETECTED, FOREGROUND_SERVICE_START_FAILED,
 *    SERVICE_RECOVERY_FAILED) hasta un SERVICE_RECOVERY con éxito
 */

export interface CoverageEvent {
  intent: string;
  timestampMs: number;
  data?: Record<string, unknown> | null;
}

export interface MonitoringCoverage {
  spanMs: number;
  monitoredMs: number;
  unmonitoredMs: number;
  /** Porcentaje 0–100 con un decimal. null si la ventana no tiene duración. */
  coveragePercent: number | null;
}

type Interval = [number, number];

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function merge(intervals: Interval[], startMs: number, endMs: number): Interval[] {
  const clipped = intervals
    .map(([a, b]): Interval => [Math.max(a, startMs), Math.min(b, endMs)])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const out: Interval[] = [];
  for (const [a, b] of clipped) {
    const last = out[out.length - 1];
    if (!last || a > last[1]) out.push([a, b]);
    else last[1] = Math.max(last[1], b);
  }
  return out;
}

/** Une huecos de monitoreo dentro de [startMs, endMs) y devuelve la cobertura. */
export function monitoringCoverage(window: { startMs: number; endMs: number }, events: readonly CoverageEvent[]): MonitoringCoverage {
  const startMs = window.startMs;
  const endMs = window.endMs;
  const spanMs = Math.max(0, endMs - startMs);
  if (!(spanMs > 0)) return { spanMs: 0, monitoredMs: 0, unmonitoredMs: 0, coveragePercent: null };

  const ordered = [...events].sort((a, b) => a.timestampMs - b.timestampMs);
  const gaps: Interval[] = [];
  let gpsOpen: number | null = null;
  let serviceOpen: number | null = null;

  for (const event of ordered) {
    const at = event.timestampMs;
    const data = event.data ?? {};
    if (event.intent === "MONITORING_GAP") {
      const lastBeat = num(data.lastHeartbeatMs);
      const gapSeconds = num(data.gapSeconds);
      const from = lastBeat ?? (gapSeconds !== null ? at - gapSeconds * 1000 : at);
      gaps.push([from, at]);
    } else if (event.intent === "GPS_LOST") {
      const lastFix = num(data.lastFixMs);
      gpsOpen = lastFix !== null && lastFix < at ? lastFix : at;
    } else if (event.intent === "GPS_RESTORED") {
      if (gpsOpen !== null) {
        gaps.push([gpsOpen, at]);
        gpsOpen = null;
      }
    } else if (event.intent === "MONITORING_STOPPED_DETECTED" || event.intent === "FOREGROUND_SERVICE_START_FAILED" || event.intent === "SERVICE_RECOVERY_FAILED") {
      if (serviceOpen === null) serviceOpen = at;
    } else if (event.intent === "SERVICE_RECOVERY" && data.success === true) {
      if (serviceOpen !== null) {
        gaps.push([serviceOpen, at]);
        serviceOpen = null;
      }
    }
  }
  if (gpsOpen !== null) gaps.push([gpsOpen, endMs]);
  if (serviceOpen !== null) gaps.push([serviceOpen, endMs]);

  const unmonitoredMs = merge(gaps, startMs, endMs).reduce((sum, [a, b]) => sum + (b - a), 0);
  const monitoredMs = Math.max(0, spanMs - unmonitoredMs);
  const coveragePercent = Math.round((monitoredMs / spanMs) * 1000) / 10;
  return { spanMs, monitoredMs, unmonitoredMs, coveragePercent };
}

function payloadData(payloadJson: string): Record<string, unknown> {
  try {
    const data = (JSON.parse(payloadJson) as { data?: unknown }).data;
    if (data && typeof data === "object" && !Array.isArray(data)) return data as Record<string, unknown>;
  } catch {
    // Un asiento ilegible no abre ni cierra un hueco.
  }
  return {};
}

/** Cobertura de una jornada a partir de sus asientos. Sin asientos de hueco: 100%. */
export function coverageForSession(
  session: { id: number; actualStartAtMs: number | null; declaredStartAtMs: number; endAtMs: number | null },
  entries: readonly { sessionId: number | null; intent: string; timestampMs: number; payloadJson: string }[],
  nowMs: number,
): MonitoringCoverage {
  const startMs = session.actualStartAtMs ?? session.declaredStartAtMs;
  const endMs = session.endAtMs ?? nowMs;
  const events = entries
    .filter((entry) => entry.sessionId === session.id)
    .map((entry) => ({ intent: entry.intent, timestampMs: entry.timestampMs, data: payloadData(entry.payloadJson) }));
  return monitoringCoverage({ startMs, endMs }, events);
}
