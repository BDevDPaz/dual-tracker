import React, { useMemo } from "react";
import { Text, StyleSheet } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { ICONS } from "../../constants/icons";

export type BadgeType = "valid" | "manual" | "auto" | "warning" | "error";
interface IntegrityBadgeProps {
  type: BadgeType;
}

export function IntegrityBadge({ type }: IntegrityBadgeProps) {
  const { tokens } = useTheme();
  const getConfig = () => {
    switch (type) {
      case "valid":
        return {
          label: "Correcto",
          color: tokens.colors.status.success,
          bg: tokens.colors.statusSoft.success,
          icon: ICONS.status.success,
        };
      case "manual":
        return {
          label: "Ajustado",
          color: tokens.colors.text.secondary,
          bg: tokens.colors.backgroundSoft,
          icon: ICONS.actions.edit,
        };
      case "auto":
        return {
          label: "Automático",
          color: tokens.colors.status.info,
          bg: tokens.colors.statusSoft.info,
          icon: ICONS.domain.time,
        };
      case "warning":
        return {
          label: "Revisar",
          color: tokens.colors.status.warning,
          bg: tokens.colors.statusSoft.warning,
          icon: ICONS.status.warning,
        };
      case "error":
        return {
          label: "Error",
          color: tokens.colors.status.danger,
          bg: tokens.colors.statusSoft.danger,
          icon: ICONS.status.error,
        };
      default:
        return {
          label: "Desconocido",
          color: tokens.colors.text.muted,
          bg: tokens.colors.backgroundSoft,
          icon: ICONS.status.neutral,
        };
    }
  };
  const config = getConfig();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        badge: {
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: tokens.spacing.sm,
          paddingVertical: 4,
          borderRadius: tokens.radius.xs,
          borderWidth: 1,
          alignSelf: "flex-start",
        },
        icon: { marginRight: 4 },
        text: { ...FONT.label, fontWeight: "800", letterSpacing: 0.5 },
      }),
    [tokens],
  );

  return (
    <Animated.View
      layout={LinearTransition.springify().damping(20).stiffness(150)}
      style={[styles.badge, { borderColor: config.color, backgroundColor: config.bg }]}
      accessibilityLabel={`Estado de integridad: ${config.label}`}
    >
      <Ionicons name={config.icon as any} size={12} color={config.color} style={styles.icon} />
      <Text style={[styles.text, { color: config.color }]}>{config.label.toUpperCase()}</Text>
    </Animated.View>
  );
}
