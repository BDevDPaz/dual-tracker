import React from "react";
import { View, Text, StyleSheet, ViewStyle, StyleProp } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TOKENS, FONT, ICON } from "../../constants/theme";
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
          backgroundColor: colors.surface,
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

/** Cabecera de tarjeta: icono en círculo + título + subtítulo en mayúsculas. */
export function CardHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  subtitle?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      <View style={[styles.iconCircle, { borderColor: colors.goldText, backgroundColor: colors.background }]}>
        <Ionicons name={icon} size={ICON.md} color={colors.goldText} accessibilityElementsHidden importantForAccessibility="no" />
      </View>
      <View style={styles.headerCopy}>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>{title}</Text>
        {subtitle ? <Text style={[styles.headerSub, { color: colors.text.secondary }]}>{subtitle.toUpperCase()}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: TOKENS.radius.lg,
    padding: TOKENS.layout.cardPadding,
  },
  header: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.sm, marginBottom: TOKENS.spacing.md },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: TOKENS.radius.round,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1 },
  headerTitle: { ...FONT.cardTitle },
  headerSub: { ...FONT.kicker, marginTop: TOKENS.spacing.xxs },
});
