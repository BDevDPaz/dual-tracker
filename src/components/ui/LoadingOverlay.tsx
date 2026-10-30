import React, { useEffect, useMemo } from "react";
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
import { FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
  isReconnecting?: boolean;
}

export function LoadingOverlay({
  visible,
  message = "Cargando...",
  isReconnecting = false,
}: LoadingOverlayProps) {
  const { tokens } = useTheme();
  const rotation = useSharedValue(0);
  const pulseOpacity = useSharedValue(1);

  useEffect(() => {
    if (visible) {
      rotation.value = withRepeat(
        withTiming(360, { duration: 1000, easing: Easing.linear }),
        -1,
        false,
      );
      if (isReconnecting)
        pulseOpacity.value = withRepeat(
          withTiming(0.4, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          -1,
          true,
        );
    } else {
      rotation.value = 0;
      pulseOpacity.value = 1;
    }
  }, [visible, isReconnecting, rotation, pulseOpacity]);

  const animatedSpinnerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));
  const animatedPulseStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, justifyContent: "center", alignItems: "center" },
        backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: tokens.colors.overlay },
        contentCard: {
          paddingVertical: tokens.spacing.xl,
          paddingHorizontal: 32,
          borderRadius: tokens.radius.lg,
          borderWidth: 1,
          alignItems: "center",
          gap: tokens.spacing.lg,
          maxWidth: "80%",
        },
        spinnerWrapper: { width: 48, height: 48, justifyContent: "center", alignItems: "center" },
        spinnerRing: {
          width: 36,
          height: 36,
          borderRadius: 18,
          borderWidth: 3,
          borderColor: tokens.colors.border,
        },
        radarWrapper: {
          width: 56,
          height: 56,
          borderRadius: 28,
          justifyContent: "center",
          alignItems: "center",
        },
        messageText: { ...FONT.body, fontSize: 14, textAlign: "center" },
      }),
    [tokens],
  );

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.container}>
        <Animated.View entering={FadeIn.duration(250)} style={styles.backdrop} />
        <View
          style={[
            styles.contentCard,
            { backgroundColor: tokens.colors.surfaceElevated, borderColor: tokens.colors.border },
          ]}
        >
          {isReconnecting ? (
            <Animated.View
              style={[
                styles.radarWrapper,
                animatedPulseStyle,
                { backgroundColor: tokens.colors.statusSoft.warning },
              ]}
            >
              <Ionicons
                name="cloud-offline-outline"
                size={28}
                color={tokens.colors.status.warning}
              />
            </Animated.View>
          ) : (
            <View style={styles.spinnerWrapper}>
              <Animated.View
                style={[
                  styles.spinnerRing,
                  animatedSpinnerStyle,
                  { borderTopColor: tokens.colors.primary },
                ]}
              />
            </View>
          )}
          <Text
            style={[
              styles.messageText,
              {
                color: isReconnecting ? tokens.colors.status.warning : tokens.colors.text.secondary,
                fontWeight: isReconnecting ? "700" : "400",
              },
            ]}
          >
            {isReconnecting ? "Reconectando…" : message}
          </Text>
        </View>
      </View>
    </Modal>
  );
}
