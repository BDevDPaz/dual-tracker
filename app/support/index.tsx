/**
 * support/index.tsx — Soporte dentro de Ajustes: manual, FAQ, problemas,
 * estados, práctica, versión y diagnóstico. Todo el texto sale de t().
 */
import { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Button, Card, SAFE_EDGES, ScreenScroll, Section } from "../../src/components/ui";
import { LanguageSwitch } from "../../src/components/support/LanguageSwitch";
import { TOKENS, FONT, ICON } from "../../src/constants/theme";
import { useWorkTracker } from "../../src/core/hooks";
import { useToast } from "../../src/context/ToastContext";
import { t, useLanguage } from "../../src/i18n";
import { FAQ_IDS, FLOW_IDS, INTEGRITY_IDS, MACHINE_STATE_IDS, SCREEN_IDS, TROUBLE_IDS } from "../../src/support/catalog";
import { resetTips } from "../../src/support/tips";
import { currentVersionLine } from "../../src/support/versionLine";

export default function SupportIndexScreen() {
  useLanguage();
  const router = useRouter();
  const { emit } = useWorkTracker();
  const { showToast } = useToast();
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [openTrouble, setOpenTrouble] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const share = async () => {
    setBusy(true);
    const res = await emit({ type: "EXPORT_SUPPORT_DIAGNOSTIC" });
    setBusy(false);
    showToast(res.ok ? t("support.export.ok") : t("support.export.fail"), res.ok ? "success" : "error", undefined, (lang) => ({
      title: t(res.ok ? "support.export.ok" : "support.export.fail", {}, lang),
    }));
  };

  const onResetTips = async () => {
    await resetTips();
    showToast(t("support.tips.resetDone"), "success", undefined, (lang) => ({ title: t("support.tips.resetDone", {}, lang) }));
  };

  return (
    <ScreenScroll edges={SAFE_EDGES.stack}>
      <LanguageSwitch />
      <Text style={[styles.blurb, { color: TOKENS.colors.text.secondary }]}>{t("support.blurb")}</Text>

      <Section title={t("support.manual")}>
        {FLOW_IDS.map((id) => (
          <LinkRow key={id} label={t(`support.flows.${id}.title`)} onPress={() => router.push(`/support/guide/${id}`)} />
        ))}
      </Section>

      <Section title={t("support.screensTitle")}>
        {SCREEN_IDS.map((id) => (
          <LinkRow key={id} label={t(`support.screens.${id}.title`)} onPress={() => router.push(`/support/guide/${id}`)} />
        ))}
      </Section>

      <Section title={t("support.faqTitle")}>
        {FAQ_IDS.map((id) => (
          <Card key={id} style={styles.card}>
            <Pressable accessibilityRole="button" onPress={() => setOpenFaq((cur) => (cur === id ? null : id))}>
              <Text style={[styles.question, { color: TOKENS.colors.text.primary }]}>{t(`support.faq.${id}.q`)}</Text>
            </Pressable>
            {openFaq === id ? <Text style={[styles.answer, { color: TOKENS.colors.text.secondary }]}>{t(`support.faq.${id}.a`)}</Text> : null}
          </Card>
        ))}
      </Section>

      <Section title={t("support.troubleTitle")}>
        {TROUBLE_IDS.map((id) => (
          <Card key={id} style={styles.card}>
            <Pressable accessibilityRole="button" onPress={() => setOpenTrouble((cur) => (cur === id ? null : id))}>
              <Text style={[styles.question, { color: TOKENS.colors.text.primary }]}>{t(`support.trouble.${id}.title`)}</Text>
            </Pressable>
            {openTrouble === id ? (
              <Text style={[styles.answer, { color: TOKENS.colors.text.secondary }]}>{t(`support.trouble.${id}.body`)}</Text>
            ) : null}
          </Card>
        ))}
      </Section>

      <Section title={t("support.glossaryTitle")}>
        <Card style={styles.card}>
          {MACHINE_STATE_IDS.map((id) => (
            <View key={id} style={styles.gloss}>
              <Text style={[styles.question, { color: TOKENS.colors.text.primary }]}>{t(`states.${id}.label`)}</Text>
              <Text style={[styles.answer, { color: TOKENS.colors.text.secondary }]}>{t(`support.glossary.machine.${id}`)}</Text>
            </View>
          ))}
          {INTEGRITY_IDS.map((id) => (
            <View key={id} style={styles.gloss}>
              <Text style={[styles.question, { color: TOKENS.colors.text.primary }]}>{t(`integrity.${id}`)}</Text>
              <Text style={[styles.answer, { color: TOKENS.colors.text.secondary }]}>{t(`support.glossary.integrity.${id}`)}</Text>
            </View>
          ))}
          <Text style={[styles.answer, { color: TOKENS.colors.text.secondary }]}>{t("support.glossary.manualPatch")}</Text>
        </Card>
      </Section>

      <Button label={t("support.practice.enter")} iconName="school-outline" onPress={() => router.push("/support/practice")} />
      <Button label={t("support.tips.reset")} variant="secondary" onPress={() => void onResetTips()} />
      <Button label={t("support.export.action")} variant="secondary" isLoading={busy} onPress={() => void share()} />
      <Text style={[styles.about, { color: TOKENS.colors.text.muted }]}>
        {currentVersionLine()}
      </Text>
    </ScreenScroll>
  );
}

function LinkRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" style={styles.link}>
      <Text style={[styles.linkText, { color: TOKENS.colors.text.primary }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={ICON.md} color={TOKENS.colors.text.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  blurb: { ...FONT.body },
  card: { padding: TOKENS.spacing.md, gap: TOKENS.spacing.sm, marginBottom: TOKENS.spacing.sm },
  question: { ...FONT.bodyStrong },
  answer: { ...FONT.body },
  gloss: { gap: TOKENS.spacing.xxs, marginBottom: TOKENS.spacing.sm },
  link: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: TOKENS.spacing.sm },
  linkText: { ...FONT.body, flex: 1 },
  about: { ...FONT.caption, textAlign: "center" },
});
