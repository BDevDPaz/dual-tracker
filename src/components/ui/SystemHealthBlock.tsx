import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";

import { TOKENS, FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import type { SystemHealthView } from "../../core/selectors";
import { t } from "../../i18n";
import { Card } from "./Card";

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
  const pulseOpacity = useSharedValue(1);
  useEffect(() => {
    pulseOpacity.value = tracking
      ? withRepeat(withTiming(0.3, { duration: 800, easing: Easing.inOut(Easing.ease) }), -1, true)
      : withTiming(1, { duration: 300 });
  }, [tracking, pulseOpacity]);
  const animatedDotStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));

  const ok = colors.status.success;
  const warn = colors.status.warning;
  const muted = colors.text.muted;
  const rows = [
    { icon: "locate-outline", label: t("health.gps"), color: !health.checked ? muted : health.gpsOk ? ok : warn, status: health.gpsOk ? t("health.ok") : t("health.warn"), pulse: tracking },
    { icon: "moon-outline", label: t("health.background"), color: !health.checked ? muted : health.backgroundOk ? ok : warn, status: health.backgroundOk ? t("health.ok") : t("health.warn"), pulse: false },
    { icon: "trail-sign-outline", label: t("health.trace"), color: health.traceMode === "SIN_UBICACION" ? muted : ok, status: t(`health.modes.${health.traceMode}`), pulse: false },
  ] as const;

  const content = (
    <Card variant="surface" style={[styles.block, inset && styles.inset, health.degraded && { borderWidth: 1, borderColor: warn }]}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: colors.text.primary }]}>{t("health.title").toUpperCase()}</Text>
        {onPress ? <Ionicons name="chevron-forward" size={16} color={health.degraded ? warn : colors.text.secondary} /> : null}
      </View>
      {rows.map((r) => (
        <View key={r.label} style={styles.row}>
          <Animated.View style={[styles.dot, { backgroundColor: r.color }, r.pulse ? animatedDotStyle : null]} />
          <Ionicons name={r.icon} size={16} color={r.color} style={styles.icon} />
          <Text style={[styles.text, { color: colors.text.secondary }]}>{r.label}</Text>
          <Text style={[styles.status, { color: r.color }]}>{r.status}</Text>
        </View>
      ))}
    </Card>
  );

  return (
    <Animated.View entering={FadeInDown.delay(200).duration(400)}>
      {onPress ? (
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={t("health.title")}>
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
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: TOKENS.spacing.md },
  title: { ...FONT.label, letterSpacing: 1 },
  row: { flexDirection: "row", alignItems: "center", marginBottom: TOKENS.spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: TOKENS.spacing.sm },
  icon: { marginRight: TOKENS.spacing.sm },
  text: { ...FONT.body, fontSize: 14, flex: 1 },
  status: { ...FONT.caption },
});
