/**
 * (onboarding)/welcome.tsx — Bienvenida (Producto §5.3).
 * Dos columnas conceptuales ("Tu tiempo" / "Tu rastro de jornada"), frase de
 * alcance y CTA Continuar. Sin skip. Sin servicios: solo navegación local.
 */
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { AppBrandTitle, Button, Card } from "../../src/components/ui";
import { TOKENS, FONT } from "../../src/constants/theme";
import { t } from "../../src/i18n";

export default function WelcomeScreen() {
  const router = useRouter();
  const columns = [
    { icon: "time-outline" as const, title: t("onboarding.colTimeTitle"), body: t("onboarding.colTimeBody") },
    { icon: "navigate-outline" as const, title: t("onboarding.colTraceTitle"), body: t("onboarding.colTraceBody") },
  ];
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <AppBrandTitle />
      <Text style={[styles.tagline, { color: TOKENS.colors.text.secondary }]}>{t("app.tagline")}</Text>
      <View style={styles.columns}>
        {columns.map((c) => (
          <Card key={c.title} style={styles.col}>
            <Ionicons name={c.icon} size={28} color={TOKENS.colors.primary} />
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
  content: { padding: TOKENS.spacing.xl, gap: TOKENS.spacing.lg, flexGrow: 1, justifyContent: "center" },
  tagline: { ...FONT.body, textAlign: "center" },
  columns: { flexDirection: "row", gap: TOKENS.spacing.md },
  col: { flex: 1, padding: TOKENS.spacing.lg, gap: TOKENS.spacing.sm },
  colTitle: { ...FONT.h3 },
  colBody: { ...FONT.caption, lineHeight: 18 },
  scope: { ...FONT.bodyStrong, textAlign: "center" },
});
