import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { TOKENS, FONT } from "../../constants/theme";

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

const TONE_COLOR: Record<StatusTone, string> = {
  neutral: TOKENS.colors.text.secondary,
  info: TOKENS.colors.status.info,
  success: TOKENS.colors.status.success,
  warning: TOKENS.colors.status.warning,
  danger: TOKENS.colors.status.danger,
};

export function StatusPill({ tone, label }: StatusPillProps) {
  const color = TONE_COLOR[tone];
  const bg = tone === "neutral" ? TOKENS.colors.surface : `${color}15`;
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
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});
