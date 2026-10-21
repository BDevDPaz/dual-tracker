/**
 * Sitios de una jornada con varios destinos.
 * ============================================================================
 * La sesión guarda un solo `siteId`: el sitio en el que quedó fichada (el
 * último al que llegó). El origen y las escalas viven en `transitSegments`.
 * Estas funciones reconstruyen la cadena sin inventar horas por cliente.
 */
import type { SessionRecord, TransitSegment } from "../../core/contracts";

function liveSegments(session: SessionRecord): TransitSegment[] {
  return session.transitSegments.filter((t) => !t.cancelled && !t.suppressed);
}

/** Sitio de salida: el from del primer tramo vivo, o `siteId` si no hubo traslado. */
export function originSiteId(session: SessionRecord): number | null {
  const from = liveSegments(session).find((t) => t.fromSiteId !== null)?.fromSiteId;
  return from ?? session.siteId;
}

/**
 * Un tramo cerrado es una llegada de verdad si después hay otro tramo, o si
 * la sesión quedó fichada en su destino. Cerrar la jornada en pleno TRASLADO
 * cierra el tramo pero no cambia `siteId`: eso no cuenta como llegada.
 */
function legArrived(session: SessionRecord, index: number, segs: readonly TransitSegment[]): boolean {
  const t = segs[index];
  if (t.endAtMs === null) return false;
  if (index < segs.length - 1) return true;
  return session.siteId === t.toSiteId;
}

/**
 * Cadena en orden: origen, cada llegada y, si hay tramo abierto, el destino
 * al que va (aún no es una visita cerrada, pero es un destino del día).
 */
export function checkedInSiteIds(session: SessionRecord): number[] {
  const segs = liveSegments(session);
  const ids: number[] = [];
  const add = (id: number | null) => {
    if (id !== null && !ids.includes(id)) ids.push(id);
  };
  add(originSiteId(session));
  for (let i = 0; i < segs.length; i++) {
    const t = segs[i];
    if (t.endAtMs === null) {
      add(t.toSiteId);
      break;
    }
    if (legArrived(session, i, segs)) add(t.toSiteId);
  }
  return ids;
}

/** Sitio en el que estaba fichado justo antes de `atMs` (el instante no entra). */
export function siteCheckedInBefore(session: SessionRecord, atMs: number): number | null {
  const segs = liveSegments(session);
  let site = originSiteId(session);
  for (let i = 0; i < segs.length; i++) {
    const t = segs[i];
    if (t.startAtMs >= atMs) break;
    if (t.endAtMs !== null && t.endAtMs < atMs && legArrived(session, i, segs)) {
      site = t.toSiteId;
      continue;
    }
    return t.fromSiteId ?? site;
  }
  return site;
}

/** Última llegada real a `siteId` (el origen cuenta desde el inicio de la jornada). */
export function lastVisitAtMs(session: SessionRecord, siteId: number): number | null {
  if (session.bookkeeping.isDeleted || session.bookkeeping.cancelled) return null;
  const start = session.actualStartAtMs ?? session.declaredStartAtMs;
  const segs = liveSegments(session);
  let best: number | null = null;
  const consider = (ts: number) => {
    if (best === null || ts > best) best = ts;
  };
  if (originSiteId(session) === siteId) consider(start);
  for (let i = 0; i < segs.length; i++) {
    const t = segs[i];
    if (t.toSiteId === siteId && t.endAtMs !== null && legArrived(session, i, segs)) consider(t.endAtMs);
  }
  return best;
}

/** Geocerca activa: destino del tramo abierto, o el sitio de la sesión. */
export function monitoredSiteId(session: SessionRecord): number | null {
  const open = session.transitSegments.find((t) => t.endAtMs === null && !t.cancelled && !t.suppressed);
  return open ? open.toSiteId : session.siteId;
}
