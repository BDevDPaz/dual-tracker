import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { ANIM_PRESETS } from "../../constants/animations";
import Animated from "react-native-reanimated";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
}

export function EmptyState({ title, description, icon = "search-outline" }: EmptyStateProps) {
  const { tokens } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          padding: tokens.spacing.xl,
          alignItems: "center",
          justifyContent: "center",
          marginTop: tokens.spacing["4xl"],
        },
        iconWrapper: { marginBottom: tokens.spacing.lg, opacity: 0.5 },
        title: { ...FONT.h3, textAlign: "center" },
        description: { ...FONT.body, textAlign: "center", marginTop: tokens.spacing.xs },
      }),
    [tokens],
  );

  return (
    <Animated.View entering={ANIM_PRESETS.screenEntry} style={styles.container}>
      <View style={styles.iconWrapper}>
        <Ionicons name={icon as any} size={48} color={tokens.colors.text.muted} />
      </View>
      <Text style={[styles.title, { color: tokens.colors.text.primary }]}>{title}</Text>
      {description ? (
        <Text style={[styles.description, { color: tokens.colors.text.secondary }]}>
          {description}
        </Text>
      ) : null}
    </Animated.View>
  );
}
