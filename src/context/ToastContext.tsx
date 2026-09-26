/**
 * ToastContext — portado de GEOTrack sin cambios de comportamiento.
 * Único cambio: el reloj sale de TimeAuthorityService (antes utils/timeProvider).
 * Lo alimenta FeedbackBridge a partir de FeedbackService (store.feedback).
 */
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { StyleSheet, Text, View, Platform, Pressable } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";

import { TOKENS, FONT } from "../constants/theme";
import { DURATIONS } from "../constants/animations";
import { ICONS } from "../constants/icons";
import { TimeAuthorityService } from "../services/evidence/TimeAuthorityService";

const now = () => TimeAuthorityService.now();

export type ToastType = "success" | "error" | "info" | "warning";

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const DEDUPE_THRESHOLD_MS = 2500;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState("");
  const [type, setType] = useState<ToastType>("info");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastToastRef = useRef<{
    message: string;
    type: ToastType;
    timestamp: number;
  } | null>(null);

  const translateY = useSharedValue(-150);
  const opacity = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const dismissToast = useCallback(() => {
    translateY.value = withTiming(
      -150,
      { duration: DURATIONS.toastTransition },
      (finished) => {
        if (finished) {
          opacity.value = 0;
          runOnJS(setMessage)("");
        }
      },
    );
  }, [translateY, opacity]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const showToast = useCallback(
    (msg: string, toastType: ToastType = "info") => {
      if (!msg || msg.trim() === "") return;

      const currentTs = now();
      if (
        lastToastRef.current &&
        lastToastRef.current.message === msg &&
        lastToastRef.current.type === toastType &&
        currentTs - lastToastRef.current.timestamp < DEDUPE_THRESHOLD_MS
      ) {
        return;
      }

      lastToastRef.current = {
        message: msg,
        type: toastType,
        timestamp: currentTs,
      };

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      setMessage(msg);
      setType(toastType);

      opacity.value = 1;
      translateY.value = withSpring(Platform.OS === "ios" ? 60 : 40, {
        damping: 20,
        stiffness: 150,
      });

      timerRef.current = setTimeout(() => {
        dismissToast();
      }, DURATIONS.toast);
    },
    [dismissToast, translateY, opacity],
  );

  const getToastConfig = () => {
    switch (type) {
      case "success":
        return {
          color: TOKENS.colors.status.success,
          icon: ICONS.status.success,
        };
      case "error":
        return { color: TOKENS.colors.status.danger, icon: ICONS.status.error };
      case "warning":
        return {
          color: TOKENS.colors.status.warning,
          icon: ICONS.status.warning,
        };
      case "info":
      default:
        return { color: TOKENS.colors.status.info, icon: ICONS.status.info };
    }
  };

  const config = getToastConfig();

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {message !== "" && (
        <Animated.View style={[styles.toastContainer, animatedStyle]}>
          <Pressable
            onPress={dismissToast}
            style={[
              styles.toastCard,
              {
                backgroundColor: TOKENS.colors.surfaceElevated,
                borderColor: config.color,
                ...TOKENS.shadows.md,
              },
            ]}
            accessibilityRole="alert"
            accessibilityLabel={`Aviso: ${message}`}
          >
            <View style={styles.contentRow}>
              <Ionicons
                name={config.icon as any}
                size={22}
                color={config.color}
              />
              <Text
                style={[
                  styles.toastText,
                  { color: TOKENS.colors.text.primary },
                ]}
                numberOfLines={3}
              >
                {message}
              </Text>
            </View>
          </Pressable>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error(
      "useToast debe ser consumido estrictamente dentro de un ToastProvider",
    );
  }
  return context;
}

const styles = StyleSheet.create({
  toastContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: TOKENS.zIndex.toast,
    paddingHorizontal: TOKENS.spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  toastCard: {
    width: "100%",
    borderRadius: TOKENS.radius.md,
    paddingVertical: 14,
    paddingHorizontal: TOKENS.spacing.lg,
    borderWidth: 1,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: TOKENS.spacing.md,
  },
  toastText: {
    ...FONT.bodyStrong,
    fontSize: 14,
    flex: 1,
    lineHeight: 18,
  },
});
