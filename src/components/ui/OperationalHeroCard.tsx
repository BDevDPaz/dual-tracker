import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";

import { TOKENS, FONT } from "../../constants/theme";
import type { SessionStateUI } from "../../core/selectors";
import { t } from "../../i18n";
import { StatusPill } from "./StatusPill";
import { Button } from "./Button";

/**
 * OperationalHeroCard — portado de GEOTrack y rediseñado (Producto §5.7):
 * StatusPill, destino o "Sin destino", temporizador solo si `ui.showTimer`,
 * subtexto de getSessionStateUI, un CTA primario y como máximo un secundario.
 * No decide nada: recibe el view-model y callbacks.
 */
interface OperationalHeroCardProps {
  ui: SessionStateUI;
  destination: string | null;
  timeString: string;
  earnings: string;
  uncertified?: boolean;
  busy?: boolean;
  onPrimaryAction: () => void;
  onSecondaryAction?: () => void;
}

export const OperationalHeroCard = React.memo(function OperationalHeroCard({
  ui,
  destination,
  timeString,
  earnings,
  uncertified = false,
  busy = false,
  onPrimaryAction,
  onSecondaryAction,
}: OperationalHeroCardProps) {
  const primaryVariant = ui.state === "ACTIVA" || ui.state === "SALIDA" ? "danger" : "primary";
  return (
    <Animated.View
      layout={LinearTransition.springify().damping(20).stiffness(150)}
      style={[styles.cardContainer, { backgroundColor: TOKENS.colors.surfaceElevated, borderColor: TOKENS.colors.border, ...TOKENS.shadows.md }]}
    >
      <View style={styles.headerRow}>
        <StatusPill tone={ui.tone} label={t(ui.labelKey)} />
        <Text style={[styles.destinationText, { color: TOKENS.colors.text.primary }]} numberOfLines={1}>
          {destination ?? t("today.noDestination")}
        </Text>
      </View>

      <Text style={[styles.subText, { color: TOKENS.colors.text.secondary }]}>{t(ui.subKey)}</Text>
      {uncertified ? <StatusPill tone="warning" label={t("today.uncertified")} /> : null}

      {ui.showTimer ? (
        <View style={styles.metricsRow}>
          <View style={styles.metricBlock}>
            <Text style={[styles.metricLabel, { color: TOKENS.colors.text.secondary }]}>{t("today.netHours").toUpperCase()}</Text>
            <Text style={[styles.metricBigValue, { color: TOKENS.colors.text.primary }]}>{timeString}</Text>
          </View>
          <View style={styles.metricBlockRight}>
            <Text style={[styles.metricLabel, { color: TOKENS.colors.text.secondary }]}>{t("today.estimate").toUpperCase()}</Text>
            <Text style={[styles.metricBigValue, { color: TOKENS.colors.primary }]}>{earnings}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.spacer} />
      )}

      <View style={styles.actionRow}>
        <Button label={t(ui.primary.labelKey)} variant={primaryVariant} onPress={onPrimaryAction} isLoading={busy} style={styles.flexButton} />
        {ui.secondary && onSecondaryAction ? (
          <Button label={t(ui.secondary.labelKey)} variant="secondary" onPress={onSecondaryAction} disabled={busy} style={styles.flexButton} />
        ) : null}
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  cardContainer: {
    marginHorizontal: TOKENS.layout.screenPadding,
    borderRadius: TOKENS.radius.lg,
    padding: TOKENS.spacing.xl,
    borderWidth: 1,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: TOKENS.spacing.md },
  destinationText: { ...FONT.bodyStrong, flex: 1, textAlign: "right", marginLeft: TOKENS.spacing.md },
  subText: { ...FONT.caption, marginBottom: TOKENS.spacing.md },
  metricsRow: { flexDirection: "row", justifyContent: "space-between", marginVertical: TOKENS.spacing.lg },
  metricBlock: { flex: 1 },
  metricBlockRight: { flex: 1, alignItems: "flex-end" },
  metricLabel: { ...FONT.label, marginBottom: TOKENS.spacing.xs },
  metricBigValue: { ...FONT.h1, fontSize: 36 },
  spacer: { height: TOKENS.spacing.lg },
  actionRow: { flexDirection: "row", gap: TOKENS.spacing.md },
  flexButton: { flex: 1 },
});
