/** legal/_layout.tsx — Stack legal de solo lectura (accesible desde onboarding y Ajustes). */
import { Stack } from "expo-router";
import { TOKENS } from "../../src/constants/theme";
import { t } from "../../src/i18n";

export default function LegalLayout() {
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
      <Stack.Screen name="disclosure" options={{ title: t("settings.disclosure") }} />
      <Stack.Screen name="retention" options={{ title: t("settings.retentionPolicy") }} />
    </Stack>
  );
}
