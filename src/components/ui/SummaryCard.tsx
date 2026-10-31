import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { TOKENS, FONT, ICON } from "../../constants/theme";
import { DURATIONS } from "../../constants/animations";
import { useTheme } from "../../context/ThemeContext";
import { useMotionPreference, REDUCED_FADE_MS } from "./motion";

interface SummaryCardProps {
  hoursLabel: string;
  hours: string;
  moneyLabel: string;
  money: string;
  /** true solo fuera de un contenedor que ya tiene el margen de pantalla. */
  inset?: boolean;
}

/** Horas y dinero de un periodo. El dinero va en oro; el tiempo, en tinta. */
export function SummaryCard({ hoursLabel, hours, moneyLabel, money, inset = false }: SummaryCardProps) {
  const { colors } = useTheme();
  const reduceMotion = useMotionPreference();
  return (
    <Animated.View
      entering={reduceMotion ? FadeIn.duration(REDUCED_FADE_MS) : FadeInDown.duration(DURATIONS.transition)}
      style={[
        styles.block,
        inset && styles.inset,
        { backgroundColor: colors.surface, borderColor: colors.border, ...TOKENS.shadows.sm },
      ]}
    >
      <View style={styles.metricZone}>
        <View style={styles.metricHeader}>
          <Ionicons name="time-outline" size={ICON.xl} color={colors.text.secondary} />
          <Text style={[styles.metricLabel, { color: colors.text.secondary }]}>{hoursLabel}</Text>
        </View>
        <Text style={[styles.metricValue, { color: colors.text.primary }]}>{hours}</Text>
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <View style={styles.metricZone}>
        <View style={styles.metricHeader}>
          <Ionicons name="cash-outline" size={ICON.xl} color={colors.goldText} />
          <Text style={[styles.metricLabel, { color: colors.text.secondary }]}>{moneyLabel}</Text>
        </View>
        <Text style={[styles.metricValue, { color: colors.goldText }]}>{money}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  inset: { marginHorizontal: TOKENS.layout.screenPadding },
  block: {
    flexDirection: "row",
    marginHorizontal: 0,
    padding: TOKENS.spacing.lg,
    borderRadius: TOKENS.radius.lg,
    alignItems: "center",
    borderWidth: TOKENS.layout.hairline,
  },
  metricZone: { flex: 1, alignItems: "center" },
  metricHeader: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.sm, marginBottom: TOKENS.spacing.xs },
  metricLabel: { ...FONT.label },
  metricValue: { ...FONT.metric },
  divider: { width: TOKENS.layout.hairline, height: TOKENS.layout.metricRule },
});
