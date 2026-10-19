/**
 * system/_layout.tsx — Stack de sistema, presentado como modal (no tab).
 * conflict.tsx desactiva el gesto de cierre mientras haya CONFLICT abiertos.
 */
import { Stack } from "expo-router";
import { stackHeaderOptions } from "../../src/components/ui/navigation";
import { HeaderActions } from "../../src/components/support/HelpButton";
import { useTheme } from "../../src/context/ThemeContext";
import { t, useLanguage } from "../../src/i18n";

export default function SystemLayout() {
  useLanguage();
  const { colors } = useTheme();
  return (
    <Stack screenOptions={stackHeaderOptions(colors)}>
      <Stack.Screen name="health" options={{ title: t("health.title"), headerRight: () => <HeaderActions screen="health" /> }} />
      <Stack.Screen name="conflict" options={{ title: t("conflict.title"), gestureEnabled: false, headerRight: () => <HeaderActions screen="conflict" /> }} />
    </Stack>
  );
}
