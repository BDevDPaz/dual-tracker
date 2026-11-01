/**
 * (onboarding)/_layout.tsx — Wizard lineal: bienvenida, aviso, permisos,
 * perfil y listo. Los tres subpasos de permisos viven en un solo route.
 * Sin gesto atrás: cada paso navega hacia delante.
 */
import { View, Text, StyleSheet } from "react-native";
import { Stack, useSegments } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { FONT, TOKENS } from "../../src/constants/theme";
import { useTheme } from "../../src/context/ThemeContext";
import { useResponsive } from "../../src/components/ui/responsive";
import { t, useLanguage } from "../../src/i18n";

const STEPS = ["welcome", "disclosure", "permissions", "profile", "ready"] as const;

export default function OnboardingLayout() {
  useLanguage();
  const { colors } = useTheme();
  const segments = useSegments() as string[];
  const current = Math.max(0, STEPS.findIndex((s) => segments.includes(s)));
  const { screenPadding } = useResponsive();
  const progress = t("onboarding.stepProgress", { n: current + 1, total: STEPS.length });
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={["top", "bottom", "left", "right"]}>
      <View
        style={[styles.progress, { paddingHorizontal: screenPadding }]}
        accessibilityRole="progressbar"
        accessibilityLabel={progress}
        accessibilityValue={{ min: 1, max: STEPS.length, now: current + 1, text: progress }}
      >
        <Text accessibilityElementsHidden importantForAccessibility="no" style={[styles.progressLabel, { color: colors.text.secondary }]}>
          {progress}
        </Text>
        <View style={styles.progressBars}>
          {STEPS.map((s, i) => (
            <View key={s} style={[styles.step, { backgroundColor: i <= current ? colors.primary : colors.border }]} />
          ))}
        </View>
      </View>
      <Stack screenOptions={{ headerShown: false, gestureEnabled: false, freezeOnBlur: false, contentStyle: { backgroundColor: colors.background } }} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  progress: { paddingTop: TOKENS.spacing.md, gap: TOKENS.spacing.xs },
  progressLabel: { ...FONT.caption },
  progressBars: { flexDirection: "row", gap: TOKENS.spacing.xs },
  step: { flex: 1, height: TOKENS.spacing.xs, borderRadius: TOKENS.radius.hairline },
});
