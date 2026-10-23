import React from "react";
import { Pressable, Text, StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import { FONT, TOKENS } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { haptics, useMotionPreference } from "./motion";

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  testID?: string;
  accessibilityLabel?: string;
}

/** Pastilla de opción o etiqueta. Mínimo 48 dp; el texto largo hace salto, no se recorta. */
export function Chip({ label, selected = false, onPress, testID, accessibilityLabel }: ChipProps) {
  const { colors } = useTheme();
  const reduceMotion = useMotionPreference();
  const palette = {
    borderColor: selected ? colors.primary : colors.border,
    backgroundColor: selected ? colors.statusBg.primary : "transparent",
  };
  const text = <Text style={[styles.label, { color: selected ? colors.primary : colors.text.secondary }]}>{label}</Text>;
  if (!onPress) {
    return (
      <View accessible accessibilityRole="text" accessibilityLabel={accessibilityLabel ?? label} testID={testID} style={styles.staticChip}>
        <Text style={[styles.label, { color: colors.text.secondary }]}>{label}</Text>
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        haptics.impact(Haptics.ImpactFeedbackStyle.Light, reduceMotion);
        onPress?.();
      }}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.chip, palette]}
    >
      {text}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: TOKENS.layout.minTouchTarget,
    minWidth: TOKENS.layout.minTouchTarget,
    paddingVertical: TOKENS.spacing.sm,
    paddingHorizontal: TOKENS.spacing.md,
    borderRadius: TOKENS.radius.sm,
    borderWidth: TOKENS.layout.hairline,
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
    flexShrink: 1,
  },
  label: { ...FONT.caption, textAlign: "center" },
  /** Etiqueta: sin borde ni alto de botón, para que no parezca pulsable. */
  staticChip: {
    paddingVertical: TOKENS.spacing.xxs,
    paddingHorizontal: TOKENS.spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
});
