/** Doble de expo-clipboard (copia del código de verificación del expediente). */
export const __copied: string[] = [];
export async function setStringAsync(text: string): Promise<boolean> {
  __copied.push(text);
  return true;
}
export async function getStringAsync(): Promise<string> {
  return __copied[__copied.length - 1] ?? "";
}
export function __reset(): void {
  __copied.length = 0;
}
