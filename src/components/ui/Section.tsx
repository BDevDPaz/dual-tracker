import React, { useMemo } from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";

interface SectionProps {
  title: string;
  children: React.ReactNode;
  style?: ViewStyle;
}

export function Section({ title, children, style }: SectionProps) {
  const { tokens } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        sectionBlock: {
          marginTop: tokens.spacing.xl,
          paddingHorizontal: tokens.layout.screenPadding,
        },
        sectionTitle: { ...FONT.label, letterSpacing: 1.5, marginBottom: tokens.spacing.md },
      }),
    [tokens],
  );

  return (
    <View style={[styles.sectionBlock, style]}>
      <Text style={[styles.sectionTitle, { color: tokens.colors.text.muted }]}>
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}
