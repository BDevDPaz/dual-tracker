import React, { useMemo } from "react";
import { View, Text, StyleSheet, ViewStyle, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { ICONS } from "../../constants/icons";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: {
    icon: React.ComponentProps<typeof Ionicons>["name"];
    onPress: () => void;
    accessibilityLabel: string;
  };
  style?: ViewStyle;
}

export function PageHeader({
  title,
  subtitle,
  showBack = false,
  onBack,
  rightAction,
  style,
}: PageHeaderProps) {
  const router = useRouter();
  const { tokens } = useTheme();

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onBack) onBack();
    else router.back();
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        header: {
          paddingHorizontal: tokens.layout.screenPadding,
          paddingTop: tokens.spacing.xl,
          paddingBottom: tokens.spacing.md,
        },
        topRow: { flexDirection: "row", alignItems: "center", gap: tokens.spacing.md },
        backButton: { marginLeft: -tokens.spacing.xs },
        titleContainer: { flex: 1 },
        headerTitle: { ...FONT.h1 },
        headerSubtitle: { ...FONT.caption, marginTop: tokens.spacing.xs },
        rightAction: { marginRight: -tokens.spacing.xs },
      }),
    [tokens],
  );

  return (
    <View style={[styles.header, style]}>
      <View style={styles.topRow}>
        {showBack && (
          <Pressable
            onPress={handleBack}
            style={styles.backButton}
            hitSlop={12}
            accessibilityLabel="Volver"
            accessibilityRole="button"
          >
            <Ionicons
              name={ICONS.actions.back as any}
              size={28}
              color={tokens.colors.text.primary}
            />
          </Pressable>
        )}
        <View style={styles.titleContainer}>
          <Text style={[styles.headerTitle, { color: tokens.colors.text.primary }]}>{title}</Text>
        </View>
        {rightAction && (
          <Pressable
            onPress={rightAction.onPress}
            style={styles.rightAction}
            hitSlop={12}
            accessibilityLabel={rightAction.accessibilityLabel}
            accessibilityRole="button"
          >
            <Ionicons name={rightAction.icon as any} size={24} color={tokens.colors.text.primary} />
          </Pressable>
        )}
      </View>
      {subtitle ? (
        <Text style={[styles.headerSubtitle, { color: tokens.colors.text.secondary }]}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
