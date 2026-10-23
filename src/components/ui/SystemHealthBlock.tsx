import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, cancelAnimation, Easing, FadeIn, FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";

import { TOKENS, FONT, ICON } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import type { SystemHealthView } from "../../core/selectors";
import { ICONS } from "../../constants/icons";
import { t, useLanguage } from "../../i18n";
import { Card, CardHeader } from "./Card";
import { useMotionPreference, REDUCED_FADE_MS } from "./motion";

/**
 * SystemHealthBlock — portado de GEOTrack. Ahora lee el snapshot REAL de
 * PermissionsHealth (vía selectSystemHealth): GPS / segundo plano / rastro.
 * Se elimina "Sincronización en tiempo real" (no hay backend).
 * Si hay degradación el bloque es tappable y no se disimula en gris (Producto §5.7).
 */
interface SystemHealthBlockProps {
  health: SystemHealthView;
  tracking: boolean;
  onPress?: () => void;
  /**
   * El margen lateral es de la PANTALLA (ScreenContainer o el contentContainer
   * del ScrollView). true solo si se usa fuera de un contenedor con padding.
   */
  inset?: boolean;
}

export const SystemHealthBlock = React.memo(function SystemHealthBlock({ health, tracking, onPress, inset = false }: SystemHealthBlockProps) {
  const { colors } = useTheme();
  useLanguage();
  const reduceMotion = useMotionPreference();
  const pulseOpacity = useSharedValue(1);
  // Pulso solo en la fila GPS mientras se rastrea; nunca con movimiento reducido.
  const pulsing = tracking && !reduceMotion;
  useEffect(() => {
    if (pulsing) {
      pulseOpacity.value = withRepeat(withTiming(0.3, { duration: 800, easing: Easing.inOut(Easing.ease) }), -1, true);
    } else {
      cancelAnimation(pulseOpacity);
      pulseOpacity.value = reduceMotion ? 1 : withTiming(1, { duration: 300 });
    }
  }, [pulsing, reduceMotion, pulseOpacity]);
  const animatedDotStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));

  const ok = colors.status.success;
  const warn = colors.status.warning;
  const muted = colors.text.muted;
  const rows = [
    { icon: ICONS.domain.gps, label: t("health.gps"), color: !health.checked ? muted : health.gpsOk ? ok : warn, status: health.gpsOk ? t("health.ok") : t("health.warn"), pulse: pulsing },
    { icon: ICONS.domain.background, label: t("health.background"), color: !health.checked ? muted : health.backgroundOk ? ok : warn, status: health.backgroundOk ? t("health.ok") : t("health.warn"), pulse: false },
    { icon: ICONS.domain.trace, label: t("health.trace"), color: health.traceMode === "SIN_UBICACION" ? muted : ok, status: t(`health.modes.${health.traceMode}`), pulse: false },
  ] as const;

  const content = (
    <Card variant="surface" style={[styles.block, inset && styles.inset, health.degraded && { borderWidth: TOKENS.layout.hairline, borderColor: warn }]}>
      <View style={styles.titleRow}>
        <View style={styles.titleGrow}>
          <CardHeader icon={ICONS.domain.gps} title={t("health.systemTitle")} subtitle={t("health.systemSubtitle")} />
        </View>
        {onPress ? <Ionicons name="chevron-forward" size={ICON.sm} color={health.degraded ? warn : colors.text.secondary} /> : null}
      </View>
      {rows.map((r) => (
        <View key={r.label} style={styles.row}>
          <Animated.View
            style={[styles.dot, { backgroundColor: r.color }, r.pulse ? animatedDotStyle : null]}
            testID={r.pulse ? "health-dot-pulsing" : undefined}
          />
          <Ionicons name={r.icon} size={ICON.sm} color={r.color} style={styles.icon} />
          <Text style={[styles.text, { color: colors.text.secondary }]}>{r.label}</Text>
          <Text style={[styles.status, { color: r.color }]}>{r.status}</Text>
        </View>
      ))}
      {health.degraded ? (
        <Text style={[styles.impact, { color: warn }]} testID="health-impact">
          {t("health.impactNoValid")}
        </Text>
      ) : null}
    </Card>
  );

  return (
    <Animated.View entering={reduceMotion ? FadeIn.duration(REDUCED_FADE_MS) : FadeInDown.delay(200).duration(400)}>
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={t("health.systemTitle")}
          accessibilityHint={t("health.openGuidance")}
        >
          {content}
        </Pressable>
      ) : (
        content
      )}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  inset: { marginHorizontal: TOKENS.layout.screenPadding },
  block: { marginHorizontal: 0 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  titleGrow: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", marginBottom: TOKENS.spacing.sm },
  dot: { width: TOKENS.spacing.sm, height: TOKENS.spacing.sm, borderRadius: TOKENS.radius.xs, marginRight: TOKENS.spacing.sm },
  icon: { marginRight: TOKENS.spacing.sm },
  text: { ...FONT.bodySmall, flex: 1 },
  status: { ...FONT.caption },
  impact: { ...FONT.caption, marginTop: TOKENS.spacing.xs },
});
