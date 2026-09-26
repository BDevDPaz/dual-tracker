import React from "react";
import { View, StyleSheet, ViewStyle, StyleProp } from "react-native";
import { TOKENS } from "../../constants/theme";

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  elevation?: "none" | "sm" | "md" | "lg";
  variant?: "surface" | "elevated" | "outline";
}

export function Card({
  children,
  style,
  elevation = "sm",
  variant = "elevated",
}: CardProps) {
  const getVariantStyle = () => {
    switch (variant) {
      case "surface":
        return {
          backgroundColor: TOKENS.colors.surface,
          borderWidth: 0,
        };
      case "outline":
        return {
          backgroundColor: "transparent",
          borderWidth: 1,
          borderColor: TOKENS.colors.border,
        };
      case "elevated":
      default:
        return {
          backgroundColor: TOKENS.colors.surfaceElevated,
          borderWidth: 1,
          borderColor: TOKENS.colors.border,
        };
    }
  };

  const shadowStyle = TOKENS.shadows[elevation];

  return (
    <View style={[styles.card, getVariantStyle(), shadowStyle, style]}>
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
