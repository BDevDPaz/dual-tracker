import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { TOKENS, FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { t } from "../../i18n";
import { Banner } from "./Banner";

export interface AlertItem {
  key: string;
  message: string;
  tone: "warning" | "danger" | "success" | "info";
  onPress?: () => void;
}

/**
 * P1: centro único de alertas. En vez de apilar 3-4 banners en Hoy / Historial,
 * muestra 1 + "+N alertas" expandible. Los banners ya usan statusText / statusBorder vía Banner.
 */
export function AlertCenter({ alerts }: { alerts: AlertItem[] }) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  if (alerts.length === 0) return null;

  const visible = expanded ? alerts : alerts.slice(0, 1);
  const rest = alerts.length - visible.length;

  return (
    <View style={styles.stack}>
      {visible.map((a) => (
        <Banner key={a.key} tone={a.tone} message={a.message} onPress={a.onPress} />
      ))}
      {rest > 0 ? (
        <Pressable
          onPress={() => setExpanded(true)}
          accessibilityRole="button"
          style={styles.more}
        >
          <Text style={[styles.moreText, { color: colors.goldText }]}>
            {t("alerts.more", { count: rest })}
          </Text>
        </Pressable>
      ) : null}
      {expanded && alerts.length > 1 ? (
        <Pressable
          onPress={() => setExpanded(false)}
          accessibilityRole="button"
          style={styles.more}
        >
          <Text style={[styles.moreText, { color: colors.goldText }]}>
            {t("alerts.less")}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: TOKENS.spacing.sm },
  more: {
    minHeight: TOKENS.layout.minTouchTarget,
    justifyContent: "center",
    alignItems: "center",
  },
  moreText: { ...FONT.label },
});
