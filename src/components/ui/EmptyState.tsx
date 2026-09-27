import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TOKENS, FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { ANIM_PRESETS } from "../../constants/animations";
import Animated from "react-native-reanimated";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
}

export function EmptyState({
  title,
  description,
  icon = "search-outline",
}: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <Animated.View entering={ANIM_PRESETS.screenEntry} style={styles.container}>
      <View style={styles.iconWrapper}>
        <Ionicons
          name={icon as any}
          size={48}
          color={colors.text.muted}
        />
      </View>
      <Text style={[styles.title, { color: colors.text.primary }]}>
        {title}
      </Text>
      {description ? (
        <Text
          style={[styles.description, { color: colors.text.secondary }]}
        >
          {description}
        </Text>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: TOKENS.spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    marginTop: TOKENS.spacing["4xl"],
  },
  iconWrapper: {
    marginBottom: TOKENS.spacing.lg,
    opacity: 0.5,
  },
  title: {
    ...FONT.h3,
    textAlign: "center",
  },
  description: {
    ...FONT.body,
    textAlign: "center",
    marginTop: TOKENS.spacing.xs,
  },
});
