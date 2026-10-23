/**
 * Movimientos de sitio (SITE_LOCATED). Presentación del PDF del empleador.
 * No entran en packHash ni en la firma: el sello cubre el manifiesto y la evidencia.
 */
import escapeHtml from "escape-html";
import { t, type Language } from "../../i18n";

export interface SitePoint {
  lat: number;
  lon: number;
}

export interface SiteMoveNote {
  siteId: number;
  previous: SitePoint | null;
  next: SitePoint;
  spreadM: number | null;
}

function point(value: unknown): SitePoint | null {
  if (!value || typeof value !== "object") return null;
  const lat = (value as { lat?: unknown }).lat;
  const lon = (value as { lon?: unknown }).lon;
  if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat === 0 && lon === 0) return null;
  return { lat, lon };
}

export function siteMovesFromLedger(rows: readonly { intent: string; payloadJson: string }[]): SiteMoveNote[] {
  const notes: SiteMoveNote[] = [];
  for (const row of rows) {
    if (row.intent !== "SITE_LOCATED") continue;
    try {
      const data = (JSON.parse(row.payloadJson) as { data?: Record<string, unknown> }).data;
      if (!data || typeof data.siteId !== "number") continue;
      const next = point(data.next);
      if (!next) continue;
      const previous = data.previous == null ? null : point(data.previous);
      const spreadM = typeof data.spreadM === "number" && Number.isFinite(data.spreadM) ? data.spreadM : null;
      notes.push({ siteId: data.siteId, previous, next, spreadM });
    } catch {
      // Un asiento ilegible no tapa el resto del expediente.
    }
  }
  return notes;
}

function fmt(p: SitePoint): string {
  return `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;
}

export function siteMoveSentence(move: SiteMoveNote, siteName: string, lang: Language): string {
  if (move.previous) {
    return t("comprobante.siteMoveFrom", { site: siteName, from: fmt(move.previous), to: fmt(move.next) }, lang);
  }
  return t("comprobante.siteMoveNew", { site: siteName, to: fmt(move.next) }, lang);
}

/** Bloque HTML. Vacío si no hubo movimientos, para no cambiar un PDF sin ellos. */
export function siteMoveBlock(
  moves: readonly SiteMoveNote[] | undefined,
  sites: readonly { id: number; alias: string }[],
  lang: Language,
): string {
  if (!moves?.length) return "";
  const body = moves
    .map((move) => {
      const name = sites.find((s) => s.id === move.siteId)?.alias ?? `#${move.siteId}`;
      return `<div class="log-item" data-site-move="${move.siteId}">${escapeHtml(siteMoveSentence(move, name, lang))}</div>`;
    })
    .join("");
  return `<div class="section-title" data-site-moves="1">${escapeHtml(t("comprobante.siteMoveTitle", {}, lang))}</div>${body}`;
}
