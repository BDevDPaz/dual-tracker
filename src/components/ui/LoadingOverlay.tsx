import React, { useEffect } from "react";
import { View, Text, StyleSheet, Modal } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  FadeIn,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { TOKENS, FONT, font } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { t } from "../../i18n";

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
  isReconnecting?: boolean;
  /** Texto del estado de reconexión (por defecto t("common.reconnecting")). */
  reconnectingLabel?: string;
}

export function LoadingOverlay({
  visible,
  message,
  isReconnecting = false,
  reconnectingLabel,
}: LoadingOverlayProps) {
  const { colors } = useTheme();
  const rotation = useSharedValue(0);
  const pulseOpacity = useSharedValue(1);

  useEffect(() => {
    if (visible) {
      rotation.value = withRepeat(
        withTiming(360, { duration: 1000, easing: Easing.linear }),
        -1,
        false,
      );

      if (isReconnecting) {
        pulseOpacity.value = withRepeat(
          withTiming(0.4, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          -1,
          true,
        );
      }
    } else {
      rotation.value = 0;
      pulseOpacity.value = 1;
    }
  }, [visible, isReconnecting, rotation, pulseOpacity]);

  const animatedSpinnerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const animatedPulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.container}>
        <Animated.View
          entering={FadeIn.duration(250)}
          style={[styles.backdrop, { backgroundColor: colors.overlay }]}
        />

        <View
          style={[
            styles.contentCard,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
            },
          ]}
        >
          {isReconnecting ? (
            <Animated.View
              style={[
                styles.radarWrapper,
                animatedPulseStyle,
                { backgroundColor: colors.statusBg.warning },
              ]}
            >
              <Ionicons
                name="cloud-offline-outline"
                size={28}
                color={colors.status.warning}
              />
            </Animated.View>
          ) : (
            <View style={styles.spinnerWrapper}>
              <Animated.View
                style={[
                  styles.spinnerRing,
                  animatedSpinnerStyle,
                  { borderColor: colors.track, borderTopColor: colors.primary },
                ]}
              />
            </View>
          )}

          <Text
            style={[
              styles.messageText,
              { color: colors.text.secondary },
              isReconnecting && {
                color: colors.status.warning,
                ...font("700"),
              },
            ]}
          >
            {isReconnecting ? (reconnectingLabel ?? t("common.reconnecting")) : (message ?? t("common.loading"))}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  contentCard: {
    paddingVertical: TOKENS.spacing.xl,
    paddingHorizontal: 32,
    borderRadius: TOKENS.radius.lg,
    borderWidth: 1,
    alignItems: "center",
    gap: TOKENS.spacing.lg,
    maxWidth: "80%",
  },
  spinnerWrapper: {
    width: 48,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  spinnerRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
  },
  radarWrapper: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
  },
  messageText: {
    ...FONT.body,
    fontSize: 14,
    textAlign: "center",
  },
});
