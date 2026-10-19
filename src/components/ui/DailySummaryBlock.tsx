import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { TOKENS, FONT, ICON } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { t, useLanguage } from "../../i18n";
import { formatUiDecimal } from "../../utils/dateUtils";
import { useMotionPreference, REDUCED_FADE_MS } from "./motion";

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
  const language = useLanguage();
  const { colors } = useTheme();
  const reduceMotion = useMotionPreference();
  return (
    <Animated.View
      entering={reduceMotion ? FadeIn.duration(REDUCED_FADE_MS) : FadeInDown.delay(100).duration(400)}
      style={[
        styles.block,
        inset && styles.inset,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          ...TOKENS.shadows.sm,
        },
      ]}
    >
      <View style={styles.metricZone}>
        <View style={styles.metricHeader}>
          <Ionicons
            name="time-outline"
            size={ICON.sm}
            color={colors.text.secondary}
          />
          <Text
            style={[
              styles.metricLabel,
              { color: colors.text.secondary },
            ]}
          >
            {t("today.netHours")}
          </Text>
        </View>

        <Text
          style={[styles.metricValue, { color: colors.text.primary }]}
        >
          {formatUiDecimal(hours, language)}
        </Text>
      </View>

      <View
        style={[styles.divider, { backgroundColor: colors.border }]}
      />

      <View style={styles.metricZone}>
        <View style={styles.metricHeader}>
          <Ionicons
            name="cash-outline"
            size={ICON.sm}
            color={colors.primary}
          />
          <Text
            style={[
              styles.metricLabel,
              { color: colors.text.secondary },
            ]}
          >
            {t("today.estimate")}
          </Text>
        </View>

        <Text style={[styles.metricValue, { color: colors.primary }]}>
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
    padding: TOKENS.spacing.lg,
    borderRadius: TOKENS.radius.lg,
    marginBottom: TOKENS.spacing.xl,
    alignItems: "center",
    borderWidth: TOKENS.layout.hairline,
  },
  metricZone: {
    flex: 1,
    alignItems: "center",
  },
  metricHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: TOKENS.spacing.sm,
    marginBottom: TOKENS.spacing.xs,
  },
  metricLabel: {
    ...FONT.label,
  },
  metricValue: {
    ...FONT.h2,
    ...FONT.tabularNums,
  },
  divider: {
    width: 1,
    height: TOKENS.layout.metricRule,
  },
});
