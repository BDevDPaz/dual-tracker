/**
 * Memoria de Soporte. Solo AsyncStorage, con prefijo propio.
 * No abre SQLite, no escribe el ledger, no crea expedientes ni geocercas.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

/** Namespace de práctica. Distinto de la base `dual_tracker_v1.db`. */
export const PRACTICE_STORAGE_KEY = "dt.practice.v1";
/** Consejos ya descartados. */
export const TIPS_STORAGE_KEY = "dt.support.tips.v1";

const cache = new Map<string, string>();

export async function supportGet(key: string): Promise<string | null> {
  try {
    const stored = await AsyncStorage.getItem(key);
    if (stored !== null) {
      cache.set(key, stored);
      return stored;
    }
  } catch {
    // Sin módulo nativo: queda la copia en memoria de este proceso.
  }
  return cache.get(key) ?? null;
}

export async function supportSet(key: string, value: string): Promise<void> {
  cache.set(key, value);
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // La copia en memoria sigue valiendo para esta sesión.
  }
}

export async function supportRemove(key: string): Promise<void> {
  cache.delete(key);
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // Igual que supportSet.
  }
}

export async function __resetSupportMemoryForTests(): Promise<void> {
  cache.clear();
  try {
    await AsyncStorage.clear();
  } catch {
    // El doble de Jest a veces no expone clear en un entorno a medias.
  }
}
