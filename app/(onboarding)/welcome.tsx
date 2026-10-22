/**
 * (onboarding)/welcome.tsx — Bienvenida (Producto §5.3).
 * Dos columnas conceptuales ("Tu tiempo" / "Tu rastro de jornada"), frase de
 * alcance y CTA Continuar. Sin skip. Sin servicios: solo navegación local.
 */
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { AppBrandTitle, Button, Card } from "../../src/components/ui";
import { HelpButton } from "../../src/components/support/HelpButton";
import { TOKENS, FONT, ICON } from "../../src/constants/theme";
import { useResponsive } from "../../src/components/ui/responsive";
import { t, useLanguage } from "../../src/i18n";

export default function WelcomeScreen() {
  const router = useRouter();
  useLanguage();
  const { isCompact, landscape, screenPadding } = useResponsive();
  const columns = [
    { icon: "time-outline" as const, title: t("onboarding.colTimeTitle"), body: t("onboarding.colTimeBody") },
    { icon: "navigate-outline" as const, title: t("onboarding.colTraceTitle"), body: t("onboarding.colTraceBody") },
  ];
  return (
    <ScrollView contentContainerStyle={[styles.content, { padding: screenPadding }]} keyboardShouldPersistTaps="handled">
      <AppBrandTitle />
      <HelpButton screen="welcome" />
      <Text style={[styles.tagline, { color: TOKENS.colors.text.secondary }]}>{t("app.tagline")}</Text>
      <View style={[styles.columns, isCompact && !landscape && styles.columnsStack]}>
        {columns.map((c) => (
          <Card key={c.icon} style={styles.col}>
            <Ionicons name={c.icon} size={ICON.xxl} color={TOKENS.colors.primary} accessibilityElementsHidden importantForAccessibility="no" />
            <Text style={[styles.colTitle, { color: TOKENS.colors.text.primary }]}>{c.title}</Text>
            <Text style={[styles.colBody, { color: TOKENS.colors.text.secondary }]}>{c.body}</Text>
          </Card>
        ))}
      </View>
      <Text style={[styles.scope, { color: TOKENS.colors.primary }]}>{t("onboarding.scope")}</Text>
      <Button label={t("common.continue")} onPress={() => router.push("/(onboarding)/disclosure")} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: TOKENS.spacing.lg, flexGrow: 1, justifyContent: "center" },
  tagline: { ...FONT.body, textAlign: "center" },
  columns: { flexDirection: "row", gap: TOKENS.spacing.md },
  columnsStack: { flexDirection: "column" },
  col: { flex: 1, padding: TOKENS.spacing.lg, gap: TOKENS.spacing.sm },
  colTitle: { ...FONT.h3 },
  colBody: { ...FONT.caption },
  scope: { ...FONT.bodyStrong, textAlign: "center" },
});
