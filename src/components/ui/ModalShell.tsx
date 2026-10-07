import React, { useEffect, useId } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";

import { TOKENS, FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { ANIM_PRESETS } from "../../constants/animations";
import { ICONS } from "../../constants/icons";
import { t, useLanguage } from "../../i18n";
import { BlockingModals } from "../feedback/blockingModals";
import { Button, ButtonVariant } from "./Button";
import { useMotionPreference } from "./motion";
import { GlassLayers, useGlass } from "./GlassSurface";

export type ModalTone = "neutral" | "info" | "warning" | "danger" | "success";

interface ModalAction {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
}

interface ModalShellProps {
  visible: boolean;
  title: string;
  description?: string;
  tone?: ModalTone;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  primaryAction?: ModalAction;
  secondaryAction?: ModalAction;
  onClose: () => void;
  children?: React.ReactNode;
  scrollable?: boolean;
  /**
   * false → decisión obligatoria: sin toque en el fondo, sin X y el botón
   * atrás de Android (onRequestClose) no cierra. Por defecto true.
   */
  dismissible?: boolean;
  /**
   * Muestra la X de cierre (solo si dismissible). Por defecto true; los modales
   * con "Cancelar" explícito en el pie la ocultan para no duplicar la salida.
   */
  showCloseButton?: boolean;
  /** Etiqueta accesible de la X (por defecto t("a11y.closeModal")). */
  closeLabel?: string;
  testID?: string;
}

const noop = () => undefined;

export function ModalShell({
  visible,
  title,
  description,
  tone = "neutral",
  icon,
  primaryAction,
  secondaryAction,
  onClose,
  children,
  scrollable = false,
  dismissible = true,
  showCloseButton = true,
  closeLabel,
  testID,
}: ModalShellProps) {
  const { colors } = useTheme();
  useLanguage();
  const reduceMotion = useMotionPreference();
  const { glass, containerStyle } = useGlass();
  const blockingId = useId();
  const blocking = visible && !dismissible;
  useEffect(() => {
    if (!blocking) return;
    BlockingModals.show(blockingId);
    return () => BlockingModals.hide(blockingId);
  }, [blocking, blockingId]);
  const requestClose = dismissible ? onClose : noop;

  const getToneConfig = () => {
    switch (tone) {
      case "danger":
        return {
          color: colors.status.danger,
          bg: colors.statusBg.danger,
          icon: icon || ICONS.status.error,
        };
      case "warning":
        return {
          color: colors.status.warning,
          bg: colors.statusBg.warning,
          icon: icon || ICONS.status.warning,
        };
      case "success":
        return {
          color: colors.status.success,
          bg: colors.statusBg.success,
          icon: icon || ICONS.status.success,
        };
      case "info":
        return {
          color: colors.status.info,
          bg: colors.statusBg.info,
          icon: icon || ICONS.status.info,
        };
      case "neutral":
      default:
        return {
          color: colors.primary,
          bg: colors.statusBg.primary,
          icon: icon || ICONS.status.neutral,
        };
    }
  };

  const toneConfig = getToneConfig();

  const renderContent = () => {
    const content = (
      <View style={styles.contentBody}>
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <View
              style={[
                styles.iconWrapper,
                { backgroundColor: toneConfig.bg },
              ]}
            >
              <Ionicons
                name={toneConfig.icon as any}
                size={24}
                color={toneConfig.color}
              />
            </View>
            <View style={styles.titleContainer}>
              <Text
                style={[styles.title, { color: colors.text.primary }]}
              >
                {title}
              </Text>
            </View>
            {dismissible && showCloseButton ? (
              <Pressable
                onPress={onClose}
                hitSlop={12}
                accessibilityLabel={closeLabel ?? t("a11y.closeModal")}
                accessibilityRole="button"
                testID={testID ? `${testID}-close` : undefined}
              >
                <Ionicons
                  name={ICONS.actions.close as any}
                  size={24}
                  color={colors.text.muted}
                />
              </Pressable>
            ) : null}
          </View>
          {description ? (
            <Text
              style={[
                styles.description,
                { color: colors.text.secondary },
              ]}
            >
              {description}
            </Text>
          ) : null}
        </View>

        <View style={styles.body}>{children}</View>

        {primaryAction || secondaryAction ? (
        <View style={styles.footer}>
          {secondaryAction && (
            <Button
              label={secondaryAction.label}
              variant={secondaryAction.variant || "ghost"}
              onPress={secondaryAction.onPress}
              disabled={secondaryAction.disabled}
              isLoading={secondaryAction.loading}
              style={styles.footerButton}
            />
          )}
          {primaryAction && (
            <Button
              label={primaryAction.label}
              variant={
                primaryAction.variant ||
                (tone === "danger" ? "danger" : "primary")
              }
              onPress={primaryAction.onPress}
              disabled={primaryAction.disabled}
              isLoading={primaryAction.loading}
              style={styles.footerButton}
            />
          )}
        </View>
        ) : null}
      </View>
    );

    if (scrollable) {
      return (
        <ScrollView
          bounces={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {content}
        </ScrollView>
      );
    }

    return content;
  };

  const card = (
    <Animated.View
      entering={reduceMotion ? ANIM_PRESETS.reducedFade : ANIM_PRESETS.modalEnter}
      style={[styles.modalCard, containerStyle, styles.modalCardEdges]}
      testID={testID ? `${testID}-card` : undefined}
    >
      <GlassLayers enabled={glass} />
      {/* Borde inferior seguro real en lugar del paddingBottom fijo de 40 en iOS. */}
      <SafeAreaView edges={["bottom"]} style={styles.safeArea}>
        {renderContent()}
      </SafeAreaView>
    </Animated.View>
  );

  return (
    // animationType="none": una sola animación (Reanimated), sin el fade nativo encima.
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={requestClose}
      testID={testID}
    >
      <Animated.View
        entering={reduceMotion ? undefined : ANIM_PRESETS.overlayEnter}
        style={[styles.overlay, { backgroundColor: colors.overlay }]}
      >
        {dismissible ? (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            testID={testID ? `${testID}-backdrop` : undefined}
          />
        ) : null}

        {scrollable ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.keyboardAvoider}
            pointerEvents="box-none"
            testID={testID ? `${testID}-kav` : undefined}
          >
            {card}
          </KeyboardAvoidingView>
        ) : (
          card
        )}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalCard: {
    borderTopLeftRadius: TOKENS.radius.xl,
    borderTopRightRadius: TOKENS.radius.xl,
    maxHeight: "90%",
    overflow: "hidden",
  },
  modalCardEdges: {
    borderBottomWidth: 0,
  },
  safeArea: {
    flexShrink: 1,
  },
  keyboardAvoider: {
    justifyContent: "flex-end",
  },
  contentBody: {
    padding: TOKENS.spacing.xl,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "flex-end",
  },
  header: {
    marginBottom: TOKENS.spacing.lg,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: TOKENS.spacing.md,
    marginBottom: TOKENS.spacing.xs,
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    ...FONT.h2,
  },
  description: {
    ...FONT.body,
    marginTop: TOKENS.spacing.xs,
    lineHeight: 22,
  },
  body: {
    marginBottom: TOKENS.spacing.xl,
  },
  footer: {
    flexDirection: "row",
    gap: TOKENS.spacing.md,
  },
  footerButton: {
    flex: 1,
  },
});
