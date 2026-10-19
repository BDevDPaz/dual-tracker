/**
 * session/_layout.tsx — Stack de expediente con header nativo. El back vuelve
 * al origen (Historial u Hoy) porque se usa la pila de navegación real.
 */
import { Stack } from "expo-router";
import { TOKENS } from "../../src/constants/theme";
import { HelpButton } from "../../src/components/support/HelpButton";
import { t, useLanguage } from "../../src/i18n";

export default function SessionLayout() {
  useLanguage();
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        freezeOnBlur: false,
        headerStyle: { backgroundColor: TOKENS.colors.background },
        headerTintColor: TOKENS.colors.primary,
        headerTitleStyle: { color: TOKENS.colors.text.primary },
        contentStyle: { backgroundColor: TOKENS.colors.background },
      }}
    >
      <Stack.Screen name="[id]" options={{ title: t("session.title"), headerRight: () => <HelpButton screen="session" /> }} />
      <Stack.Screen name="[id]/trace" options={{ title: t("trace.title"), headerRight: () => <HelpButton screen="trace" /> }} />
    </Stack>
  );
}
