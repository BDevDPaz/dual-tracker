/**
 * session/_layout.tsx — Stack de expediente con header nativo. El back vuelve
 * al origen (Historial u Hoy) porque se usa la pila de navegación real.
 */
import { Stack } from "expo-router";
import { stackHeaderOptions } from "../../src/components/ui/navigation";
import { HelpButton } from "../../src/components/support/HelpButton";
import { t, useLanguage } from "../../src/i18n";

export default function SessionLayout() {
  useLanguage();
  return (
    <Stack
      screenOptions={stackHeaderOptions()}
    >
      <Stack.Screen name="[id]" options={{ title: t("session.title"), headerRight: () => <HelpButton screen="session" /> }} />
      <Stack.Screen name="[id]/trace" options={{ title: t("trace.title"), headerRight: () => <HelpButton screen="trace" /> }} />
    </Stack>
  );
}
