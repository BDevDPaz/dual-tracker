/** sites/_layout.tsx — Stack de destinos (accesible desde Hoy y Ajustes; no es un quinto tab). */
import { Stack } from "expo-router";
import { TOKENS } from "../../src/constants/theme";
import { t } from "../../src/i18n";

export default function SitesLayout() {
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
      <Stack.Screen name="index" options={{ title: t("sites.title") }} />
      <Stack.Screen name="new" options={{ title: t("sites.newSite") }} />
      <Stack.Screen name="[id]" options={{ title: t("sites.title") }} />
    </Stack>
  );
}
