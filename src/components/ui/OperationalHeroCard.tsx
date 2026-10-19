import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { LinearTransition } from "react-native-reanimated";

import { TOKENS, FONT, ICON, BREAKPOINTS } from "../../constants/theme";
import { useResponsive } from "./responsive";
import { useTheme } from "../../context/ThemeContext";
import type { SessionStateUI } from "../../core/selectors";
import { t, useLanguage } from "../../i18n";
import { StatusPill } from "./StatusPill";
import { Button } from "./Button";
import { GlassLayers, useGlass } from "./GlassSurface";

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
  /**
   * Línea compacta de "siguiente acción" cuando no hay temporizador (ESPERANDO:
   * destino + estado de la geocerca). Sustituye al hueco vacío.
   */
  nextAction?: string | null;
  /** Toque en el nombre del destino (ficha del sitio). Sustituye al CTA "Ver destino". */
  onDestinationPress?: () => void;
  /**
   * El margen lateral es de la PANTALLA (ScreenContainer o el contentContainer
   * del ScrollView). true solo si se usa fuera de un contenedor con padding.
   */
  inset?: boolean;
  /** La acción primaria vive en el pie fijo de la pantalla. */
  pinPrimary?: boolean;
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
  nextAction = null,
  onDestinationPress,
  inset = false,
  pinPrimary = false,
}: OperationalHeroCardProps) {
  const { colors } = useTheme();
  useLanguage();
  // Cristal: desenfoque + relleno 12 % + filo dorado; sólido si no hay blur o se reduce la transparencia.
  const { glass, containerStyle } = useGlass();
  // Teléfonos estrechos (< 360 dp): CTAs apilados a ancho completo; el texto nunca baja de 16.
  const { width, isCompact } = useResponsive();
  const narrow = isCompact || width < BREAKPOINTS.compact;
  const primaryVariant = ui.state === "ACTIVA" || ui.state === "SALIDA" ? "danger" : "primary";
  return (
    <Animated.View
      layout={LinearTransition.springify().damping(20).stiffness(150)}
      style={[styles.cardOuter, inset && styles.inset, TOKENS.shadows.md]}
    >
      <View style={[styles.cardContainer, containerStyle]} testID="hero-card">
        <GlassLayers enabled={glass} />
        <View style={styles.headerRow}>
          <StatusPill tone={ui.tone} label={t(ui.labelKey)} symbol={ui.state === "ACTIVA" ? "arrival" : undefined} />
          {onDestinationPress ? (
            <Pressable onPress={onDestinationPress} accessibilityRole="link" style={styles.destinationHit}>
              <Text style={[styles.destinationText, { color: colors.text.primary }]} numberOfLines={2}>
                {destination ?? t("today.noDestination")}
              </Text>
            </Pressable>
          ) : (
            <Text style={[styles.destinationText, styles.destinationPlain, { color: colors.text.primary }]} numberOfLines={2}>
              {destination ?? t("today.noDestination")}
            </Text>
          )}
        </View>

        <Text style={[styles.subText, { color: colors.text.secondary }]}>{t(ui.subKey)}</Text>
        {uncertified ? <StatusPill tone="warning" label={t("today.uncertified")} /> : null}

        {ui.showTimer ? (
          <View style={[styles.metricsRow, narrow && styles.metricsStack]}>
            <View style={styles.metricBlock}>
              <Text style={[styles.metricLabel, { color: colors.text.secondary }]}>{t("today.netHours").toUpperCase()}</Text>
              <Text
                style={[styles.metricBigValue, narrow && styles.metricBigValueNarrow, { color: colors.text.primary }]}
                testID="hero-timer"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {timeString}
              </Text>
            </View>
            <View style={[styles.metricBlockRight, narrow && styles.metricBlock]}>
              <Text style={[styles.metricLabel, { color: colors.text.secondary }]}>{t("today.estimate").toUpperCase()}</Text>
              <Text
                style={[styles.metricBigValue, narrow && styles.metricBigValueNarrow, { color: colors.primary }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {earnings}
              </Text>
            </View>
          </View>
        ) : nextAction ? (
          <View style={styles.nextRow} testID="hero-next-action">
            <Ionicons name="navigate-outline" size={ICON.sm} color={colors.status.info} />
            <Text style={[styles.nextText, { color: colors.text.primary }]} numberOfLines={2}>
              {nextAction}
            </Text>
          </View>
        ) : (
          <View style={styles.spacer} />
        )}

        {!pinPrimary || (ui.secondary && onSecondaryAction) ? (
        <View style={[styles.actionRow, narrow && styles.actionColumn]} testID="hero-actions">
          {pinPrimary ? null : (
            <Button label={t(ui.primary.labelKey)} variant={primaryVariant} onPress={onPrimaryAction} isLoading={busy} style={narrow ? styles.fullButton : styles.flexButton} />
          )}
          {ui.secondary && onSecondaryAction ? (
            <Button label={t(ui.secondary.labelKey)} variant="secondary" onPress={onSecondaryAction} disabled={busy} style={narrow ? styles.fullButton : styles.flexButton} />
          ) : null}
        </View>
        ) : null}
      </View>
    </Animated.View>
  );
});

export const NARROW_WIDTH = BREAKPOINTS.compact;

const styles = StyleSheet.create({
  inset: { marginHorizontal: TOKENS.layout.screenPadding },
  cardOuter: {
    marginHorizontal: 0,
    borderRadius: TOKENS.radius.lg,
  },
  cardContainer: {
    borderRadius: TOKENS.radius.lg,
    padding: TOKENS.spacing.xl,
    borderWidth: TOKENS.layout.hairline,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: TOKENS.spacing.md },
  destinationHit: { flex: 1, marginLeft: TOKENS.spacing.md },
  destinationPlain: { marginLeft: TOKENS.spacing.md },
  destinationText: { ...FONT.bodyStrong, flex: 1, textAlign: "right" },
  subText: { ...FONT.caption, marginBottom: TOKENS.spacing.md },
  metricsRow: { flexDirection: "row", justifyContent: "space-between", marginVertical: TOKENS.spacing.lg, gap: TOKENS.spacing.md },
  metricsStack: { flexDirection: "column", alignItems: "flex-start" },
  metricBlock: { flex: 1 },
  metricBlockRight: { flex: 1, alignItems: "flex-end" },
  metricLabel: { ...FONT.label, marginBottom: TOKENS.spacing.xs },
  metricBigValue: { ...FONT.metric },
  metricBigValueNarrow: { ...FONT.metricCompact },
  spacer: { height: TOKENS.spacing.lg },
  nextRow: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.sm, marginVertical: TOKENS.spacing.md },
  nextText: { ...FONT.body, flex: 1 },
  actionRow: { flexDirection: "row", gap: TOKENS.spacing.md },
  actionColumn: { flexDirection: "column" },
  flexButton: { flex: 1 },
  fullButton: { width: "100%" },
});
