/**
 * Reloj de arranque del teléfono (Android elapsedRealtime / iOS systemUptime).
 * Las pruebas lo sustituyen. Sin el módulo nativo se devuelve null y el
 * asiento OS_KILL igual anota el hueco hasta que la app volvió.
 */
let injected: (() => Promise<number | null>) | null = null;

export function setDeviceUptimeReader(reader: (() => Promise<number | null>) | null): void {
  injected = reader;
}

function nativeUptimeMs(): number | null {
  try {
    // Carga perezosa: Jest y un binario anterior no tienen el módulo nativo.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const core = require("expo-modules-core") as {
      requireOptionalNativeModule?: (name: string) => { elapsedRealtime?: () => number } | null;
    };
    const mod = core.requireOptionalNativeModule?.("DeviceUptime");
    const ms = mod?.elapsedRealtime?.();
    if (typeof ms === "number" && Number.isFinite(ms) && ms >= 0) return ms;
  } catch {
    // Jest y un binario anterior al módulo no tienen DeviceUptime.
  }
  return null;
}

export async function readDeviceUptimeMs(): Promise<number | null> {
  if (injected) return injected();
  return nativeUptimeMs();
}
