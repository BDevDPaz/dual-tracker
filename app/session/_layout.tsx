/**
 * session/_layout.tsx — Stack de expediente con header nativo. El back vuelve
 * al origen (Historial u Hoy) porque se usa la pila de navegación real.
 */
import { Stack } from "expo-router";
import { TOKENS } from "../../src/constants/theme";
import { t } from "../../src/i18n";

export default function SessionLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: TOKENS.colors.background },
        headerTintColor: TOKENS.colors.primary,
        headerTitleStyle: { color: TOKENS.colors.text.primary },
        contentStyle: { backgroundColor: TOKENS.colors.background },
      }}
    >
      <Stack.Screen name="[id]" options={{ title: t("session.title") }} />
      <Stack.Screen name="[id]/trace" options={{ title: t("trace.title") }} />
    </Stack>
  );
}
