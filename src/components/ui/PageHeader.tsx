import React from "react";
import { View, Text, StyleSheet, ViewStyle, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { haptics, useMotionPreference } from "./motion";
import { TOKENS, FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { ICONS } from "../../constants/icons";
import { t } from "../../i18n";

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
  /** Etiqueta accesible del botón atrás (por defecto t("a11y.back")). */
  backLabel?: string;
  /**
   * El margen lateral es de la PANTALLA (ScreenContainer o el contentContainer
   * del ScrollView). true solo si se usa fuera de un contenedor con padding.
   */
  inset?: boolean;
}

export function PageHeader({
  title,
  subtitle,
  showBack = false,
  onBack,
  rightAction,
  style,
  inset = false,
  backLabel,
}: PageHeaderProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const reduceMotion = useMotionPreference();

  const handleBack = () => {
    // Protegido: sin hápticos en web ni con movimiento reducido.
    haptics.impact(Haptics.ImpactFeedbackStyle.Light, reduceMotion);
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  return (
    <View style={[styles.header, inset && styles.inset, style]}>
      <View style={styles.topRow}>
        {showBack && (
          <Pressable
            onPress={handleBack}
            style={styles.backButton}
            hitSlop={12}
            accessibilityLabel={backLabel ?? t("a11y.back")}
            accessibilityRole="button"
          >
            <Ionicons
              name={ICONS.actions.back as any}
              size={28}
              color={colors.text.primary}
            />
          </Pressable>
        )}

        <View style={styles.titleContainer}>
          <Text
            style={[styles.headerTitle, { color: colors.text.primary }]}
          >
            {title}
          </Text>
        </View>

        {rightAction && (
          <Pressable
            onPress={rightAction.onPress}
            style={styles.rightAction}
            hitSlop={12}
            accessibilityLabel={rightAction.accessibilityLabel}
            accessibilityRole="button"
          >
            <Ionicons
              name={rightAction.icon as any}
              size={24}
              color={colors.text.primary}
            />
          </Pressable>
        )}
      </View>

      {subtitle ? (
        <Text
          style={[
            styles.headerSubtitle,
            { color: colors.text.secondary },
          ]}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  inset: { paddingHorizontal: TOKENS.layout.screenPadding },
  header: {
    paddingHorizontal: 0,
    paddingTop: TOKENS.spacing.xl,
    paddingBottom: TOKENS.spacing.md,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: TOKENS.spacing.md,
  },
  backButton: {
    marginLeft: -TOKENS.spacing.xs,
  },
  titleContainer: {
    flex: 1,
  },
  headerTitle: {
    ...FONT.h1,
  },
  headerSubtitle: {
    ...FONT.caption,
    marginTop: TOKENS.spacing.xs,
  },
  rightAction: {
    marginRight: -TOKENS.spacing.xs,
  },
});
