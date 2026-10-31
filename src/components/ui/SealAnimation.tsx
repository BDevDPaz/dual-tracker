import React, { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { TOKENS, ICON } from "../../constants/theme";
import { DURATIONS } from "../../constants/animations";
import { useTheme } from "../../context/ThemeContext";
import { useMotionPreference } from "./motion";

interface SealAnimationProps {
  visible: boolean;
  onDone?: () => void;
}

/** Sello breve al cerrar un expediente. No cambia el hash ni el PDF. */
export function SealAnimation({ visible, onDone }: SealAnimationProps) {
  const { colors } = useTheme();
  const reduceMotion = useMotionPreference();
  const scale = useSharedValue(reduceMotion ? 1 : 0.6);
  const opacity = useSharedValue(visible ? 1 : 0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    if (!visible) return;
    opacity.value = 1;
    scale.value = reduceMotion ? 1 : withTiming(1, { duration: DURATIONS.transition });
    const id = setTimeout(() => doneRef.current?.(), reduceMotion ? DURATIONS.reduced : DURATIONS.normal);
    return () => clearTimeout(id);
  }, [visible, reduceMotion, opacity, scale]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  if (!visible) return null;
  return (
    <View pointerEvents="none" style={styles.overlay} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.seal, { borderColor: colors.goldText, backgroundColor: colors.surfaceElevated }, animated]}>
        <Ionicons name="shield-checkmark" size={ICON.empty} color={colors.goldText} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: TOKENS.zIndex.overlay,
  },
  seal: {
    width: TOKENS.layout.minTouchTarget * 2,
    height: TOKENS.layout.minTouchTarget * 2,
    borderRadius: TOKENS.radius.round,
    borderWidth: TOKENS.layout.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
});
