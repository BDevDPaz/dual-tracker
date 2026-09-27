/** Doble de expo-mail-composer. */
export const __sent: unknown[] = [];
export async function isAvailableAsync() {
  return true;
}
export async function composeAsync(opts: unknown) {
  __sent.push(opts);
  return { status: "sent" };
}
export function __reset(): void {
  __sent.length = 0;
}
