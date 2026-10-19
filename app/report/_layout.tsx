/** report/_layout.tsx — Stack de artefactos con header "Expediente". */
import { Stack } from "expo-router";
import { stackHeaderOptions } from "../../src/components/ui/navigation";
import { HeaderActions } from "../../src/components/support/HelpButton";
import { useTheme } from "../../src/context/ThemeContext";
import { t, useLanguage } from "../../src/i18n";

export default function ReportLayout() {
  useLanguage();
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={stackHeaderOptions(colors)}
    >
      <Stack.Screen name="[periodId]" options={{ title: t("report.header"), headerRight: () => <HeaderActions screen="statement" /> }} />
      <Stack.Screen name="pack/[packId]" options={{ title: t("report.packTitle"), headerRight: () => <HeaderActions screen="pack" /> }} />
    </Stack>
  );
}
