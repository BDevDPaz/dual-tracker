// src/utils/geoUtils.ts (portado de GEOTrack / LEDTracker)

const deg2rad = (deg: number): number => deg * (Math.PI / 180);

/**
 * Calcula la distancia en metros entre dos coordenadas (fórmula de Haversine).
 *
 * Cambio respecto a GEOTrack: el original devolvía 0 si alguna coordenada era
 * falsy (incluido 0 legítimo). Aquí se valida con Number.isFinite y se
 * devuelve NaN si falta un dato, para no fingir "dentro del radio".
 */
export const getDistanceFromLatLonInMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return NaN;

  const R = 6371e3; // Radio de la tierra en metros
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/** Valida un par lat/lon. */
export const isValidCoordinate = (lat: unknown, lon: unknown): boolean =>
  typeof lat === "number" &&
  typeof lon === "number" &&
  Number.isFinite(lat) &&
  Number.isFinite(lon) &&
  lat >= -90 &&
  lat <= 90 &&
  lon >= -180 &&
  lon <= 180;
