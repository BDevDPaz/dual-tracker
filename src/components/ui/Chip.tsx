import React from "react";
import { Pressable, Text, StyleSheet, View } from "react-native";
import { FONT, TOKENS } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";

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
  const palette = {
    borderColor: selected ? colors.primary : colors.border,
    backgroundColor: selected ? colors.statusBg.primary : "transparent",
  };
  const text = <Text style={[styles.label, { color: selected ? colors.primary : colors.text.secondary }]}>{label}</Text>;
  if (!onPress) {
    return (
      <View testID={testID} style={[styles.chip, palette]}>
        {text}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
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
    borderRadius: TOKENS.radius.round,
    borderWidth: TOKENS.layout.hairline,
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
    flexShrink: 1,
  },
  label: { ...FONT.caption, textAlign: "center" },
});
