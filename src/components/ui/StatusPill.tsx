import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { TOKENS, FONT, ICON, font, type ThemeColors } from "../../constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../context/ThemeContext";
import { ICONS } from "../../constants/icons";
import { ArrivalMark } from "../brand/ArrivalMark";

/**
 * StatusPill — portado de GEOTrack. Los tonos dejan de ser estados de dominio
 * ("ACTIVE_WORK" | "CLOSED") y pasan a ser tonos visuales; el mapeo
 * estado → tono vive en getSessionStateUI (selectores).
 * Es una etiqueta secundaria, no el título principal. El título principal
 * del estado vive en OperationalHeroCard con FONT.hero.
 */
export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

interface StatusPillProps {
  tone: StatusTone;
  label: string;
  /** Concepto D en lugar del glifo genérico: En sitio / llegada confirmada. */
  symbol?: "arrival";
  /** Punto dorado antes del glifo, para acento de estado. Por defecto false. */
  goldAccent?: boolean;
}

export function toneColors(colors: ThemeColors, tone: StatusTone): { color: string; bg: string } {
  switch (tone) {
    case "neutral":
      return { color: colors.text.secondary, bg: colors.surface };
    case "info":
      return { color: colors.statusText.info, bg: colors.statusBg.info };
    case "success":
      return { color: colors.statusText.success, bg: colors.statusBg.success };
    case "warning":
      return { color: colors.statusText.warning, bg: colors.statusBg.warning };
    case "danger":
      return { color: colors.statusText.danger, bg: colors.statusBg.danger };
  }
}

/** Glifo inicial por tono: el estado no depende solo del color. */
export const PILL_GLYPH: Record<StatusTone, React.ComponentProps<typeof Ionicons>["name"]> = {
  neutral: ICONS.status.idle,
  info: ICONS.status.info,
  success: ICONS.status.success,
  warning: ICONS.status.warning,
  danger: ICONS.status.error,
};

export function StatusPill({ tone, label, symbol, goldAccent = false }: StatusPillProps) {
  const { colors } = useTheme();
  const { color, bg } = toneColors(colors, tone);
  const borderColor =
    tone === "danger"
      ? colors.statusBorderStrong.danger
      : tone === "neutral"
        ? colors.border
        : colors.statusBorder[tone as "info" | "success" | "warning" | "danger"];
  return (
    <View style={[styles.pill, { backgroundColor: bg, borderColor }]} accessibilityRole="text" accessibilityLabel={label}>
      {goldAccent ? <View style={[styles.goldDot, { backgroundColor: colors.goldAccent }]} /> : null}
      {symbol === "arrival" ? (
        <ArrivalMark size={ICON.lg} decorative />
      ) : (
        <Ionicons name={PILL_GLYPH[tone]} size={ICON.xs} color={color} testID={`status-pill-glyph-${tone}`} />
      )}
      <Text style={[styles.text, { color }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: TOKENS.spacing.sm,
    paddingVertical: TOKENS.spacing.xs,
    borderRadius: TOKENS.radius.badge,
    borderWidth: TOKENS.layout.hairline,
    minHeight: 22,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: TOKENS.spacing.sm,
  },
  goldDot: {
    width: TOKENS.accent.dot,
    height: TOKENS.accent.dot,
    borderRadius: TOKENS.accent.dot / 2,
  },
  text: {
    ...FONT.badge,
    ...font("600"),
  },
});
