import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { TOKENS } from "../../constants/theme";
import { DURATIONS } from "../../constants/animations";
import { useTheme } from "../../context/ThemeContext";
import { useMotionPreference } from "./motion";

interface SkeletonProps {
  lines?: number;
  /** Dentro de LoadingState el anuncio lo lleva el contenedor. */
  decorative?: boolean;
}

/** Barras de carga. Sin bucle si el usuario pidió reducir el movimiento. */
export function Skeleton({ lines = 3, decorative = false }: SkeletonProps) {
  const { colors } = useTheme();
  const reduceMotion = useMotionPreference();
  const opacity = useSharedValue(0.45);
  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 0.7;
      return;
    }
    opacity.value = withRepeat(withTiming(1, { duration: DURATIONS.transition }), -1, true);
  }, [opacity, reduceMotion]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <View
      style={styles.stack}
      accessibilityRole={decorative ? undefined : "progressbar"}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? "no-hide-descendants" : "auto"}
    >
      {Array.from({ length: lines }, (_, i) => (
        <Animated.View key={i} style={[styles.line, i === lines - 1 && styles.short, { backgroundColor: colors.surfaceElevated }, animated]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: TOKENS.spacing.sm, paddingVertical: TOKENS.spacing.md, width: "100%" },
  line: { height: TOKENS.spacing.md, borderRadius: TOKENS.radius.sm, width: "100%" },
  short: { width: "62%" },
});
