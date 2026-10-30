import React from "react";
import { View, StyleSheet, ViewStyle, StyleProp } from "react-native";
import { useTheme } from "../../context/ThemeContext";

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  elevation?: "none" | "sm" | "md" | "lg";
  variant?: "surface" | "elevated" | "outline";
}

export function Card({ children, style, elevation = "sm", variant = "elevated" }: CardProps) {
  const { tokens } = useTheme();

  const getVariantStyle = (): ViewStyle => {
    switch (variant) {
      case "surface":
        return { backgroundColor: tokens.colors.surface, borderWidth: 0 };
      case "outline":
        return {
          backgroundColor: "transparent",
          borderWidth: 1,
          borderColor: tokens.colors.border,
        };
      case "elevated":
      default:
        return {
          backgroundColor: tokens.colors.surfaceElevated,
          borderWidth: 1,
          borderColor: tokens.colors.border,
        };
    }
  };

  const shadowStyle = tokens.shadows[elevation];

  return (
    <View
      style={[
        styles.card,
        { borderRadius: tokens.radius.lg, padding: tokens.layout.cardPadding },
        getVariantStyle(),
        shadowStyle,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {},
});
