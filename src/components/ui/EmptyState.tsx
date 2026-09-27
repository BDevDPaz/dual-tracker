import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TOKENS, FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { ANIM_PRESETS } from "../../constants/animations";
import Animated from "react-native-reanimated";
import { Button } from "./Button";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  /** CTA opcional (Button secundario bajo el texto). */
  action?: { label: string; onPress: () => void };
  /** Sin el margen superior grande (dentro de una pantalla con más contenido). */
  compact?: boolean;
}

export function EmptyState({
  title,
  description,
  icon = "search-outline",
  action,
  compact = false,
}: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <Animated.View entering={ANIM_PRESETS.screenEntry} style={[styles.container, compact && styles.compact]}>
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
      {action ? (
        <Button label={action.label} variant="secondary" onPress={action.onPress} style={styles.action} testID="empty-state-action" />
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
  compact: {
    marginTop: 0,
    paddingHorizontal: 0,
  },
  action: {
    marginTop: TOKENS.spacing.lg,
    alignSelf: "stretch",
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
