/** sites/_layout.tsx — Stack de destinos (accesible desde Hoy y Ajustes; no es un quinto tab). */
import { Stack } from "expo-router";
import { stackHeaderOptions } from "../../src/components/ui/navigation";
import { HelpButton } from "../../src/components/support/HelpButton";
import { t, useLanguage } from "../../src/i18n";

export default function SitesLayout() {
  useLanguage();
  return (
    <Stack
      screenOptions={stackHeaderOptions()}
    >
      <Stack.Screen name="index" options={{ title: t("sites.title"), headerRight: () => <HelpButton screen="sites" /> }} />
      <Stack.Screen name="new" options={{ title: t("sites.newSite"), headerRight: () => <HelpButton screen="siteNew" /> }} />
      <Stack.Screen name="[id]" options={{ title: t("sites.title"), headerRight: () => <HelpButton screen="siteEdit" /> }} />
    </Stack>
  );
}
