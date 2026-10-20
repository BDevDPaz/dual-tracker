import { requireOptionalNativeModule } from "expo-modules-core";

type Native = { elapsedRealtime(): number };

const native = requireOptionalNativeModule<Native>("DeviceUptime");

/** Milisegundos desde el arranque, sueño incluido. null si el binario no trae el módulo. */
export function elapsedRealtimeMs(): number | null {
  const ms = native?.elapsedRealtime();
  return typeof ms === "number" && Number.isFinite(ms) && ms >= 0 ? ms : null;
}
