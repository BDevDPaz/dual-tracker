import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";

export type StatusType = "ACTIVE_WORK" | "CLOSED" | "pending" | "warning" | "info";

interface StatusPillProps {
  status: StatusType;
  label: string;
}

export function StatusPill({ status, label }: StatusPillProps) {
  const { tokens } = useTheme();

  const getStatusStyle = () => {
    switch (status) {
      case "ACTIVE_WORK":
        return {
          backgroundColor: tokens.colors.statusSoft.success,
          textColor: tokens.colors.status.success,
        };
      case "warning":
        return {
          backgroundColor: tokens.colors.statusSoft.warning,
          textColor: tokens.colors.status.warning,
        };
      case "pending":
        return {
          backgroundColor: tokens.colors.statusSoft.info,
          textColor: tokens.colors.status.info,
        };
      case "info":
        return {
          backgroundColor: tokens.colors.backgroundSoft,
          textColor: tokens.colors.text.secondary,
        };
      case "CLOSED":
      default:
        return {
          backgroundColor: tokens.colors.backgroundSoft,
          textColor: tokens.colors.text.secondary,
        };
    }
  };

  const statusStyle = getStatusStyle();

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: statusStyle.backgroundColor,
          paddingHorizontal: tokens.spacing.sm,
          paddingVertical: tokens.spacing.xs,
          borderRadius: tokens.radius.round,
        },
      ]}
    >
      <Text style={[styles.text, { color: statusStyle.textColor }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: "flex-start" },
  text: {
    ...FONT.label,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});
