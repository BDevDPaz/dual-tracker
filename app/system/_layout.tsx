/**
 * system/_layout.tsx — Stack de sistema, presentado como modal (no tab).
 * conflict.tsx desactiva el gesto de cierre mientras haya CONFLICT abiertos.
 */
import { Stack } from "expo-router";
import { TOKENS } from "../../src/constants/theme";
import { t } from "../../src/i18n";

export default function SystemLayout() {
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
      <Stack.Screen name="health" options={{ title: t("health.title") }} />
      <Stack.Screen name="conflict" options={{ title: t("conflict.title"), gestureEnabled: false }} />
    </Stack>
  );
}
