import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { TOKENS, FONT, font, type ThemeColors } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";

/**
 * StatusPill — portado de GEOTrack. Los tonos dejan de ser estados de dominio
 * ("ACTIVE_WORK" | "CLOSED") y pasan a ser tonos visuales; el mapeo
 * estado → tono vive en getSessionStateUI (selectores).
 */
export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

interface StatusPillProps {
  tone: StatusTone;
  label: string;
}

export function toneColors(colors: ThemeColors, tone: StatusTone): { color: string; bg: string } {
  switch (tone) {
    case "neutral":
      return { color: colors.text.secondary, bg: colors.surface };
    case "info":
      return { color: colors.status.info, bg: colors.statusBg.info };
    case "success":
      return { color: colors.status.success, bg: colors.statusBg.success };
    case "warning":
      return { color: colors.status.warning, bg: colors.statusBg.warning };
    case "danger":
      return { color: colors.status.danger, bg: colors.statusBg.danger };
  }
}

export function StatusPill({ tone, label }: StatusPillProps) {
  const { colors } = useTheme();
  const { color, bg } = toneColors(colors, tone);
  return (
    <View style={[styles.pill, { backgroundColor: bg }]} accessibilityRole="text">
      <Text style={[styles.text, { color }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: TOKENS.spacing.sm,
    paddingVertical: TOKENS.spacing.xs,
    borderRadius: TOKENS.radius.round,
    alignSelf: "flex-start",
  },
  text: {
    ...FONT.label,
    ...font("800"),
    letterSpacing: 0.5,
  },
});
