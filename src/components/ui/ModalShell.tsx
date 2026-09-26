import React from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
} from "react-native";
import Animated from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";

import { TOKENS, FONT } from "../../constants/theme";
import { ANIM_PRESETS } from "../../constants/animations";
import { ICONS } from "../../constants/icons";
import { Button, ButtonVariant } from "./Button";

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
}

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
}: ModalShellProps) {
  const getToneConfig = () => {
    switch (tone) {
      case "danger":
        return {
          color: TOKENS.colors.status.danger,
          icon: icon || ICONS.status.error,
        };
      case "warning":
        return {
          color: TOKENS.colors.status.warning,
          icon: icon || ICONS.status.warning,
        };
      case "success":
        return {
          color: TOKENS.colors.status.success,
          icon: icon || ICONS.status.success,
        };
      case "info":
        return {
          color: TOKENS.colors.status.info,
          icon: icon || ICONS.status.info,
        };
      case "neutral":
      default:
        return {
          color: TOKENS.colors.primary,
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
                { backgroundColor: `${toneConfig.color}20` },
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
                style={[styles.title, { color: TOKENS.colors.text.primary }]}
              >
                {title}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityLabel="Cerrar modal"
              accessibilityRole="button"
            >
              <Ionicons
                name={ICONS.actions.close as any}
                size={24}
                color={TOKENS.colors.text.muted}
              />
            </Pressable>
          </View>
          {description ? (
            <Text
              style={[
                styles.description,
                { color: TOKENS.colors.text.secondary },
              ]}
            >
              {description}
            </Text>
          ) : null}
        </View>

        <View style={styles.body}>{children}</View>

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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <Animated.View
          entering={ANIM_PRESETS.modalEnter}
          style={[
            styles.modalCard,
            {
              backgroundColor: TOKENS.colors.surfaceElevated,
              borderColor: TOKENS.colors.border,
            },
          ]}
        >
          {renderContent()}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: TOKENS.colors.overlay,
    justifyContent: "flex-end",
  },
  modalCard: {
    borderTopLeftRadius: TOKENS.radius.xl,
    borderTopRightRadius: TOKENS.radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    maxHeight: "90%",
  },
  contentBody: {
    padding: TOKENS.spacing.xl,
    paddingBottom: Platform.OS === "ios" ? 40 : TOKENS.spacing.xl,
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
