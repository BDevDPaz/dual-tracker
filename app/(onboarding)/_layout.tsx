/**
 * (onboarding)/_layout.tsx — Wizard lineal de alta con progreso de 4 pasos.
 * No se puede saltar disclosure ni permissions: sin back gesture y cada paso
 * navega solo hacia delante.
 */
import { View, Text, StyleSheet } from "react-native";
import { Stack, useSegments } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { FONT, TOKENS } from "../../src/constants/theme";
import { useResponsive } from "../../src/components/ui/responsive";
import { t, useLanguage } from "../../src/i18n";

const STEPS = ["welcome", "disclosure", "permissions", "profile"] as const;

export default function OnboardingLayout() {
  useLanguage();
  const segments = useSegments() as string[];
  const current = Math.max(0, STEPS.findIndex((s) => segments.includes(s)));
  const { screenPadding } = useResponsive();
  const progress = t("onboarding.stepProgress", { n: current + 1, total: STEPS.length });
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: TOKENS.colors.background }]} edges={["top", "bottom", "left", "right"]}>
      <View
        style={[styles.progress, { paddingHorizontal: screenPadding }]}
        accessibilityRole="progressbar"
        accessibilityLabel={progress}
        accessibilityValue={{ min: 1, max: STEPS.length, now: current + 1, text: progress }}
      >
        <Text accessibilityElementsHidden importantForAccessibility="no" style={[styles.progressLabel, { color: TOKENS.colors.text.secondary }]}>
          {progress}
        </Text>
        <View style={styles.progressBars}>
          {STEPS.map((s, i) => (
            <View key={s} style={[styles.step, { backgroundColor: i <= current ? TOKENS.colors.primary : TOKENS.colors.border }]} />
          ))}
        </View>
      </View>
      <Stack screenOptions={{ headerShown: false, gestureEnabled: false, freezeOnBlur: false, contentStyle: { backgroundColor: TOKENS.colors.background } }} />
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
