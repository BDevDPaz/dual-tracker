import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer, AppBrandTitle, Card, Button } from "../../src/components/ui";
import { FONT } from "../../src/constants/theme";
import { useTheme } from "../../src/context/ThemeContext";

const TOTAL_STEPS = 4;

function OnboardingStepIndicator({ step }: { step: number }) {
  const { tokens } = useTheme();
  const styles = useMemo(() => StyleSheet.create({
    stepRow: { flexDirection: "row", gap: tokens.spacing.sm, marginBottom: tokens.spacing.xl },
    stepDot: { flex: 1, height: 4, borderRadius: tokens.radius.round },
  }), [tokens]);
  return (
    <View style={styles.stepRow}>
      {Array.from({ length: TOTAL_STEPS }).map((_, index) => (
        <View key={index} style={[styles.stepDot, { backgroundColor: index < step ? tokens.colors.primary : tokens.colors.surfaceElevated }]} />
      ))}
    </View>
  );
}

export default function WelcomeScreen() {
  const { tokens } = useTheme();
  const router = useRouter();
  const styles = useMemo(() => StyleSheet.create({
    content: { flex: 1, paddingTop: tokens.spacing.xl, paddingBottom: tokens.spacing.xl, justifyContent: "space-between" },
    brandWrap: { alignItems: "center", marginBottom: tokens.spacing.xl },
    intro: { ...FONT.body, color: tokens.colors.text.secondary, textAlign: "center", marginBottom: tokens.spacing.xl },
    columns: { gap: tokens.spacing.md, marginBottom: tokens.spacing.xl },
    columnCard: { gap: tokens.spacing.xs },
    columnIcon: { marginBottom: tokens.spacing.xs },
    columnTitle: { ...FONT.h3, color: tokens.colors.text.primary, marginBottom: tokens.spacing.xs },
    columnBody: { ...FONT.body, color: tokens.colors.text.secondary },
    scopeNote: { ...FONT.caption, color: tokens.colors.text.muted, textAlign: "center", marginBottom: tokens.spacing.xl },
    cta: { width: "100%" },
  }), [tokens]);

  return (
    <ScreenContainer>
      <View style={styles.content}>
        <OnboardingStepIndicator step={1} />
        <View style={styles.brandWrap}>
          <AppBrandTitle subtitle="V1.0.0" />
        </View>
        <Text style={styles.intro}>
          Dual Tracker cuida dos cosas a la vez: el tiempo que trabajas y el rastro que confirma dónde lo hiciste.
        </Text>
        <View style={styles.columns}>
          <Card style={styles.columnCard} variant="elevated">
            <Ionicons name="time-outline" size={28} color={tokens.colors.primary} style={styles.columnIcon} />
            <Text style={styles.columnTitle}>Tu tiempo</Text>
            <Text style={styles.columnBody}>
              Declaras cuándo empiezas y cuándo cierras. Tus horas pagables quedan registradas con hora exacta de inicio, almuerzo y cierre.
            </Text>
          </Card>
          <Card style={styles.columnCard} variant="elevated">
            <Ionicons name="navigate-outline" size={28} color={tokens.colors.primary} style={styles.columnIcon} />
            <Text style={styles.columnTitle}>Tu rastro de jornada</Text>
            <Text style={styles.columnBody}>
              Mientras tu jornada está abierta, Dual Tracker confirma que estuviste en el sitio declarado. Ese rastro certifica tus horas ante tu empleador.
            </Text>
          </Card>
        </View>
        <Text style={styles.scopeNote}>
          El rastro de ubicación solo existe mientras la jornada está abierta: nunca hay seguimiento fuera de tu horario de trabajo.
        </Text>
        <Button label="Continuar" variant="primary" size="lg" style={styles.cta} onPress={() => router.push("/(onboarding)/disclosure")} />
      </View>
    </ScreenContainer>
  );
}
