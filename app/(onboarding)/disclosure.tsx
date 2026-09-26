/**
 * (onboarding)/disclosure.tsx — Descargo DualDisclosure (Producto §5.4).
 * Contenido servido por DualDisclosureService (vía queries del hook), el
 * mismo que legal/disclosure.tsx. Checkbox "He leído y acepto"; Continuar
 * deshabilitado hasta marcarlo. Intención: ACCEPT_DISCLOSURE.
 */
import { useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "../../src/components/ui";
import { DisclosureContent } from "../../src/components/legal/DisclosureContent";
import { TOKENS, FONT } from "../../src/constants/theme";
import { useWorkTracker } from "../../src/core/hooks";
import { selectNeedsOnboarding } from "../../src/core/selectors";
import { getLanguage, t } from "../../src/i18n";

export default function OnboardingDisclosureScreen() {
  const router = useRouter();
  const { state, emit, queries } = useWorkTracker();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const content = queries.disclosure(getLanguage());

  const onContinue = async () => {
    setBusy(true);
    const res = await emit({ type: "ACCEPT_DISCLOSURE", version: queries.disclosureVersion() });
    setBusy(false);
    if (!res.ok) return;
    // Política nueva con alta ya completada → de vuelta al gate; si no, sigue el wizard.
    if (selectNeedsOnboarding(state)) router.push("/(onboarding)/permissions");
    else router.replace("/");
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <DisclosureContent content={content} />
      </ScrollView>
      <View style={[styles.footer, { borderColor: TOKENS.colors.border }]}>
        <Pressable
          onPress={() => setAccepted((v) => !v)}
          style={styles.checkRow}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: accepted }}
        >
          <Ionicons name={accepted ? "checkbox" : "square-outline"} size={24} color={TOKENS.colors.primary} />
          <Text style={[styles.checkText, { color: TOKENS.colors.text.primary }]}>{t("onboarding.acceptCheckbox")}</Text>
        </Pressable>
        <Button label={t("common.continue")} disabled={!accepted} isLoading={busy} onPress={onContinue} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: TOKENS.spacing.xl },
  footer: { padding: TOKENS.spacing.xl, borderTopWidth: 1, gap: TOKENS.spacing.md },
  checkRow: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.sm },
  checkText: { ...FONT.bodyStrong },
});
