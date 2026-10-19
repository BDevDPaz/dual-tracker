/** legal/_layout.tsx — Stack legal de solo lectura (accesible desde onboarding y Ajustes). */
import { Stack } from "expo-router";
import { stackHeaderOptions } from "../../src/components/ui/navigation";
import { HelpButton } from "../../src/components/support/HelpButton";
import { t, useLanguage } from "../../src/i18n";

export default function LegalLayout() {
  useLanguage();
  return (
    <Stack
      screenOptions={stackHeaderOptions()}
    >
      <Stack.Screen name="disclosure" options={{ title: t("settings.disclosure"), headerRight: () => <HelpButton screen="legalDisclosure" /> }} />
      <Stack.Screen name="retention" options={{ title: t("settings.retentionPolicy"), headerRight: () => <HelpButton screen="legalRetention" /> }} />
    </Stack>
  );
}
