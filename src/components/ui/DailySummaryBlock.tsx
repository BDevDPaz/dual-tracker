import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { t, useLanguage } from "../../i18n";
import { formatUiDecimal } from "../../utils/dateUtils";
import { SummaryCard } from "./SummaryCard";
import { TOKENS, FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";

interface DailySummaryBlockProps {
  hours: string;
  earnings: string;
  /**
   * El margen lateral es de la PANTALLA (ScreenContainer o el contentContainer
   * del ScrollView). true solo si se usa fuera de un contenedor con padding.
   */
  inset?: boolean;
  /** Minutos netos del día para la barra de progreso (P6). Ausente = sin barra. */
  netMinutes?: number;
  /** Objetivo diario en minutos (P6). Ausente = 480. Solo se usa si hay netMinutes. */
  dailyTargetMinutes?: number;
}

export function DailySummaryBlock({ hours, earnings, inset = false, netMinutes, dailyTargetMinutes }: DailySummaryBlockProps) {
  const language = useLanguage();
  const { colors } = useTheme();
  const hasProgress = typeof netMinutes === "number";
  const target = dailyTargetMinutes && dailyTargetMinutes > 0 ? dailyTargetMinutes : 480;
  const fraction = hasProgress ? Math.min(1, Math.max(0, (netMinutes as number) / target)) : 0;
  return (
    <View style={styles.wrap}>
      <SummaryCard
        hoursLabel={t("today.netHours")}
        hours={formatUiDecimal(hours, language)}
        moneyLabel={t("today.estimate")}
        money={earnings}
        inset={inset}
      />
      {hasProgress ? (
        <View style={styles.progressWrap}>
          <View style={[styles.track, { backgroundColor: colors.border }]}>
            <View style={[styles.fill, { width: `${fraction * 100}%`, backgroundColor: colors.primary }]} />
          </View>
          <Text style={[styles.progressLabel, { color: colors.text.secondary }]}>
            {`${netMinutes} / ${target} min`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: TOKENS.spacing.sm },
  progressWrap: { gap: TOKENS.spacing.xs },
  track: {
    height: 6,
    borderRadius: TOKENS.radius.round,
    overflow: "hidden",
  },
  fill: { height: "100%" },
  progressLabel: { ...FONT.caption },
});
