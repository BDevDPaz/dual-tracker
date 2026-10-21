/**
 * Minutos en cada sitio a partir de la jornada (activa + sitio en curso).
 * No usa ENTER/EXIT de la geocerca: en la prueba del 20 oct 2026 esas
 * migas atribuían el traslado al sitio de salida (83 en vez de 73).
 */
import type { SessionRecord } from "../../core/contracts";
import { originSiteId } from "./siteVisits";

export interface SiteMinutes {
  siteId: number;
  minutes: number;
}

function overlapMs(a0: number, a1: number, b0: number, b1: number): number {
  const start = Math.max(a0, b0);
  const end = Math.min(a1, b1);
  return end > start ? end - start : 0;
}

function breakMs(session: SessionRecord, fromMs: number, toMs: number, nowMs: number): number {
  let ms = 0;
  const lunch = session.lunch;
  const lunchEnd = lunch.startAtMs !== null && lunch.endAtMs === null && session.domainStatus === "PAUSADA" ? nowMs : lunch.endAtMs;
  if (lunch.startAtMs !== null && lunchEnd !== null) ms += overlapMs(fromMs, toMs, lunch.startAtMs, lunchEnd);
  for (const pause of session.bookkeeping.pauses ?? []) {
    const end = pause.endAtMs ?? (session.domainStatus === "PAUSADA" ? nowMs : pause.startAtMs);
    ms += overlapMs(fromMs, toMs, pause.startAtMs, end);
  }
  if (!(session.bookkeeping.pauses ?? []).length && session.bookkeeping.lastPauseStartMs !== null && session.domainStatus === "PAUSADA") {
    ms += overlapMs(fromMs, toMs, session.bookkeeping.lastPauseStartMs, nowMs);
  }
  return ms;
}

/**
 * Tiempo en sitio entre el fichaje y el fin, saltando traslados (también
 * los cancelados) y descontando almuerzo y pausas. El origen es el `from`
 * del primer tramo; cada llegada cambia de sitio; un cancelado vuelve al
 * sitio del que salió.
 */
export function siteMinutesFromSession(session: SessionRecord, nowMs: number): SiteMinutes[] {
  const book = session.bookkeeping;
  if (!book || book.isDeleted || book.cancelled) return [];
  const start = session.actualStartAtMs;
  if (start === null) return [];
  const end =
    session.endAtMs ??
    (session.domainStatus === "SALIDA" && session.bookkeeping.firstExitAtMs ? session.bookkeeping.firstExitAtMs : nowMs);
  if (!(end > start)) return [];

  const acc = new Map<number, number>();
  const add = (siteId: number | null, fromMs: number, toMs: number) => {
    if (siteId === null || !(toMs > fromMs)) return;
    const net = Math.max(0, toMs - fromMs - breakMs(session, fromMs, toMs, nowMs));
    if (net > 0) acc.set(siteId, (acc.get(siteId) ?? 0) + net);
  };

  const segs = session.transitSegments
    .filter((t) => !t.suppressed)
    .slice()
    .sort((a, b) => a.startAtMs - b.startAtMs);
  let cursor = start;
  let site: number | null = originSiteId(session);
  for (const t of segs) {
    const legStart = Math.min(Math.max(t.startAtMs, cursor), end);
    if (legStart > cursor) add(site, cursor, legStart);
    const legEnd = t.endAtMs === null ? end : Math.min(Math.max(t.endAtMs, cursor), end);
    cursor = Math.max(cursor, legEnd);
    if (t.endAtMs === null) {
      cursor = end;
      site = null;
      break;
    }
    site = t.cancelled ? (t.fromSiteId ?? site) : t.toSiteId;
  }
  if (cursor < end && site !== null && session.domainStatus !== "TRASLADO") add(site, cursor, end);

  return [...acc.entries()]
    .map(([siteId, ms]) => ({ siteId, minutes: Math.round(ms / 60_000) }))
    .filter((row) => row.minutes > 0);
}
