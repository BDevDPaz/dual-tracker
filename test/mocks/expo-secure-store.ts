/** Doble de expo-secure-store: mapa clave/valor en proceso. */
export const store = new Map<string, string>();
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 1;
export const WHEN_UNLOCKED = 2;
export async function getItemAsync(key: string): Promise<string | null> {
  return store.get(key) ?? null;
}
export async function setItemAsync(key: string, value: string): Promise<void> {
  store.set(key, value);
}
export async function deleteItemAsync(key: string): Promise<void> {
  store.delete(key);
}
export function __reset(): void {
  store.clear();
}
