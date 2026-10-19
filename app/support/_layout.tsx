/** support/_layout.tsx — Soporte (guías, práctica, diagnóstico). */
import { Stack } from "expo-router";
import { BrandHeaderTitle } from "../../src/components/brand/BrandHeaderTitle";
import { stackHeaderOptions } from "../../src/components/ui/navigation";
import { HelpButton } from "../../src/components/support/HelpButton";
import { t, useLanguage } from "../../src/i18n";

export default function SupportLayout() {
  useLanguage();
  return (
    <Stack
      screenOptions={stackHeaderOptions()}
    >
      <Stack.Screen
        name="index"
        options={{
          title: t("support.title"),
          headerTitle: ({ children }) => <BrandHeaderTitle title={typeof children === "string" ? children : t("support.title")} />,
          headerRight: () => <HelpButton screen="support" />,
        }}
      />
      <Stack.Screen name="guide/[id]" options={{ title: t("support.guideTitle"), headerRight: () => <HelpButton screen="support" /> }} />
      <Stack.Screen name="practice" options={{ title: t("support.practice.title"), headerRight: () => <HelpButton screen="practice" /> }} />
    </Stack>
  );
}
