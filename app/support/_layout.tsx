/** support/_layout.tsx — Soporte (guías, práctica, diagnóstico). */
import { Stack } from "expo-router";
import { TOKENS } from "../../src/constants/theme";
import { HelpButton } from "../../src/components/support/HelpButton";
import { t, useLanguage } from "../../src/i18n";

export default function SupportLayout() {
  useLanguage();
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
      <Stack.Screen name="index" options={{ title: t("support.title"), headerRight: () => <HelpButton screen="support" /> }} />
      <Stack.Screen name="guide/[id]" options={{ title: t("support.guideTitle"), headerRight: () => <HelpButton screen="support" /> }} />
      <Stack.Screen name="practice" options={{ title: t("support.practice.title"), headerRight: () => <HelpButton screen="practice" /> }} />
    </Stack>
  );
}
