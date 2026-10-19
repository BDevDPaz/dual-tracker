/**
 * session/_layout.tsx — Stack de expediente con header nativo. El back vuelve
 * al origen (Historial u Hoy) porque se usa la pila de navegación real.
 */
import { Stack } from "expo-router";
import { stackHeaderOptions } from "../../src/components/ui/navigation";
import { HeaderActions } from "../../src/components/support/HelpButton";
import { useTheme } from "../../src/context/ThemeContext";
import { t, useLanguage } from "../../src/i18n";

export default function SessionLayout() {
  useLanguage();
  const { colors } = useTheme();
  return (
    <Stack screenOptions={stackHeaderOptions(colors)}>
      <Stack.Screen name="[id]" options={{ title: t("session.title"), headerRight: () => <HeaderActions screen="session" /> }} />
      <Stack.Screen name="[id]/trace" options={{ title: t("trace.title"), headerRight: () => <HeaderActions screen="trace" /> }} />
    </Stack>
  );
}
