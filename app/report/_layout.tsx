/** report/_layout.tsx — Stack de artefactos con header "Expediente". */
import { Stack } from "expo-router";
import { stackHeaderOptions } from "../../src/components/ui/navigation";
import { HelpButton } from "../../src/components/support/HelpButton";
import { t, useLanguage } from "../../src/i18n";

export default function ReportLayout() {
  useLanguage();
  return (
    <Stack
      screenOptions={stackHeaderOptions()}
    >
      <Stack.Screen name="[periodId]" options={{ title: t("report.header"), headerRight: () => <HelpButton screen="statement" /> }} />
      <Stack.Screen name="pack/[packId]" options={{ title: t("report.packTitle"), headerRight: () => <HelpButton screen="pack" /> }} />
    </Stack>
  );
}
