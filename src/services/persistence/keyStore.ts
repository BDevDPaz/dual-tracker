/**
 * KeyStore — puerto get/set/delete de la clave maestra (spec v1.3 §9).
 * ============================================================================
 *  - Nativo: expo-secure-store con AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY y
 *    requireAuthentication = false (las tareas de geocerca despiertan con el
 *    equipo bloqueado; THIS_DEVICE_ONLY impide que la clave viaje en respaldos).
 *  - Web: no disponible → FieldCrypto queda UNAVAILABLE (§12, web no apta
 *    para jornadas certificadas).
 *  - Jest: el doble de expo-secure-store es un Map; `__setFailure` simula un
 *    llavero caído (D11).
 * Prohibido persistir la MK en SQLite, Settings, AsyncStorage, logs o el pack.
 */
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export interface KeyStorePort {
  /** false = plataforma sin almacén seguro (web). */
  readonly platformSupported: boolean;
  get(slot: string): Promise<string | null>;
  set(slot: string, value: string): Promise<void>;
  delete(slot: string): Promise<void>;
}

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  requireAuthentication: false,
};

let failure: Error | null = null;
let platformOverride: boolean | null = null;

/**
 * Build de prueba D11 (spec §18): EXPO_PUBLIC_DT_FORCE_KEYSTORE_FAILURE=1 al
 * compilar simula un llavero caído. Nunca activar en builds de producción.
 * Doble cerrojo (docs/BUILD.md): app.config.ts aborta si la bandera llega sin
 * APP_VARIANT=d11, y aquí solo actúa si la config embebida es la variante d11
 * (com.bdevdpaz.dualtracker.d11). En la app real la bandera se ignora.
 */
export function isForcedKeystoreFailure(flag: string | undefined, appVariant: unknown): boolean {
  return flag === "1" && appVariant === "d11";
}

const FORCED_FAILURE = isForcedKeystoreFailure(
  process.env.EXPO_PUBLIC_DT_FORCE_KEYSTORE_FAILURE,
  Constants.expoConfig?.extra?.appVariant,
);

function guard(): void {
  if (failure) throw failure;
  if (FORCED_FAILURE) throw new Error("KeyStore forzado a fallar (build de prueba D11)");
  if (!KeyStore.platformSupported) throw new Error("KeyStore no disponible en esta plataforma");
}

export const KeyStore: KeyStorePort & {
  __setFailure(e: Error | null): void;
  __setPlatformSupported(v: boolean | null): void;
  __reset(): void;
} = {
  get platformSupported(): boolean {
    return platformOverride ?? Platform.OS !== "web";
  },
  async get(slot) {
    guard();
    return SecureStore.getItemAsync(slot, OPTIONS);
  },
  async set(slot, value) {
    guard();
    await SecureStore.setItemAsync(slot, value, OPTIONS);
  },
  async delete(slot) {
    guard();
    await SecureStore.deleteItemAsync(slot, OPTIONS);
  },
  /** Solo tests / build de prueba D11: fuerza el fallo del llavero. */
  __setFailure(e) {
    failure = e;
  },
  /** Solo tests: simula web (false) o nativo (true). */
  __setPlatformSupported(v) {
    platformOverride = v;
  },
  __reset() {
    failure = null;
    platformOverride = null;
  },
};
