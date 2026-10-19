import React from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { TOKENS, FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { haptics, useMotionPreference } from "./motion";

interface SelectableCardProps {
  label: string;
  description?: string;
  selected?: boolean;
  onPress?: () => void;
  /** radio en un grupo; button cuando la tarjeta dispara la acción. */
  role?: "radio" | "button";
  accessibilityLabel?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Sin pulsar: fila informativa, sin háptico. */
  interactive?: boolean;
}

/** Tarjeta elegible dentro de una hoja. El borde oro marca la selección. */
export function SelectableCard({
  label,
  description,
  selected = false,
  onPress,
  role = "radio",
  accessibilityLabel,
  disabled = false,
  style,
  interactive = true,
}: SelectableCardProps) {
  const { colors } = useTheme();
  const reduceMotion = useMotionPreference();
  const palette = {
    backgroundColor: selected ? colors.statusBg.primary : colors.surface,
    borderColor: selected ? colors.primary : colors.border,
  };
  const body = (
    <>
      <Text style={[styles.label, { color: selected ? colors.primary : colors.text.primary }]}>{label}</Text>
      {description ? <Text style={[styles.description, { color: colors.text.secondary }]}>{description}</Text> : null}
    </>
  );
  if (!interactive) {
    return <View style={[styles.card, palette, style]}>{body}</View>;
  }
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        haptics.impact(Haptics.ImpactFeedbackStyle.Light, reduceMotion);
        onPress?.();
      }}
      disabled={disabled}
      accessibilityRole={role}
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.card, palette, disabled && styles.disabled, style]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: TOKENS.layout.hairline,
    borderRadius: TOKENS.radius.lg,
    padding: TOKENS.spacing.md,
    minHeight: TOKENS.layout.minTouchTarget,
    justifyContent: "center",
    gap: TOKENS.spacing.xxs,
  },
  label: { ...FONT.bodyStrong },
  description: { ...FONT.caption },
  disabled: { opacity: 0.5 },
});
