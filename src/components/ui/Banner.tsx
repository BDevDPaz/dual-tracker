import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TOKENS, FONT, ICON } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";

type BannerTone = "warning" | "danger" | "success" | "info";

interface BannerProps {
  tone: BannerTone;
  message: string;
  onPress?: () => void;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
}

const ICONS_BY_TONE: Record<BannerTone, React.ComponentProps<typeof Ionicons>["name"]> = {
  warning: "warning-outline",
  danger: "alert-circle-outline",
  success: "checkmark-circle-outline",
  info: "information-circle-outline",
};

/** Aviso de radio 12. El tono sale del tema, no de un color suelto. */
export function Banner({ tone, message, onPress, icon }: BannerProps) {
  const { colors } = useTheme();
  // P10: texto/icono en statusText (legible), borde en statusBorder, fondo suave en statusBg.
  // Nunca status.* vivido para texto o borde.
  const color = colors.statusText[tone];
  const borderColor = colors.statusBorder[tone];
  const backgroundColor = colors.statusBg[tone];
  const body = (
    <View style={[styles.banner, { borderColor, backgroundColor }]}>
      <Ionicons name={icon ?? ICONS_BY_TONE[tone]} size={ICON.xl} color={color} />
      <Text style={[styles.text, { color }]}>{message}</Text>
      {onPress ? <Ionicons name="chevron-forward" size={ICON.xl} color={color} /> : null}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button">
      {body}
    </Pressable>
  ) : (
    body
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: TOKENS.spacing.sm,
    borderWidth: TOKENS.layout.hairline,
    borderRadius: TOKENS.radius.md,
    padding: TOKENS.spacing.md,
    minHeight: TOKENS.layout.minTouchTarget,
  },
  text: { ...FONT.bodySmall, flex: 1 },
});
