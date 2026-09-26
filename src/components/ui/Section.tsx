import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { TOKENS, FONT } from "../../constants/theme";

interface SectionProps {
  title: string;
  children: React.ReactNode;
  style?: ViewStyle;
}

export function Section({ title, children, style }: SectionProps) {
  return (
    <View style={[styles.sectionBlock, style]}>
      <Text style={[styles.sectionTitle, { color: TOKENS.colors.text.muted }]}>
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionBlock: {
    marginTop: TOKENS.spacing.xl,
    paddingHorizontal: TOKENS.layout.screenPadding,
  },
  sectionTitle: {
    ...FONT.label,
    letterSpacing: 1.5,
    marginBottom: TOKENS.spacing.md,
  },
});
