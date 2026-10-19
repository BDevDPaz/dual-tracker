/**
 * system/_layout.tsx — Stack de sistema, presentado como modal (no tab).
 * conflict.tsx desactiva el gesto de cierre mientras haya CONFLICT abiertos.
 */
import { Stack } from "expo-router";
import { TOKENS } from "../../src/constants/theme";
import { HelpButton } from "../../src/components/support/HelpButton";
import { t, useLanguage } from "../../src/i18n";

export default function SystemLayout() {
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
      <Stack.Screen name="health" options={{ title: t("health.title"), headerRight: () => <HelpButton screen="health" /> }} />
      <Stack.Screen name="conflict" options={{ title: t("conflict.title"), gestureEnabled: false, headerRight: () => <HelpButton screen="conflict" /> }} />
    </Stack>
  );
}
