/** Doble de expo-sharing. */
export const __shared: string[] = [];
export async function isAvailableAsync() {
  return true;
}
export async function shareAsync(uri: string) {
  __shared.push(uri);
}
export function __reset(): void {
  __shared.length = 0;
}
