/** report/_layout.tsx — Stack de artefactos con header "Expediente". */
import { Stack } from "expo-router";
import { TOKENS } from "../../src/constants/theme";
import { HelpButton } from "../../src/components/support/HelpButton";
import { t, useLanguage } from "../../src/i18n";

export default function ReportLayout() {
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
      <Stack.Screen name="[periodId]" options={{ title: t("report.header"), headerRight: () => <HelpButton screen="statement" /> }} />
      <Stack.Screen name="pack/[packId]" options={{ title: t("report.packTitle"), headerRight: () => <HelpButton screen="pack" /> }} />
    </Stack>
  );
}
