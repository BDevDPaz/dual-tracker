/**
 * Guía de una pantalla o recorrido paso a paso. El id es una clave del catálogo.
 */
import { StyleSheet, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, EmptyState, SAFE_EDGES, ScreenScroll } from "../../../src/components/ui";
import { LanguageSwitch } from "../../../src/components/support/LanguageSwitch";
import { Walkthrough } from "../../../src/components/support/Walkthrough";
import { TOKENS, FONT } from "../../../src/constants/theme";
import { t, useLanguage } from "../../../src/i18n";
import { FLOWS, SCREEN_GUIDES } from "../../../src/support/catalog";
import { isFlowId, isScreenId } from "../../../src/support/types";

export default function GuideScreen() {
  useLanguage();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const key = String(id ?? "");

  if (isFlowId(key)) {
    const flow = FLOWS[key];
    return (
      <ScreenScroll edges={SAFE_EDGES.stack}>
        <LanguageSwitch />
        <Walkthrough title={flow.title} steps={flow.steps} practiceFlow={key} />
      </ScreenScroll>
    );
  }

  if (!isScreenId(key)) {
    return (
      <ScreenScroll edges={SAFE_EDGES.stack}>
        <EmptyState title={t("support.missing")} icon="help-circle-outline" />
        <Button label={t("support.open")} onPress={() => router.replace("/support")} />
      </ScreenScroll>
    );
  }

  const guide = SCREEN_GUIDES[key];
  return (
    <ScreenScroll edges={SAFE_EDGES.stack}>
      <LanguageSwitch />
      <Text style={[styles.intro, { color: TOKENS.colors.text.secondary }]}>{t(guide.intro)}</Text>
      <Walkthrough title={guide.title} steps={guide.steps} />
      {guide.flows.length > 0 ? (
        <>
          <Text style={[styles.related, { color: TOKENS.colors.text.muted }]}>{t("support.related")}</Text>
          {guide.flows.map((flowId) => (
            <Button key={flowId} label={t(FLOWS[flowId].title)} variant="secondary" onPress={() => router.push(`/support/guide/${flowId}`)} />
          ))}
        </>
      ) : null}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  intro: { ...FONT.body },
  related: { ...FONT.label, letterSpacing: 1, marginTop: TOKENS.spacing.md },
});
