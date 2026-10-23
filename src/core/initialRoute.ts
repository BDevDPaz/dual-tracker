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

export function initialHref(input: {
  hydrated: boolean;
  needsOnboarding: boolean;
  needsDisclaimer: boolean;
  hasConflict: boolean;
}): GateHref {
  if (!input.hydrated) return "/(boot)/hydrating";
  if (input.needsOnboarding) return "/(onboarding)/welcome";
  if (input.needsDisclaimer) return "/(onboarding)/disclosure";
  if (input.hasConflict) return "/system/conflict";
  return "/(tabs)";
}
