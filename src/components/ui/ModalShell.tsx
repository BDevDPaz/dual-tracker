import React from "react";
import { Modal, View, Text, StyleSheet, Pressable, Platform, ScrollView } from "react-native";
import Animated from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";

import { FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
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
  const { tokens } = useTheme();

  const getToneConfig = () => {
    switch (tone) {
      case "danger":
        return { color: tokens.colors.status.danger, icon: icon || ICONS.status.error };
      case "warning":
        return { color: tokens.colors.status.warning, icon: icon || ICONS.status.warning };
      case "success":
        return { color: tokens.colors.status.success, icon: icon || ICONS.status.success };
      case "info":
        return { color: tokens.colors.status.info, icon: icon || ICONS.status.info };
      case "neutral":
      default:
        return { color: tokens.colors.primary, icon: icon || ICONS.status.neutral };
    }
  };

  const toneConfig = getToneConfig();

  const renderContent = () => {
    const content = (
      <View style={[styles.contentBody, { padding: tokens.spacing.xl }]}>
        <View style={[styles.header, { marginBottom: tokens.spacing.lg }]}>
          <View style={[styles.headerTitleRow, { gap: tokens.spacing.md }]}>
            <View style={[styles.iconWrapper, { backgroundColor: `${toneConfig.color}20` }]}>
              <Ionicons name={toneConfig.icon as any} size={24} color={toneConfig.color} />
            </View>
            <View style={styles.titleContainer}>
              <Text style={[styles.title, { color: tokens.colors.text.primary }]}>{title}</Text>
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
                color={tokens.colors.text.muted}
              />
            </Pressable>
          </View>
          {description ? (
            <Text style={[styles.description, { color: tokens.colors.text.secondary }]}>
              {description}
            </Text>
          ) : null}
        </View>

        <View style={[styles.body, { marginBottom: tokens.spacing.xl }]}>{children}</View>

        <View style={[styles.footer, { gap: tokens.spacing.md }]}>
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
              variant={primaryAction.variant || (tone === "danger" ? "danger" : "primary")}
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
      <View style={[styles.overlay, { backgroundColor: tokens.colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          entering={ANIM_PRESETS.modalEnter}
          style={[
            styles.modalCard,
            {
              backgroundColor: tokens.colors.surfaceElevated,
              borderColor: tokens.colors.border,
              borderTopLeftRadius: tokens.radius.xl,
              borderTopRightRadius: tokens.radius.xl,
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
  overlay: { flex: 1, justifyContent: "flex-end" },
  modalCard: { borderWidth: 1, borderBottomWidth: 0, maxHeight: "90%" },
  contentBody: { paddingBottom: Platform.OS === "ios" ? 40 : 24 },
  scrollContent: { flexGrow: 1, justifyContent: "flex-end" },
  header: {},
  headerTitleRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  titleContainer: { flex: 1 },
  title: { ...FONT.h2 },
  description: { ...FONT.body, marginTop: 4, lineHeight: 22 },
  body: {},
  footer: { flexDirection: "row" },
  footerButton: { flex: 1 },
});
