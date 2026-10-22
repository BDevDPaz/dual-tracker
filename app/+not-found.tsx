/**
 * app/+not-found.tsx — Degradación para deep links a sessionId / packId
 * inexistentes. CTA único: volver a Hoy.
 */
import { Stack, useRouter } from "expo-router";
import { ScreenContainer, NotFoundState } from "../src/components/ui";
import { HelpButton } from "../src/components/support/HelpButton";
import { t, useLanguage } from "../src/i18n";

export default function NotFoundScreen() {
  useLanguage();
  const router = useRouter();
  return (
    <ScreenContainer>
      <Stack.Screen options={{ headerShown: false }} />
      <NotFoundState
        title={t("notFound.title")}
        description={t("notFound.body")}
        accessory={<HelpButton screen="notFound" />}
        onBack={() => router.replace("/(tabs)")}
      />
    </ScreenContainer>
  );
}
