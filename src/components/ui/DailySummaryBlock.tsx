import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { TOKENS, FONT } from "../../constants/theme";
import { t } from "../../i18n";

interface DailySummaryBlockProps {
  hours: string;
  earnings: string;
  /**
   * El margen lateral es de la PANTALLA (ScreenContainer o el contentContainer
   * del ScrollView). true solo si se usa fuera de un contenedor con padding.
   */
  inset?: boolean;
}

export function DailySummaryBlock({ hours, earnings, inset = false }: DailySummaryBlockProps) {
  return (
    <Animated.View
      entering={FadeInDown.delay(100).duration(400)}
      style={[
        styles.block,
        inset && styles.inset,
        {
          backgroundColor: TOKENS.colors.surface,
          borderColor: TOKENS.colors.border,
          ...TOKENS.shadows.sm,
        },
      ]}
    >
      <View style={styles.metricZone}>
        <View style={styles.metricHeader}>
          <Ionicons
            name="time-outline"
            size={16}
            color={TOKENS.colors.text.secondary}
          />
          <Text
            style={[
              styles.metricLabel,
              { color: TOKENS.colors.text.secondary },
            ]}
          >
            {t("today.netHours")}
          </Text>
        </View>

        <Text
          style={[styles.metricValue, { color: TOKENS.colors.text.primary }]}
        >
          {hours}
        </Text>
      </View>

      <View
        style={[styles.divider, { backgroundColor: TOKENS.colors.border }]}
      />

      <View style={styles.metricZone}>
        <View style={styles.metricHeader}>
          <Ionicons
            name="cash-outline"
            size={16}
            color={TOKENS.colors.primary}
          />
          <Text
            style={[
              styles.metricLabel,
              { color: TOKENS.colors.text.secondary },
            ]}
          >
            {t("today.estimate")}
          </Text>
        </View>

        <Text style={[styles.metricValue, { color: TOKENS.colors.primary }]}>
          {earnings}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  inset: { marginHorizontal: TOKENS.layout.screenPadding },
  block: {
    flexDirection: "row",
    marginHorizontal: 0,
    padding: 18,
    borderRadius: TOKENS.radius.lg,
    marginBottom: TOKENS.spacing.xl,
    alignItems: "center",
    borderWidth: 1,
  },
  metricZone: {
    flex: 1,
    alignItems: "center",
  },
  metricHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  metricLabel: {
    ...FONT.label,
  },
  metricValue: {
    ...FONT.h3,
    fontSize: 24,
  },
  divider: {
    width: 1,
    height: 40,
  },
});
