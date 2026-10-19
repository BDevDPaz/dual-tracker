/** legal/_layout.tsx — Stack legal de solo lectura (accesible desde onboarding y Ajustes). */
import { Stack } from "expo-router";
import { TOKENS } from "../../src/constants/theme";
import { HelpButton } from "../../src/components/support/HelpButton";
import { t, useLanguage } from "../../src/i18n";

export default function LegalLayout() {
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
      <Stack.Screen name="disclosure" options={{ title: t("settings.disclosure"), headerRight: () => <HelpButton screen="legalDisclosure" /> }} />
      <Stack.Screen name="retention" options={{ title: t("settings.retentionPolicy"), headerRight: () => <HelpButton screen="legalRetention" /> }} />
    </Stack>
  );
}
