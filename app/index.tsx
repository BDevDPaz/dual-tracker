/**
 * app/index.tsx — Gate de entrada (Producto §5.1). No es la pantalla Hoy.
 * Semáforo: hidratación → onboarding → descargo → conflicto sin resolver → tabs.
 */
import { Redirect } from "expo-router";
import { useWorkTracker } from "../src/core/hooks";
import { initialHref } from "../src/core/initialRoute";
import { selectHasConflict, selectIsHydrated, selectNeedsDisclaimer, selectNeedsOnboarding } from "../src/core/selectors";

export default function Gate() {
  const { state } = useWorkTracker();
  return (
    <Redirect
      href={initialHref({
        hydrated: selectIsHydrated(state),
        needsOnboarding: selectNeedsOnboarding(state),
        needsDisclaimer: selectNeedsDisclaimer(state),
        hasConflict: selectHasConflict(state),
      })}
    />
  );
}
