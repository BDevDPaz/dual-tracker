/**
 * Pila raíz de rutas (app/_layout.tsx). H-13: el gate (app/index.tsx) solo
 * decide en «/»; un deep link (dualtracker://history, /session/1…) entraba
 * directo. Las rutas operativas quedan en `Stack.Protected` con la misma regla
 * que el gate (`canEnterApp`): sin alta o sin aviso aceptado, expo-router
 * vuelve a la primera ruta disponible, que es el gate.
 * El guard no depende de la hidratación: en un re-hidratado los ajustes ya
 * cargados se mantienen y las pestañas no se desmontan.
 */
import { Stack } from "expo-router";
import { useWorkTracker } from "../core/hooks";
import { canEnterApp } from "../core/initialRoute";
import { selectNeedsDisclaimer, selectNeedsOnboarding } from "../core/selectors";

export function RootStack({ backgroundColor }: { backgroundColor?: string }) {
  const { state } = useWorkTracker();
  const operable = canEnterApp({ needsOnboarding: selectNeedsOnboarding(state), needsDisclaimer: selectNeedsDisclaimer(state) });
  return (
    <Stack screenOptions={{ headerShown: false, freezeOnBlur: false, contentStyle: backgroundColor ? { backgroundColor } : undefined }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(boot)" options={{ gestureEnabled: false }} />
      <Stack.Screen name="(onboarding)" options={{ gestureEnabled: false }} />
      <Stack.Protected guard={operable}>
        <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
        <Stack.Screen name="session" />
        <Stack.Screen name="sites" />
        <Stack.Screen name="report" />
        <Stack.Screen name="system" options={{ presentation: "modal" }} />
      </Stack.Protected>
      <Stack.Screen name="legal" />
      <Stack.Screen name="support" />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}
