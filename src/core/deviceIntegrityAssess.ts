/**
 * Evidencia de integridad del dispositivo. No bloquea la jornada ni el pago.
 * En Android, best-effort. Si no hubo lectura, el campo queda null: no se
 * afirma que el teléfono esté limpio.
 */
export interface DeviceProbe {
  platform: string;
  isDevice: boolean | null;
  brand: string | null;
  manufacturer: string | null;
  modelName: string | null;
  productName: string | null;
  fingerprint: string | null;
  hardware: string | null;
  product: string | null;
  model: string | null;
  device: string | null;
  /** null si no se pudo leer Ajustes. */
  developerOptionsEnabled: boolean | null;
  /** false si el módulo nativo no comprobó rutas. */
  rootChecked: boolean;
  rootHits: string[];
}

export interface DeviceIntegrityEvidence {
  platform: string;
  developerOptionsEnabled: boolean | null;
  emulator: boolean | null;
  emulatorHits: string[];
  rooted: boolean | null;
  rootHits: string[];
  isDevice: boolean | null;
}

const EMULATOR_MARKERS = ["sdk_gphone", "goldfish", "ranchu", "generic"] as const;

export function emulatorHitsFromProbe(probe: DeviceProbe): string[] {
  const blob = [probe.fingerprint, probe.hardware, probe.product, probe.model, probe.device, probe.brand, probe.manufacturer, probe.modelName, probe.productName]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join("\n")
    .toLowerCase();
  const hits: string[] = [];
  for (const marker of EMULATOR_MARKERS) {
    if (blob.includes(marker)) hits.push(marker);
  }
  if (probe.isDevice === false) hits.push("isDevice");
  return hits;
}

function hasIdentity(probe: DeviceProbe): boolean {
  return [probe.fingerprint, probe.hardware, probe.product, probe.model, probe.device, probe.brand, probe.manufacturer, probe.modelName, probe.productName].some(
    (part) => typeof part === "string" && part.length > 0,
  );
}

export function assessDeviceIntegrity(probe: DeviceProbe): DeviceIntegrityEvidence {
  const emulatorHits = emulatorHitsFromProbe(probe);
  const android = probe.platform === "android";
  // Sin lectura (isDevice null y sin identidad) no se afirma que no sea emulador.
  let emulator: boolean | null;
  if (emulatorHits.length > 0) emulator = true;
  else if (probe.isDevice === true || (android && hasIdentity(probe))) emulator = false;
  else emulator = null;

  const rooted = android && probe.rootChecked ? probe.rootHits.length > 0 : null;
  return {
    platform: probe.platform,
    developerOptionsEnabled: android ? probe.developerOptionsEnabled : null,
    emulator,
    emulatorHits,
    rooted,
    rootHits: android && probe.rootChecked ? [...probe.rootHits] : [],
    isDevice: probe.isDevice,
  };
}

export type DeviceIntegritySeverity = "LOW" | "HIGH" | "CRITICAL" | null;

/** La señal más alta presente. Un teléfono sin señales no lleva severidad. */
export function deviceIntegritySeverity(evidence: DeviceIntegrityEvidence): DeviceIntegritySeverity {
  if (evidence.rooted) return "CRITICAL";
  if (evidence.emulator) return "HIGH";
  if (evidence.developerOptionsEnabled) return "LOW";
  return null;
}

export function deviceIntegrityFingerprint(evidence: DeviceIntegrityEvidence): string {
  return JSON.stringify({
    developerOptionsEnabled: evidence.developerOptionsEnabled,
    emulator: evidence.emulator,
    emulatorHits: [...evidence.emulatorHits].sort(),
    rooted: evidence.rooted,
    rootHits: [...evidence.rootHits].sort(),
    isDevice: evidence.isDevice,
    platform: evidence.platform,
  });
}

export function deviceIntegrityIsConcrete(evidence: DeviceIntegrityEvidence): boolean {
  return evidence.developerOptionsEnabled !== null || evidence.emulator !== null || evidence.rooted !== null || evidence.isDevice !== null;
}
