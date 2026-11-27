/**
 * Ruta del gate de arranque. Un CONFLICT sin resolver va antes de Hoy (T30).
 * El banner de Hoy queda para «Más tarde»; el siguiente arranque en frío vuelve aquí.
 */
export type GateHref =
  | "/(boot)/hydrating"
  | "/(onboarding)/welcome"
  | "/(onboarding)/disclosure"
  | "/system/conflict"
  | "/(tabs)";

/**
 * Rutas operativas (pestañas, sesión, destinos, reportes, sistema) solo con el
 * alta completada y el aviso vigente aceptado: la misma condición que el gate
 * exige antes de «/(tabs)». La usa `Stack.Protected` (H-13).
 */
export function canEnterApp(input: { needsOnboarding: boolean; needsDisclaimer: boolean }): boolean {
  return !input.needsOnboarding && !input.needsDisclaimer;
}

export function initialHref(input: {
  hydrated: boolean;
  bootError?: string | null;
  needsOnboarding: boolean;
  needsDisclaimer: boolean;
  hasConflict: boolean;
}): GateHref {
  if (!input.hydrated || input.bootError != null) return "/(boot)/hydrating";
  if (input.needsOnboarding) return "/(onboarding)/welcome";
  if (input.needsDisclaimer) return "/(onboarding)/disclosure";
  if (input.hasConflict) return "/system/conflict";
  return "/(tabs)";
}
