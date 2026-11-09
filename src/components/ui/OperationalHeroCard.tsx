import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { LinearTransition } from "react-native-reanimated";

import { TOKENS, FONT, ICON, BREAKPOINTS } from "../../constants/theme";
import { useResponsive } from "./responsive";
import { useTheme } from "../../context/ThemeContext";
import type { SessionStateUI } from "../../core/selectors";
import { t, useLanguage } from "../../i18n";
import { spokenDuration } from "../../i18n/labels";
import { StatusPill } from "./StatusPill";
import { Button } from "./Button";
import { GlassLayers, useGlass } from "./GlassSurface";

/**
 * OperationalHeroCard — portado de GEOTrack y rediseñado (Producto §5.7):
 * Estado como título principal, destino degradado, temporizador solo si `ui.showTimer`,
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
  /** Antes de la llegada no se muestra el estimado. */
  showEarnings?: boolean;
  /** Contador compacto (p. ej. visitas de hoy). */
  counter?: string | null;
  /** Línea de salud del sistema (P3). Si no se pasa, no se muestra. */
  systemHealth?: { label: string; status: string } | null;
  /** Progreso diario (P6). fraction se clampa 0–1 dentro. */
  progress?: { fraction: number; label: string } | null;
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
  showEarnings = true,
  counter = null,
  systemHealth = null,
  progress = null,
}: OperationalHeroCardProps) {
  const { colors } = useTheme();
  const language = useLanguage();
  // Cristal: desenfoque + relleno 12 % + filo dorado; sólido si no hay blur o se reduce la transparencia.
  const { glass, containerStyle } = useGlass();
  // Teléfonos estrechos (< 360 dp): CTAs apilados a ancho completo; el texto nunca baja de 16.
  const { width, isCompact } = useResponsive();
  const narrow = isCompact || width < BREAKPOINTS.compact;
  const primaryVariant = "primary" as const;
  const [detailsExpanded, setDetailsExpanded] = React.useState(false);

  const showDetailsKey = t("common.showDetails");
  const hideDetailsKey = t("common.hideDetails");
  const showDetailsLabel = showDetailsKey === "common.showDetails" ? "Ver detalles" : showDetailsKey;
  const hideDetailsLabel = hideDetailsKey === "common.hideDetails" ? "Ocultar detalles" : hideDetailsKey;

  const hasTimer = ui.showTimer;
  const nextInLevel1 = !hasTimer && nextAction;
  const nextInDetails = hasTimer && nextAction;
  const clampedFraction = progress ? Math.min(1, Math.max(0, progress.fraction)) : 0;
  const healthDotColor =
    systemHealth?.status === "OK"
      ? colors.statusText.success
      : systemHealth?.status === "UNCHECKED"
        ? colors.text.muted
        : colors.statusText.warning;

  return (
    <Animated.View
      layout={LinearTransition.springify().damping(20).stiffness(150)}
      style={[styles.cardOuter, inset && styles.inset, TOKENS.shadows.md]}
    >
      <View style={[styles.cardContainer, containerStyle]} testID="hero-card">
        <GlassLayers enabled={glass} />
        {/* P4: Nivel 1 — estado como título principal */}
        <View style={styles.stateRow}>
          <View style={[styles.goldDot, { backgroundColor: colors.goldText }]} />
          <Text style={[styles.heroState, { color: colors.text.primary }]} testID="hero-state" numberOfLines={2}>
            {t(ui.labelKey)}
          </Text>
          {counter ? (
            <Text style={[styles.counter, { color: colors.text.secondary }]} accessibilityLabel={counter}>
              {counter}
            </Text>
          ) : null}
        </View>

        {/* P4: destino degradado a caption secundario */}
        {onDestinationPress ? (
          <Pressable
            onPress={onDestinationPress}
            accessibilityRole="link"
            accessibilityLabel={destination ?? t("today.noDestination")}
            accessibilityHint={t("a11y.destinationHint")}
            style={styles.destinationHit}
          >
            <Text style={[styles.destinationText, { color: colors.text.secondary }]} numberOfLines={2}>
              {destination ?? t("today.noDestination")}
            </Text>
          </Pressable>
        ) : (
          <Text style={[styles.destinationText, { color: colors.text.secondary }]} numberOfLines={2}>
            {destination ?? t("today.noDestination")}
          </Text>
        )}

        {/* P9/P10: tiempo domina apilado vertical, earnings línea secundaria dorada */}
        {hasTimer ? (
          <View style={styles.timerStack}>
            <Text style={[styles.metricLabel, { color: colors.text.secondary }]}>{t("today.elapsed").toUpperCase()}</Text>
            <Text
              style={[styles.timerValue, narrow && styles.metricBigValueNarrow, { color: colors.text.primary }]}
              testID="hero-timer"
              accessibilityRole="timer"
              accessibilityLabel={spokenDuration(timeString, language)}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
            >
              {timeString}
            </Text>
            {showEarnings ? (
              <Text
                style={[styles.earningsLine, { color: colors.goldText }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
                testID="hero-earnings"
              >
                {earnings}
              </Text>
            ) : null}
          </View>
        ) : nextInLevel1 ? (
          <View style={styles.nextRow} testID="hero-next-action">
            <Ionicons name="navigate-outline" size={ICON.sm} color={colors.status.info} accessibilityElementsHidden importantForAccessibility="no" />
            <Text style={[styles.nextText, { color: colors.text.primary }]} numberOfLines={2}>
              {nextAction}
            </Text>
          </View>
        ) : null}

        {/* P6: progreso diario */}
        {progress ? (
          <View style={styles.progressBlock} testID="hero-progress">
            <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
              <View style={[styles.progressFill, { width: `${clampedFraction * 100}%`, backgroundColor: colors.goldText }]} />
            </View>
            <Text style={[styles.progressLabel, { color: colors.text.secondary }]}>{progress.label}</Text>
          </View>
        ) : null}

        {/* P3: salud del sistema, no se esconde si el fondo está apagado */}
        {systemHealth ? (
          <View style={styles.healthRow} testID="hero-system-health">
            <View style={[styles.healthDot, { backgroundColor: healthDotColor }]} />
            <Text style={[styles.healthLabel, { color: colors.text.secondary }]}>{systemHealth.label}</Text>
          </View>
        ) : null}

        {/* P2: Nivel 2 expandible */}
        <Pressable
          onPress={() => setDetailsExpanded((v) => !v)}
          accessibilityRole="button"
          testID="hero-details-toggle"
          style={styles.detailsToggle}
        >
          <Text style={[styles.detailsToggleText, { color: colors.goldText }]}>
            {detailsExpanded ? hideDetailsLabel : showDetailsLabel}
          </Text>
          <Ionicons
            name={detailsExpanded ? "chevron-up-outline" : "chevron-down-outline"}
            size={ICON.sm}
            color={colors.goldText}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </Pressable>

        {detailsExpanded ? (
          <View style={styles.detailsBlock} testID="hero-details">
            <Text style={[styles.subText, { color: colors.text.secondary }]}>{t(ui.subKey)}</Text>
            <StatusPill tone={ui.tone} label={t(ui.labelKey)} symbol={ui.state === "ACTIVA" ? "arrival" : undefined} />
            {uncertified ? <StatusPill tone="warning" label={t("today.uncertified")} /> : null}
            {nextInDetails ? (
              <View style={styles.nextRow} testID="hero-next-action">
                <Ionicons name="navigate-outline" size={ICON.sm} color={colors.status.info} accessibilityElementsHidden importantForAccessibility="no" />
                <Text style={[styles.nextText, { color: colors.text.primary }]} numberOfLines={2}>
                  {nextAction}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

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
  stateRow: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.sm, marginBottom: TOKENS.spacing.xs },
  goldDot: { width: TOKENS.accent.dot, height: TOKENS.accent.dot, borderRadius: TOKENS.accent.dot / 2 },
  heroState: { ...FONT.hero, flex: 1 },
  counter: { ...FONT.caption, marginLeft: "auto" },
  destinationHit: { minHeight: TOKENS.layout.minTouchTarget, justifyContent: "center", marginBottom: TOKENS.spacing.xs },
  destinationText: { ...FONT.caption },
  timerStack: { marginVertical: TOKENS.spacing.lg, gap: TOKENS.spacing.xs },
  metricLabel: { ...FONT.label },
  timerValue: { ...FONT.timer },
  metricBigValueNarrow: { ...FONT.metricCompact },
  earningsLine: { ...FONT.bodyStrong },
  progressBlock: { marginTop: TOKENS.spacing.md, gap: TOKENS.spacing.xs },
  progressTrack: { height: 6, borderRadius: TOKENS.radius.sm, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: TOKENS.radius.sm },
  progressLabel: { ...FONT.caption },
  healthRow: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.xs, marginTop: TOKENS.spacing.md },
  healthDot: { width: TOKENS.accent.dot, height: TOKENS.accent.dot, borderRadius: TOKENS.accent.dot / 2 },
  healthLabel: { ...FONT.caption, flex: 1 },
  detailsToggle: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.xs, marginTop: TOKENS.spacing.md, minHeight: TOKENS.layout.minTouchTarget },
  detailsToggleText: { ...FONT.caption },
  detailsBlock: { marginTop: TOKENS.spacing.md, gap: TOKENS.spacing.md },
  subText: { ...FONT.caption },
  nextRow: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.sm, marginVertical: TOKENS.spacing.md },
  nextText: { ...FONT.body, flex: 1 },
  actionRow: { flexDirection: "row", gap: TOKENS.spacing.md, marginTop: TOKENS.spacing.lg },
  actionColumn: { flexDirection: "column" },
  flexButton: { flex: 1 },
  fullButton: { width: "100%" },
});
