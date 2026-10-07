import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  cancelAnimation,
  Easing,
} from "react-native-reanimated";

import { TOKENS, FONT, font } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { t } from "../../i18n";
import { useMotionPreference, REDUCED_FADE_MS } from "./motion";

type AppBrandTitleProps = {
  subtitle?: string;
};

export function AppBrandTitle({ subtitle: subtitleProp }: AppBrandTitleProps) {
  const { colors } = useTheme();
  const reduceMotion = useMotionPreference();
  const subtitle = subtitleProp ?? t("app.brandSubtitle");
  const glowOpacity = useSharedValue(0.14);
  const glowScale = useSharedValue(1);
  const lineScale = useSharedValue(0.35);
  const titleLift = useSharedValue(8);
  const titleOpacity = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      // Movimiento reducido: fundido de 150 ms, sin desplazamiento ni bucles.
      titleLift.value = 0;
      titleOpacity.value = withTiming(1, { duration: REDUCED_FADE_MS });
      cancelAnimation(glowScale);
      cancelAnimation(glowOpacity);
      cancelAnimation(lineScale);
      glowScale.value = 1;
      glowOpacity.value = 0.14;
      lineScale.value = 0.85;
      return;
    }
    titleLift.value = withTiming(0, {
      duration: 550,
      easing: Easing.out(Easing.cubic),
    });

    titleOpacity.value = withTiming(1, {
      duration: 500,
      easing: Easing.out(Easing.quad),
    });

    glowScale.value = withRepeat(
      withSequence(
        withTiming(1.025, { duration: 1800 }),
        withTiming(1, { duration: 1800 }),
      ),
      -1,
      false,
    );

    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.24, { duration: 1800 }),
        withTiming(0.12, { duration: 1800 }),
      ),
      -1,
      false,
    );

    lineScale.value = withRepeat(
      withSequence(
        withTiming(0.85, { duration: 1400 }),
        withTiming(0.85, { duration: 1200 }),
        withTiming(0.35, { duration: 1000 }),
      ),
      -1,
      false,
    );
  }, [reduceMotion, glowOpacity, glowScale, lineScale, titleLift, titleOpacity]);

  const titleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleLift.value }],
  }));

  const accentAnimatedStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: glowScale.value }],
  }));

  const lineAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: lineScale.value }],
    opacity: 0.7 + lineScale.value * 0.3,
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.titleRow, titleAnimatedStyle]}>
        <View style={styles.wordmarkWrap}>
          <Animated.View
            style={[
              styles.accentGlow,
              accentAnimatedStyle,
              { backgroundColor: colors.primary },
            ]}
          />

          <Text style={[styles.title, { color: colors.text.primary }]}>
            <Text
              style={[styles.titleAccent, { color: colors.primary }]}
            >
              Dual
            </Text>
            <Text
              style={[styles.titleMain, { color: colors.text.primary }]}
            >
              {" "}Tracker
            </Text>
          </Text>
        </View>
      </Animated.View>

      <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
        {subtitle}
      </Text>

      <View style={[styles.lineTrack, { backgroundColor: colors.track }]}>
        <Animated.View
          style={[
            styles.lineAccent,
            lineAnimatedStyle,
            { backgroundColor: colors.primary },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  wordmarkWrap: {
    position: "relative",
    justifyContent: "center",
  },
  accentGlow: {
    position: "absolute",
    left: -4,
    top: 7,
    width: 44,
    height: 26,
    borderRadius: TOKENS.radius.md,
  },
  title: {
    fontSize: 30,
    ...font("800"),
    letterSpacing: -0.4,
  },
  titleAccent: {},
  titleMain: {},
  subtitle: {
    ...FONT.caption,
    marginTop: 4,
    fontSize: 11,
    ...font("700"),
    letterSpacing: 2,
  },
  lineTrack: {
    marginTop: 10,
    height: 2,
    width: 120,
    borderRadius: 2,
    overflow: "hidden",
  },
  lineAccent: {
    height: 2,
    width: "100%",
    borderRadius: 2,
  },
});
