/**
 * Plano local equirectangular. No pide teselas ni sale del teléfono:
 * x hacia el este, y hacia el norte, origen en el centroide.
 */
const METERS_PER_DEG_LAT = 111_320;

export interface LatLon {
  lat: number;
  lon: number;
}

export interface PlaneMeters {
  x: number;
  y: number;
}

export function projectEquirectangular(point: LatLon, origin: LatLon): PlaneMeters {
  const lat0 = (origin.lat * Math.PI) / 180;
  const metersPerDegLon = METERS_PER_DEG_LAT * Math.cos(lat0);
  return {
    x: (point.lon - origin.lon) * metersPerDegLon,
    y: (point.lat - origin.lat) * METERS_PER_DEG_LAT,
  };
}

export function centroidOf(points: readonly LatLon[]): LatLon | null {
  if (!points.length) return null;
  const lat = points.reduce((a, p) => a + p.lat, 0) / points.length;
  const lon = points.reduce((a, p) => a + p.lon, 0) / points.length;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

export interface PlaneInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ViewFit {
  origin: LatLon;
  minX: number;
  minY: number;
  spanX: number;
  spanY: number;
  /** Pixeles por metro. */
  scale: number;
  width: number;
  height: number;
  inset: PlaneInsets;
}

function asInset(pad: number | PlaneInsets): PlaneInsets {
  if (typeof pad === "number") return { top: pad, right: pad, bottom: pad, left: pad };
  return pad;
}

export function fitLocalPlane(points: readonly LatLon[], width: number, height: number, pad: number | PlaneInsets = 28): ViewFit | null {
  const inset = asInset(pad);
  const origin = centroidOf(points);
  if (!origin || width <= inset.left + inset.right || height <= inset.top + inset.bottom) return null;
  const meters = points.map((p) => projectEquirectangular(p, origin));
  let minX = Math.min(...meters.map((p) => p.x));
  let maxX = Math.max(...meters.map((p) => p.x));
  let minY = Math.min(...meters.map((p) => p.y));
  let maxY = Math.max(...meters.map((p) => p.y));
  if (maxX - minX < 1) {
    minX -= 20;
    maxX += 20;
  }
  if (maxY - minY < 1) {
    minY -= 20;
    maxY += 20;
  }
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const scale = Math.min((width - inset.left - inset.right) / spanX, (height - inset.top - inset.bottom) / spanY);
  return { origin, minX, minY, spanX, spanY, scale, width, height, inset };
}

/** Norte arriba: y de pantalla crece hacia abajo. */
export function toScreen(meters: PlaneMeters, fit: ViewFit): { x: number; y: number } {
  return {
    x: fit.inset.left + (meters.x - fit.minX) * fit.scale,
    y: fit.height - fit.inset.bottom - (meters.y - fit.minY) * fit.scale,
  };
}

/** Longitud «redonda» (1, 2 o 5 × 10^n) cercana al 28 % del ancho. */
export function niceScaleMeters(widthPx: number, metersPerPixel: number): number {
  if (!(metersPerPixel > 0) || !(widthPx > 0)) return 10;
  const raw = widthPx * 0.28 * metersPerPixel;
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const candidates = [1, 2, 5, 10].map((c) => c * pow);
  return candidates.reduce((best, c) => (Math.abs(c - raw) < Math.abs(best - raw) ? c : best));
}

/** Puntos del borde de un círculo geodésico aproximado, en lat/lon, para incluirlos en el encuadre. */
export function circleSamples(center: LatLon, radiusM: number, steps = 16): LatLon[] {
  if (!(radiusM > 0)) return [center];
  const lat0 = (center.lat * Math.PI) / 180;
  const dLat = radiusM / METERS_PER_DEG_LAT;
  const dLon = radiusM / (METERS_PER_DEG_LAT * Math.max(0.2, Math.cos(lat0)));
  const out: LatLon[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    out.push({ lat: center.lat + dLat * Math.sin(a), lon: center.lon + dLon * Math.cos(a) });
  }
  return out;
}
