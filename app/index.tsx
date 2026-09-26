/**
 * app/index.tsx — Gate de entrada (Producto §5.1). No es la pantalla Hoy.
 * Semáforo: hidratación → onboarding → descargo → tabs. Evita el parpadeo de
 * tabs sin sesión hidratada.
 */
import { Redirect } from "expo-router";
import { useWorkTracker } from "../src/core/hooks";
import { selectIsHydrated, selectNeedsDisclaimer, selectNeedsOnboarding } from "../src/core/selectors";

export default function Gate() {
  const { state } = useWorkTracker();
  if (!selectIsHydrated(state)) return <Redirect href="/(boot)/hydrating" />;
  if (selectNeedsOnboarding(state)) return <Redirect href="/(onboarding)/welcome" />;
  if (selectNeedsDisclaimer(state)) return <Redirect href="/(onboarding)/disclosure" />;
  return <Redirect href="/(tabs)" />;
}
