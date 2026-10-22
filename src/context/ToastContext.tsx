/**
 * ToastContext — portado de GEOTrack. El reloj sale de TimeAuthorityService.
 * Lo alimenta FeedbackBridge a partir de FeedbackService (store.feedback).
 *  - Posición: top = inset seguro superior + 8.
 *  - Dos nodos de texto: título (FONT.bodyStrong) + leyenda opcional.
 *  - accessibilityLiveRegion="polite" además del rol "alert".
 *  - Mientras hay un modal bloqueante visible no se pinta: se encola y se
 *    muestra al cerrarse (un Modal nativo taparía el aviso).
 */
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { AccessibilityInfo, StyleSheet, Text, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";

import { TOKENS, FONT, ICON } from "../constants/theme";
import { useTheme } from "./ThemeContext";
import { DURATIONS } from "../constants/animations";
import { ICONS } from "../constants/icons";
import { TimeAuthorityService } from "../services/evidence/TimeAuthorityService";
import { t, useLanguage, type Language } from "../i18n";
import { ArrivalMark } from "../components/brand/ArrivalMark";
import { useBlockingModalVisible } from "../components/feedback/blockingModals";

const now = () => TimeAuthorityService.now();

export type ToastType = "success" | "error" | "info" | "warning";
/** Símbolo de llegada confirmada (manual o check-in automático). */
export type ToastMark = "arrival";

/** Si se pasa, el aviso visible se reescribe al cambiar el idioma, sin esperar a que se cierre. */
export type ToastLive = (lang: Language) => { title: string; caption?: string };

interface ToastContextType {
  /** title: línea principal; caption: detalle opcional en una segunda línea. */
  showToast: (title: string, type?: ToastType, caption?: string, live?: ToastLive, mark?: ToastMark) => void;
}

type ToastItem = { title: string; caption?: string; type: ToastType; live?: ToastLive; mark?: ToastMark };

/** Separación entre el borde seguro superior y el aviso. */
export const TOAST_TOP_GAP = TOKENS.spacing.sm;
/** Máximo de avisos encolados mientras un modal bloqueante está visible. */
const MAX_QUEUED = 3;

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const DEDUPE_THRESHOLD_MS = 2500;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const language = useLanguage();
  const liveRef = useRef<ToastLive | undefined>(undefined);
  const insets = useSafeAreaInsets();
  const blockingVisible = useBlockingModalVisible();
  const [message, setMessage] = useState("");
  const [caption, setCaption] = useState<string | undefined>(undefined);
  const [type, setType] = useState<ToastType>("info");
  const [mark, setMark] = useState<ToastMark | undefined>(undefined);
  const [queued, setQueued] = useState<ToastItem[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const screenReaderRef = useRef(false);
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
    let alive = true;
    const apply = (on: boolean) => {
      screenReaderRef.current = on;
      if (on && timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    const read = AccessibilityInfo.isScreenReaderEnabled?.();
    if (read && typeof (read as Promise<boolean>).then === "function") {
      void Promise.resolve(read)
        .then((on) => {
          if (alive) apply(Boolean(on));
        })
        .catch(() => undefined);
    }
    const sub = AccessibilityInfo.addEventListener?.("screenReaderChanged", apply);
    return () => {
      alive = false;
      sub?.remove?.();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Lectura síncrona del estado bloqueante dentro de showToast (callback estable).
  const blockingRef = useRef(blockingVisible);
  blockingRef.current = blockingVisible;

  const present = useCallback(
    ({ title, caption: cap, type: toastType, live, mark: toastMark }: ToastItem) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      liveRef.current = live;
      setMessage(title);
      setCaption(cap);
      setType(toastType);
      setMark(toastMark);

      opacity.value = 1;
      translateY.value = withSpring(0, {
        damping: 20,
        stiffness: 150,
      });

      if (!screenReaderRef.current) {
        timerRef.current = setTimeout(() => {
          dismissToast();
        }, DURATIONS.toast);
      }
    },
    [dismissToast, translateY, opacity],
  );

  const showToast = useCallback(
    (title: string, toastType: ToastType = "info", cap?: string, live?: ToastLive, toastMark?: ToastMark) => {
      if (!title || title.trim() === "") return;
      const text = cap ? `${title}\n${cap}` : title;

      const currentTs = now();
      if (
        lastToastRef.current &&
        lastToastRef.current.message === text &&
        lastToastRef.current.type === toastType &&
        currentTs - lastToastRef.current.timestamp < DEDUPE_THRESHOLD_MS
      ) {
        return;
      }

      lastToastRef.current = {
        message: text,
        type: toastType,
        timestamp: currentTs,
      };

      const item: ToastItem = { title, caption: cap || undefined, type: toastType, live, mark: toastMark };
      if (blockingRef.current) {
        setQueued((q) => [...q, item].slice(-MAX_QUEUED));
        return;
      }
      present(item);
    },
    [present],
  );

  // Un modal bloqueante tapa el aviso: se retiene y se muestra al cerrarse.
  useEffect(() => {
    if (blockingVisible || queued.length === 0) return;
    // Solo el más reciente: una ráfaga de avisos viejos no aporta.
    present(queued[queued.length - 1]);
    setQueued([]);
  }, [blockingVisible, queued, present]);

  const getToastConfig = () => {
    switch (type) {
      case "success":
        return {
          color: colors.status.success,
          icon: ICONS.status.success,
        };
      case "error":
        return { color: colors.status.danger, icon: ICONS.status.error };
      case "warning":
        return {
          color: colors.status.warning,
          icon: ICONS.status.warning,
        };
      case "info":
      default:
        return { color: colors.status.info, icon: ICONS.status.info };
    }
  };

  const config = getToastConfig();
  const liveCopy = message !== "" && liveRef.current ? liveRef.current(language) : null;
  const shownTitle = liveCopy?.title ?? message;
  const shownCaption = liveCopy ? liveCopy.caption : caption;

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {message !== "" && !blockingVisible && (
        <Animated.View
          style={[styles.toastContainer, { top: insets.top + TOAST_TOP_GAP }, animatedStyle]}
          testID="toast"
        >
          <Pressable
            onPress={dismissToast}
            style={[
              styles.toastCard,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: config.color,
                ...TOKENS.shadows.md,
              },
            ]}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            accessibilityHint={t("a11y.dismissToast")}
            accessibilityLabel={t("a11y.toast", { message: shownCaption ? `${shownTitle}. ${shownCaption}` : shownTitle })}
          >
            <View style={styles.contentRow}>
              {mark === "arrival" ? (
                <ArrivalMark size={ICON.xl} decorative testID="toast-arrival-mark" />
              ) : (
                <Ionicons
                  name={config.icon as any}
                  size={ICON.xl}
                  color={config.color}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
              )}
              <View style={styles.textCol}>
                <Text
                  style={[styles.toastTitle, { color: colors.text.primary }]}
                  numberOfLines={2}
                  testID="toast-title"
                >
                  {shownTitle}
                </Text>
                {shownCaption ? (
                  <Text
                    style={[styles.toastCaption, { color: colors.text.secondary }]}
                    numberOfLines={3}
                    testID="toast-caption"
                  >
                    {shownCaption}
                  </Text>
                ) : null}
              </View>
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

/** Para piezas que también se montan fuera del proveedor (pruebas, alta). */
export function useToastOptional() {
  return useContext(ToastContext);
}

const styles = StyleSheet.create({
  toastContainer: {
    position: "absolute",
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
    paddingVertical: TOKENS.spacing.lg,
    paddingHorizontal: TOKENS.spacing.lg,
    borderWidth: TOKENS.layout.hairline,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: TOKENS.spacing.md,
  },
  textCol: {
    flex: 1,
    gap: TOKENS.spacing.xxs,
  },
  toastTitle: {
    ...FONT.bodyStrong,
  },
  toastCaption: {
    ...FONT.caption,
  },
});
