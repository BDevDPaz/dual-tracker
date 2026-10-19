/**
 * (onboarding)/_layout.tsx — Wizard lineal de alta con progreso de 4 pasos.
 * No se puede saltar disclosure ni permissions: sin back gesture y cada paso
 * navega solo hacia delante.
 */
import { View, StyleSheet } from "react-native";
import { Stack, useSegments } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { TOKENS } from "../../src/constants/theme";

const STEPS = ["welcome", "disclosure", "permissions", "profile"] as const;

export default function OnboardingLayout() {
  const segments = useSegments() as string[];
  const current = Math.max(0, STEPS.findIndex((s) => segments.includes(s)));
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: TOKENS.colors.background }]} edges={["top"]}>
      <View style={styles.progress} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: STEPS.length, now: current + 1 }}>
        {STEPS.map((s, i) => (
          <View key={s} style={[styles.step, { backgroundColor: i <= current ? TOKENS.colors.primary : TOKENS.colors.border }]} />
        ))}
      </View>
      <Stack screenOptions={{ headerShown: false, gestureEnabled: false, freezeOnBlur: false, contentStyle: { backgroundColor: TOKENS.colors.background } }} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  progress: { flexDirection: "row", gap: TOKENS.spacing.xs, paddingHorizontal: TOKENS.spacing.xl, paddingTop: TOKENS.spacing.md },
  step: { flex: 1, height: 4, borderRadius: 2 },
});
