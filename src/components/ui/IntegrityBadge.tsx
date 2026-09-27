import React from "react";
import { Text, StyleSheet } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";

import { TOKENS, FONT } from "../../constants/theme";
import { ICONS } from "../../constants/icons";
import type { IntegrityClass } from "../../core/contracts";
import { t } from "../../i18n";

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

const CONFIG: Record<IntegrityClass, { color: string; icon: string }> = {
  VALID: { color: TOKENS.colors.status.success, icon: ICONS.status.success },
  MANUAL: { color: TOKENS.colors.text.secondary, icon: ICONS.actions.edit },
  AUTO: { color: TOKENS.colors.status.info, icon: ICONS.domain.time },
  CONFLICT: { color: TOKENS.colors.status.warning, icon: ICONS.status.warning },
};

const BLOCKED_CONFIG = { color: TOKENS.colors.status.warning, icon: ICONS.status.warning };

export function IntegrityBadge({ integrity, blocked = false }: IntegrityBadgeProps) {
  const showBlocked = blocked && integrity !== "CONFLICT";
  const config = showBlocked ? BLOCKED_CONFIG : CONFIG[integrity];
  const label = showBlocked ? t("integrity.BLOCKED") : t(`integrity.${integrity}`);
  return (
    <Animated.View
      layout={LinearTransition.springify().damping(20).stiffness(150)}
      style={[styles.badge, { borderColor: config.color, backgroundColor: `${config.color}15` }]}
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
  text: { ...FONT.label, fontWeight: "800", letterSpacing: 0.5 },
});
