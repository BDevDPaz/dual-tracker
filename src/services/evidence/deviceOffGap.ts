/**
 * Hueco entre el último latido y la vuelta de la app.
 * Si el reloj de arranque dice que el teléfono reinició después de ese
 * latido, deviceOffMs es el apagado (latido → reinicio). Si el teléfono
 * siguió encendido, deviceOffMs queda null: fue la app, no el aparato.
 * Sin reloj de arranque no se inventa el reinicio.
 */

export interface DeviceClock {
  nowMs: number;
  /** Milisegundos desde el arranque, sueño incluido. null si no se conoce. */
  uptimeMs: number | null;
}

export interface DeviceOffGap {
  lastHeartbeatMs: number;
  resumedAtMs: number;
  gapMs: number;
  bootAtMs: number | null;
  deviceOffMs: number | null;
}

export function deviceOffGap(lastHeartbeatMs: number, clock: DeviceClock): DeviceOffGap {
  const resumedAtMs = clock.nowMs;
  const gapMs = Math.max(0, resumedAtMs - lastHeartbeatMs);
  const uptime = clock.uptimeMs;
  if (uptime === null || !Number.isFinite(uptime) || uptime < 0) {
    return { lastHeartbeatMs, resumedAtMs, gapMs, bootAtMs: null, deviceOffMs: null };
  }
  const bootAtMs = resumedAtMs - uptime;
  if (lastHeartbeatMs < bootAtMs) {
    return { lastHeartbeatMs, resumedAtMs, gapMs, bootAtMs, deviceOffMs: Math.max(0, bootAtMs - lastHeartbeatMs) };
  }
  return { lastHeartbeatMs, resumedAtMs, gapMs, bootAtMs, deviceOffMs: null };
}

/** Lo que el comprobante pinta. No entra en el statement ni en la evidencia hasheada. */
export interface PowerOffNote extends DeviceOffGap {
  sessionId: number;
}

export function powerOffFromPayload(sessionId: number | null, data: Record<string, unknown> | undefined): PowerOffNote | null {
  if (sessionId === null || !data) return null;
  const last = data.lastHeartbeatMs;
  const gap = data.gapMs;
  if (typeof last !== "number" || !Number.isFinite(last) || typeof gap !== "number" || !Number.isFinite(gap)) return null;
  const resumedAtMs = typeof data.resumedAtMs === "number" && Number.isFinite(data.resumedAtMs) ? data.resumedAtMs : last + gap;
  const bootAtMs = typeof data.bootAtMs === "number" && Number.isFinite(data.bootAtMs) ? data.bootAtMs : null;
  const deviceOffMs = typeof data.deviceOffMs === "number" && Number.isFinite(data.deviceOffMs) ? data.deviceOffMs : null;
  return { sessionId, lastHeartbeatMs: last, resumedAtMs, gapMs: gap, bootAtMs, deviceOffMs };
}

export function powerOffsFromLedger(rows: readonly { sessionId: number | null; intent: string; payloadJson: string }[]): PowerOffNote[] {
  const notes: PowerOffNote[] = [];
  for (const row of rows) {
    if (row.intent !== "OS_KILL") continue;
    try {
      const data = (JSON.parse(row.payloadJson) as { data?: Record<string, unknown> }).data;
      const note = powerOffFromPayload(row.sessionId, data);
      if (note) notes.push(note);
    } catch {
      // Un asiento ilegible no tapa el resto del comprobante.
    }
  }
  return notes;
}
