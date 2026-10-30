import React from "react";
import { Redirect } from "expo-router";

import { useWorkTracker } from "../src/core/hooks/useWorkTracker";
import {
  selectIsHydrated,
  selectNeedsOnboarding,
  selectNeedsDisclaimer,
} from "../src/core/selectors";

/**
 * app/index.tsx — Gate de entrada (Propuesta capa app §5.1).
 * No es la pantalla Hoy: es un semáforo puro. Redirige según la tabla de
 * decisión del blueprint; nunca pinta UI de negocio propia.
 *
 *   isHydrated = false        -> /(boot)/hydrating
 *   needsOnboarding = true    -> /(onboarding)/welcome
 *   needsDisclaimer = true    -> /(onboarding)/disclosure
 *   en otro caso               -> /(tabs)
 */
export default function Gate() {
  const { state } = useWorkTracker();

  const isHydrated = selectIsHydrated(state);
  const needsOnboarding = selectNeedsOnboarding(state);
  const needsDisclaimer = selectNeedsDisclaimer(state);

  if (!isHydrated) {
    return <Redirect href="/(boot)/hydrating" />;
  }

  if (needsOnboarding) {
    return <Redirect href="/(onboarding)/welcome" />;
  }

  if (needsDisclaimer) {
    return <Redirect href="/(onboarding)/disclosure" />;
  }

  return <Redirect href="/(tabs)" />;
}
