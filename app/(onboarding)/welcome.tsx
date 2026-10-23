/**
 * (onboarding)/welcome.tsx — Bienvenida (Producto §5.3).
 * Dos columnas conceptuales ("Tu tiempo" / "Tu rastro de jornada"), frase de
 * alcance y CTA Continuar. Sin skip. Sin servicios: solo navegación local.
 */
import { View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { AppBrandTitle, Button, Card, CardHeader, SAFE_EDGES, ScreenScroll } from "../../src/components/ui";
import { HelpButton } from "../../src/components/support/HelpButton";
import { LanguageSwitch } from "../../src/components/support/LanguageSwitch";
import { TOKENS, FONT } from "../../src/constants/theme";
import { useTheme } from "../../src/context/ThemeContext";
import { useResponsive } from "../../src/components/ui/responsive";
import { t, useLanguage } from "../../src/i18n";

export default function WelcomeScreen() {
  const router = useRouter();
  useLanguage();
  const { colors } = useTheme();
  const { isCompact, landscape } = useResponsive();
  const columns = [
    { icon: "time-outline" as const, title: t("onboarding.colTimeTitle"), body: t("onboarding.colTimeBody"), subtitle: t("tabs.today") },
    { icon: "navigate-outline" as const, title: t("onboarding.colTraceTitle"), body: t("onboarding.colTraceBody"), subtitle: t("session.timeline") },
  ];
  return (
    <ScreenScroll
      edges={SAFE_EDGES.none}
      footer={<Button label={t("common.continue")} onPress={() => router.push("/(onboarding)/disclosure")} />}
    >
      <View style={styles.titleRow}>
        <AppBrandTitle />
        <HelpButton screen="welcome" />
      </View>
      <LanguageSwitch />
      <Text style={[styles.tagline, { color: colors.text.secondary }]}>{t("app.tagline")}</Text>
      <View style={[styles.columns, isCompact && !landscape && styles.columnsStack]}>
        {columns.map((c) => (
          <Card key={c.icon} style={styles.col}>
            <CardHeader icon={c.icon} title={c.title} subtitle={c.subtitle} />
            <Text style={[styles.colBody, { color: colors.text.secondary }]}>{c.body}</Text>
          </Card>
        ))}
      </View>
      <Text style={[styles.scope, { color: colors.primary }]}>{t("onboarding.scope")}</Text>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: TOKENS.spacing.sm },
  tagline: { ...FONT.body, textAlign: "center" },
  columns: { flexDirection: "row", gap: TOKENS.spacing.md },
  columnsStack: { flexDirection: "column" },
  col: { flex: 1, padding: TOKENS.spacing.lg, gap: TOKENS.spacing.sm },
  colBody: { ...FONT.caption },
  scope: { ...FONT.bodyStrong, textAlign: "center" },
});
