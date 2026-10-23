import * as Location from "expo-location";

/** Dos lecturas seguidas para SITE_LOCATE. Null si el GPS no responde. */
export async function readTwoPositions(): Promise<{ lat: number; lon: number }[] | null> {
  try {
    const readings: { lat: number; lon: number }[] = [];
    for (let i = 0; i < 2; i++) {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      readings.push({ lat: loc.coords.latitude, lon: loc.coords.longitude });
    }
    return readings;
  } catch {
    return null;
  }
}
