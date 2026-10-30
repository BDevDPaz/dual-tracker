import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";

interface DailySummaryBlockProps {
  hours: string;
  earnings: string;
}

export function DailySummaryBlock({ hours, earnings }: DailySummaryBlockProps) {
  const { tokens } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        block: {
          flexDirection: "row",
          marginHorizontal: tokens.layout.screenPadding,
          padding: 18,
          borderRadius: tokens.radius.lg,
          marginBottom: tokens.spacing.xl,
          alignItems: "center",
          borderWidth: 1,
        },
        metricZone: { flex: 1, alignItems: "center" },
        metricHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
        metricLabel: { ...FONT.label },
        metricValue: { ...FONT.h3, fontSize: 24 },
        divider: { width: 1, height: 40 },
      }),
    [tokens],
  );

  return (
    <Animated.View
      entering={FadeInDown.delay(100).duration(400)}
      style={[
        styles.block,
        {
          backgroundColor: tokens.colors.surface,
          borderColor: tokens.colors.border,
          ...tokens.shadows.sm,
        },
      ]}
    >
      <View style={styles.metricZone}>
        <View style={styles.metricHeader}>
          <Ionicons name="time-outline" size={16} color={tokens.colors.text.secondary} />
          <Text style={[styles.metricLabel, { color: tokens.colors.text.secondary }]}>
            Horas registradas
          </Text>
        </View>
        <Text style={[styles.metricValue, { color: tokens.colors.text.primary }]}>{hours}</Text>
      </View>
      <View style={[styles.divider, { backgroundColor: tokens.colors.border }]} />
      <View style={styles.metricZone}>
        <View style={styles.metricHeader}>
          <Ionicons name="cash-outline" size={16} color={tokens.colors.primary} />
          <Text style={[styles.metricLabel, { color: tokens.colors.text.secondary }]}>
            Ganancias estimadas
          </Text>
        </View>
        <Text style={[styles.metricValue, { color: tokens.colors.primary }]}>{earnings}</Text>
      </View>
    </Animated.View>
  );
}
