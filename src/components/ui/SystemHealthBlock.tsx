import React, { useEffect, useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  FadeInDown,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { EngineState } from "./OperationalHeroCard";
import { Card } from "./Card";

interface SystemHealthBlockProps {
  engineState: EngineState;
}

export const SystemHealthBlock = React.memo(function SystemHealthBlock({
  engineState,
}: SystemHealthBlockProps) {
  const { tokens } = useTheme();
  const isTracking = ["GEOFENCE_CREATED", "TRAVEL", "ACTIVE_WORK"].includes(engineState);
  const isIssue = ["PENDING_EXIT_CONFIRMATION"].includes(engineState);
  const pulseOpacity = useSharedValue(1);

  useEffect(() => {
    if (isTracking)
      pulseOpacity.value = withRepeat(
        withTiming(0.3, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    else pulseOpacity.value = withTiming(1, { duration: 300 });
  }, [isTracking, pulseOpacity]);

  const animatedDotStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));

  const gpsColor = isIssue
    ? tokens.colors.status.danger
    : isTracking
      ? tokens.colors.status.success
      : tokens.colors.text.muted;
  const syncColor = isIssue ? tokens.colors.status.warning : tokens.colors.status.success;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        block: { marginHorizontal: tokens.layout.screenPadding, marginTop: tokens.spacing.xl },
        title: { ...FONT.label, marginBottom: tokens.spacing.md, letterSpacing: 1 },
        row: { flexDirection: "row", alignItems: "center", marginBottom: tokens.spacing.sm },
        dot: { width: 8, height: 8, borderRadius: 4, marginRight: tokens.spacing.sm },
        icon: { marginRight: tokens.spacing.sm },
        text: { ...FONT.body, fontSize: 14 },
      }),
    [tokens],
  );

  return (
    <Animated.View entering={FadeInDown.delay(200).duration(400)}>
      <Card variant="surface" style={styles.block}>
        <Text style={[styles.title, { color: tokens.colors.text.primary }]}>
          ESTADO DEL SISTEMA
        </Text>
        <View style={styles.row}>
          <Animated.View style={[styles.dot, { backgroundColor: gpsColor }, animatedDotStyle]} />
          <Ionicons name="locate-outline" size={16} color={gpsColor} style={styles.icon} />
          <Text style={[styles.text, { color: tokens.colors.text.secondary }]}>
            {isTracking
              ? "Seguimiento GPS activo"
              : isIssue
                ? "Atención requerida"
                : "GPS en espera"}
          </Text>
        </View>
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: syncColor }]} />
          <Ionicons name="sync-outline" size={16} color={syncColor} style={styles.icon} />
          <Text style={[styles.text, { color: tokens.colors.text.secondary }]}>
            Sincronización en tiempo real
          </Text>
        </View>
      </Card>
    </Animated.View>
  );
});
