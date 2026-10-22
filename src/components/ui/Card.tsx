import React from "react";
import { View, StyleSheet, ViewStyle, StyleProp } from "react-native";
import { TOKENS } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  elevation?: "none" | "sm" | "md" | "lg";
  variant?: "surface" | "elevated" | "outline";
  testID?: string;
}

export function Card({
  children,
  style,
  elevation = "sm",
  variant = "elevated",
  testID,
}: CardProps) {
  const { colors } = useTheme();
  const getVariantStyle = () => {
    switch (variant) {
      case "surface":
        return {
          backgroundColor: colors.surface,
          borderWidth: 0,
        };
      case "outline":
        return {
          backgroundColor: "transparent",
          borderWidth: TOKENS.layout.hairline,
          borderColor: colors.border,
        };
      case "elevated":
      default:
        return {
          backgroundColor: colors.surfaceElevated,
          borderWidth: TOKENS.layout.hairline,
          borderColor: colors.border,
        };
    }
  };

  const shadowStyle = TOKENS.shadows[elevation];

  return (
    <View testID={testID} style={[styles.card, getVariantStyle(), shadowStyle, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: TOKENS.radius.lg,
    padding: TOKENS.layout.cardPadding,
  },
});
