import React from "react";
import { Text, StyleSheet } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";

import { TOKENS, FONT, font, type ThemeColors } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { ICONS } from "../../constants/icons";
import type { IntegrityClass } from "../../core/contracts";
import { t, useLanguage } from "../../i18n";

/**
 * IntegrityBadge — portado de GEOTrack, ahora alimentado por IntegrityClass
 * del ledger (VALID / MANUAL / AUTO / CONFLICT → Validada / Ajuste / Auto /
 * Revisar). Deja de ser "de adorno".
 */
interface IntegrityBadgeProps {
  integrity: IntegrityClass;
  /**
   * FieldCrypto v1.3 §12: la sesión tiene un bloqueo de certificación
   * (FIELD_CRYPTO_UNAVAILABLE) → "No certificable" en lugar de la clase
   * (salvo CONFLICT, que sigue pidiendo revisión).
   */
  blocked?: boolean;
}

type BadgeConfig = { color: string; bg: string; icon: string };

function configFor(colors: ThemeColors, integrity: IntegrityClass): BadgeConfig {
  switch (integrity) {
    case "VALID":
      return { color: colors.status.success, bg: colors.statusBg.success, icon: ICONS.status.success };
    case "MANUAL":
      return { color: colors.text.secondary, bg: colors.surface, icon: ICONS.actions.edit };
    case "AUTO":
      return { color: colors.status.info, bg: colors.statusBg.info, icon: ICONS.domain.time };
    case "CONFLICT":
      return { color: colors.status.warning, bg: colors.statusBg.warning, icon: ICONS.status.warning };
  }
}

export function IntegrityBadge({ integrity, blocked = false }: IntegrityBadgeProps) {
  useLanguage();
  const showBlocked = blocked && integrity !== "CONFLICT";
  const { colors } = useTheme();
  const config = configFor(colors, showBlocked ? "CONFLICT" : integrity);
  const label = showBlocked ? t("integrity.BLOCKED") : t(`integrity.${integrity}`);
  return (
    <Animated.View
      layout={LinearTransition.springify().damping(20).stiffness(150)}
      style={[styles.badge, { borderColor: config.color, backgroundColor: config.bg }]}
      accessibilityLabel={t("integrity.a11yLabel", { label })}
    >
      <Ionicons name={config.icon as React.ComponentProps<typeof Ionicons>["name"]} size={12} color={config.color} style={styles.icon} />
      <Text style={[styles.text, { color: config.color }]}>{label.toUpperCase()}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: TOKENS.spacing.sm,
    paddingVertical: 4,
    borderRadius: TOKENS.radius.xs,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  icon: { marginRight: 4 },
  text: { ...FONT.label, ...font("800"), letterSpacing: 0.5 },
});
