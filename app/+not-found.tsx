/**
 * app/+not-found.tsx — Degradación para deep links a sessionId / packId
 * inexistentes. CTA único: volver a Hoy.
 */
import { Stack, useRouter } from "expo-router";
import { ScreenContainer, EmptyState, Button } from "../src/components/ui";
import { HelpButton } from "../src/components/support/HelpButton";
import { t } from "../src/i18n";

export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <ScreenContainer>
      <Stack.Screen options={{ headerShown: false }} />
      <HelpButton screen="notFound" />
      <EmptyState title={t("notFound.title")} description={t("notFound.body")} icon="compass-outline" />
      <Button label={t("notFound.goHome")} onPress={() => router.replace("/(tabs)")} />
    </ScreenContainer>
  );
}
