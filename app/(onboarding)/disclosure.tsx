/**
 * (onboarding)/disclosure.tsx — Aviso de ubicación laboral.
 * B2: tres bloques cortos (`summary` de legal.ts, misma versión) y «Leer aviso
 * completo», que abre el aviso completo de solo lectura (legal/disclosure.tsx,
 * sin ruta nueva). «No acepto» no cierra el camino: se vuelve al aviso o a la
 * bienvenida.
 * TODO(legal): el texto de B2 está pendiente de revisión por la asesoría legal.
 * H-15: con la versión vigente ya aceptada, la casilla sale marcada y
 * Continuar no vuelve a emitir ACCEPT_DISCLOSURE (no reescribe la fecha).
 * H-1: dentro del alta, Continuar guarda el progreso (SAVE_ONBOARDING_PROGRESS).
 */
import { useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Button, ModalShell } from "../../src/components/ui";
import { HelpButton } from "../../src/components/support/HelpButton";
import { TOKENS, FONT, ICON } from "../../src/constants/theme";
import { useTheme } from "../../src/context/ThemeContext";
import { useResponsive } from "../../src/components/ui/responsive";
import { useBusyAction, useWorkTracker } from "../../src/core/hooks";
import { selectNeedsDisclaimer, selectNeedsOnboarding } from "../../src/core/selectors";
import { getLanguage, t } from "../../src/i18n";

export default function OnboardingDisclosureScreen() {
  const router = useRouter();
  const { state, emit, queries } = useWorkTracker();
  const alreadyAccepted = !selectNeedsDisclaimer(state);
  const [accepted, setAccepted] = useState(alreadyAccepted);
  const [declined, setDeclined] = useState(false);
  const { colors } = useTheme();
  const { busy, run } = useBusyAction();
  const content = queries.disclosure(getLanguage());
  const { screenPadding } = useResponsive();

  const onContinue = () =>
    run(async () => {
      if (!alreadyAccepted) {
        const res = await emit({ type: "ACCEPT_DISCLOSURE", version: queries.disclosureVersion() });
        if (!res.ok) return res;
      }
      if (!selectNeedsOnboarding(state)) {
        router.replace("/");
        return { ok: true as const };
      }
      const progress = await emit({ type: "SAVE_ONBOARDING_PROGRESS", step: "permissions" });
      if (!progress.ok) return progress;
      router.push("/(onboarding)/permissions");
      return progress;
    });

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, { padding: screenPadding }]} keyboardShouldPersistTaps="handled">
        <View style={styles.titleRow}>
          <Text style={[styles.title, styles.titleFlex, { color: colors.text.primary }]}>{t("onboarding.avisoTitle")}</Text>
          <HelpButton screen="onboardingDisclosure" />
        </View>
        {content.summary.map((block) => (
          <View key={block.key} style={[styles.block, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[styles.blockTitle, { color: colors.primary }]}>{block.title}</Text>
            <Text style={[styles.body, { color: colors.text.secondary }]}>{block.body}</Text>
          </View>
        ))}
        <Button label={t("onboarding.avisoReadFull")} variant="ghost" disabled={busy} onPress={() => router.push("/legal/disclosure")} testID="disclosure-read-full" />
        <Text style={[styles.version, { color: colors.text.muted }]}>v{content.version}</Text>
      </ScrollView>
      <View style={[styles.footer, { borderColor: colors.border, padding: screenPadding }]}>
        <Pressable
          onPress={() => setAccepted((value) => !value)}
          style={styles.checkRow}
          accessibilityRole="checkbox"
          accessibilityLabel={t("onboarding.acceptCheckbox")}
          accessibilityState={{ checked: accepted }}
        >
          <Ionicons name={accepted ? "checkbox" : "square-outline"} size={ICON.xl} color={colors.primary} />
          <Text style={[styles.checkText, { color: colors.text.primary }]}>{t("onboarding.acceptCheckbox")}</Text>
        </Pressable>
        <Button label={t("common.continue")} disabled={!accepted} isLoading={busy} onPress={onContinue} />
        <Button label={t("onboarding.decline")} variant="ghost" disabled={busy} onPress={() => setDeclined(true)} />
      </View>
      {declined ? (
        <ModalShell
          visible
          title={t("onboarding.declineTitle")}
          description={t("onboarding.declineBody")}
          onClose={() => setDeclined(false)}
          showCloseButton={false}
          testID="disclosure-decline-sheet"
          secondaryAction={{ label: t("onboarding.declineBack"), onPress: () => setDeclined(false) }}
          primaryAction={{ label: t("onboarding.declineExit"), onPress: () => router.replace("/(onboarding)/welcome") }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.sm },
  title: { ...FONT.h2, marginBottom: TOKENS.spacing.lg },
  titleFlex: { flex: 1 },
  block: { borderWidth: TOKENS.layout.hairline, borderRadius: TOKENS.radius.md, padding: TOKENS.spacing.lg, marginBottom: TOKENS.spacing.md, gap: TOKENS.spacing.xs },
  blockTitle: { ...FONT.label },
  body: { ...FONT.bodySmall },
  version: { ...FONT.caption, textAlign: "right", marginTop: TOKENS.spacing.sm },
  footer: { borderTopWidth: TOKENS.layout.hairline, gap: TOKENS.spacing.md },
  checkRow: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.sm, minHeight: TOKENS.layout.minTouchTarget },
  checkText: { ...FONT.bodyStrong },
});
