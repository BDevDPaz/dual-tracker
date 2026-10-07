/** report/_layout.tsx — Stack de artefactos con header "Expediente". */
import { Stack } from "expo-router";
import { TOKENS } from "../../src/constants/theme";
import { t, useLanguage } from "../../src/i18n";

export default function ReportLayout() {
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
      <Stack.Screen name="[periodId]" options={{ title: t("report.header") }} />
      <Stack.Screen name="pack/[packId]" options={{ title: t("report.packTitle") }} />
    </Stack>
  );
}
