/**
 * Reverse geocode (D12) — coordenadas del punto de configuración → nombre de lugar.
 * Usa el permiso de ubicación que ya existe. No pide permisos nuevos.
 * Si la red, el tiempo o el permiso fallan, devuelve null. No inventa una dirección.
 */
import * as Location from "expo-location";
import type { LocationGeocodedAddress } from "expo-location";
import { isValidCoordinate } from "../../utils/geoUtils";
import { serializeError } from "../../utils/serializeError";
import { LoggingService } from "../persistence/LoggingService";

/** Tope para no dejar colgada la ficha del destino si el geocoder no responde. */
export const REVERSE_GEOCODE_TIMEOUT_MS = 8_000;

type PlaceFailure = "permission" | "timeout" | "network" | "unavailable";

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function same(a: string | null, b: string | null): boolean {
  return a != null && b != null && a.toLowerCase() === b.toLowerCase();
}

/** Texto del primer resultado. Null si no hay partes usables. */
export function formatPlaceAddress(row: Partial<LocationGeocodedAddress> | null | undefined): string | null {
  if (!row) return null;
  const formatted = clean(row.formattedAddress);
  if (formatted) return formatted;

  const street = clean(row.street);
  const streetLine = [clean(row.streetNumber), street].filter((part): part is string => !!part).join(" ") || null;
  const name = clean(row.name);
  const parts = [
    name && !same(name, street) && !same(name, streetLine) ? name : null,
    streetLine,
    clean(row.district),
    clean(row.city),
    clean(row.subregion),
    clean(row.region),
    clean(row.postalCode),
    clean(row.country),
  ];
  const unique: string[] = [];
  for (const part of parts) {
    if (!part || unique.some((seen) => same(seen, part))) continue;
    unique.push(part);
  }
  return unique.length > 0 ? unique.join(", ") : null;
}

function failureKind(error: unknown): PlaceFailure {
  const serialized = serializeError(error);
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  const text = `${code} ${serialized}`.toLowerCase();
  if (code === "REVERSE_GEOCODE_TIMEOUT" || text.includes("timeout") || text.includes("timed out")) return "timeout";
  if (text.includes("permission") || text.includes("authori") || text.includes("denied")) return "permission";
  if (text.includes("network") || text.includes("offline") || text.includes("internet") || text.includes("enotfound") || text.includes("eai_again")) {
    return "network";
  }
  return "unavailable";
}

function noteFailure(kind: PlaceFailure, error?: unknown): void {
  LoggingService.log("AMARILLO", "UBICACION", "WARN", "nombre de lugar no disponible", {
    reason: kind,
    ...(error === undefined ? {} : { error: serializeError(error) }),
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error("reverse geocode timeout"), { code: "REVERSE_GEOCODE_TIMEOUT" })), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Dirección legible del punto, o null.
 * No llama al geocoder si las coordenadas no valen o si la ubicación no está concedida.
 */
export async function reverseGeocodePoint(lat: number, lon: number): Promise<string | null> {
  if (!isValidCoordinate(lat, lon)) return null;

  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== "granted") {
      noteFailure("permission");
      return null;
    }
  } catch (error) {
    noteFailure("permission", error);
    return null;
  }

  try {
    const rows = await withTimeout(
      Location.reverseGeocodeAsync({ latitude: lat, longitude: lon }),
      REVERSE_GEOCODE_TIMEOUT_MS,
    );
    const first = Array.isArray(rows) ? rows[0] : null;
    return formatPlaceAddress(first);
  } catch (error) {
    noteFailure(failureKind(error), error);
    return null;
  }
}
