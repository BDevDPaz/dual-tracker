/**
 * Lectura best-effort de integridad del dispositivo.
 * expo-device cubre isDevice y el fingerprint. El módulo nativo, si el binario
 * lo trae, lee opciones de desarrollador y rutas de root. Sin módulo, esas
 * señales quedan null: no se afirma que el teléfono esté limpio.
 * Se asienta solo cuando el resultado cambia. No bloquea.
 */
import * as Device from "expo-device";
import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";
import type { SessionRecordStatus } from "../../core/contracts";
import {
  assessDeviceIntegrity,
  deviceIntegrityFingerprint,
  deviceIntegrityIsConcrete,
  deviceIntegritySeverity,
  type DeviceIntegrityEvidence,
  type DeviceProbe,
} from "../../core/deviceIntegrityAssess";
import { TimeAuthorityService } from "../evidence/TimeAuthorityService";
import { IntegrityLedgerService } from "../domain/IntegrityLedgerService";
import { LoggingService } from "../persistence/LoggingService";
import { PersistenceService } from "../persistence/PersistenceService";
import { KV_KEYS } from "../persistence/schema";
import { serializeError } from "../../utils/serializeError";

interface NativeProbe {
  developerOptionsEnabled?: boolean | null;
  fingerprint?: string | null;
  hardware?: string | null;
  product?: string | null;
  model?: string | null;
  brand?: string | null;
  device?: string | null;
  rootHits?: string[] | null;
  rootChecked?: boolean | null;
}

type NativeModule = { probe: () => NativeProbe | null };

let probeOverride: DeviceProbe | null = null;

/** Solo pruebas: sustituye expo-device y el módulo nativo. null vuelve a la lectura real. */
export function __setDeviceProbeForTests(probe: DeviceProbe | null): void {
  probeOverride = probe;
}

function readNative(): NativeProbe | null {
  try {
    const native = requireOptionalNativeModule<NativeModule>("DeviceIntegrity");
    return native?.probe() ?? null;
  } catch {
    return null;
  }
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function probeFromEnvironment(native: NativeProbe | null, platform = Platform.OS): DeviceProbe {
  const rootHits = Array.isArray(native?.rootHits) ? native.rootHits.filter((hit) => typeof hit === "string") : [];
  return {
    platform,
    isDevice: typeof Device.isDevice === "boolean" ? Device.isDevice : null,
    brand: text(Device.brand),
    manufacturer: text(Device.manufacturer),
    modelName: text(Device.modelName),
    productName: text(Device.productName),
    fingerprint: text(native?.fingerprint) ?? text(Device.osBuildFingerprint),
    hardware: text(native?.hardware),
    product: text(native?.product),
    model: text(native?.model) ?? text(Device.modelName),
    device: text(native?.device),
    developerOptionsEnabled: typeof native?.developerOptionsEnabled === "boolean" ? native.developerOptionsEnabled : null,
    rootChecked: native?.rootChecked === true || (native !== null && Array.isArray(native.rootHits)),
    rootHits,
  };
}

interface StoredIntegrity {
  fingerprint: string;
  evidence: DeviceIntegrityEvidence;
}

function readStored(value: unknown): StoredIntegrity | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<StoredIntegrity>;
  if (typeof row.fingerprint !== "string" || !row.evidence) return null;
  return row as StoredIntegrity;
}

export async function loadDeviceIntegrity(): Promise<DeviceIntegrityEvidence | null> {
  return readStored(await PersistenceService.getKv<unknown>(KV_KEYS.DEVICE_INTEGRITY))?.evidence ?? null;
}

/**
 * Lee y, si el resultado concreto cambió, lo asienta.
 * Sin señales (módulo ausente y sin expo-device) no escribe.
 */
export async function observeDeviceIntegrity(session: { id: number; domainStatus: SessionRecordStatus } | null): Promise<DeviceIntegrityEvidence | null> {
  const evidence = assessDeviceIntegrity(probeOverride ?? probeFromEnvironment(readNative()));
  if (!deviceIntegrityIsConcrete(evidence)) return (await loadDeviceIntegrity()) ?? null;
  const fingerprint = deviceIntegrityFingerprint(evidence);
  const prev = readStored(await PersistenceService.getKv<unknown>(KV_KEYS.DEVICE_INTEGRITY));
  if (prev?.fingerprint === fingerprint) return evidence;
  const severity = deviceIntegritySeverity(evidence);
  const state = session?.domainStatus ?? null;
  try {
    await PersistenceService.transaction(async (db) => {
      await IntegrityLedgerService.append(
        {
          sessionId: session?.id ?? null,
          actor: "SYSTEM",
          intent: "DEVICE_INTEGRITY",
          fromState: state,
          toState: state,
          reason: "DEVICE_INTEGRITY",
          timestampMs: TimeAuthorityService.now(),
          integrityClass: null,
          data: {
            ...(severity ? { severity } : {}),
            developerOptionsEnabled: evidence.developerOptionsEnabled,
            emulator: evidence.emulator,
            emulatorHits: evidence.emulatorHits,
            rooted: evidence.rooted,
            rootHits: evidence.rootHits,
            isDevice: evidence.isDevice,
            platform: evidence.platform,
          },
        },
        db,
      );
      await PersistenceService.setKv(KV_KEYS.DEVICE_INTEGRITY, { fingerprint, evidence } satisfies StoredIntegrity, db);
    });
  } catch (error) {
    LoggingService.log("NARANJA", "SERVICIOS_ACTIVOS", "WARN", "No se pudo asentar la integridad del dispositivo", serializeError(error));
  }
  return evidence;
}
