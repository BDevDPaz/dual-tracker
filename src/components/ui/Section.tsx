import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { TOKENS, FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";

interface SectionProps {
  title: string;
  children: React.ReactNode;
  style?: ViewStyle;
  /**
   * El margen lateral es de la PANTALLA (ScreenContainer o el contentContainer
   * del ScrollView). true solo si se usa fuera de un contenedor con padding.
   */
  inset?: boolean;
}

export function Section({ title, children, style, inset = false }: SectionProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.sectionBlock, inset && styles.inset, style]}>
      <Text style={[styles.sectionTitle, { color: colors.text.muted }]}>
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  inset: { paddingHorizontal: TOKENS.layout.screenPadding },
  sectionBlock: {
    marginTop: TOKENS.spacing.zero,
    paddingHorizontal: 0,
  },
  sectionTitle: {
    ...FONT.label,
    letterSpacing: 1.5,
    marginBottom: TOKENS.spacing.md,
  },
});
