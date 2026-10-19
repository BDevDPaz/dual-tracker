import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TOKENS, FONT, ICON } from "../../constants/theme";
import type { ScreenStatus } from "../../core/contracts";
import { EmptyState } from "../ui/EmptyState";

/**
 * Estados de pantalla obligatorios (Producto §4): loading, empty, degraded,
 * conflict, ready. Este bloque pinta los cuatro no-ready de forma uniforme.
 * - loading / empty sustituyen el contenido.
 * - degraded / conflict son banners persistentes sobre el contenido.
 */
interface Props {
  status: ScreenStatus;
  message?: string;
  onPress?: () => void;
  emptyIcon?: React.ComponentProps<typeof Ionicons>["name"];
}

export function ScreenStatusBanner({ status, message, onPress, emptyIcon }: Props) {
  if (status === "ready") return null;
  if (status === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={TOKENS.colors.primary} />
        {message ? <Text style={[styles.loadingText, { color: TOKENS.colors.text.secondary }]}>{message}</Text> : null}
      </View>
    );
  }
  if (status === "empty") return <EmptyState title={message ?? ""} icon={emptyIcon} />;
  const color = status === "conflict" ? TOKENS.colors.status.danger : TOKENS.colors.status.warning;
  const bg = status === "conflict" ? TOKENS.colors.statusBg.danger : TOKENS.colors.statusBg.warning;
  const body = (
    <View style={[styles.banner, { borderColor: color, backgroundColor: bg }]}>
      <Ionicons name={status === "conflict" ? "alert-circle-outline" : "warning-outline"} size={ICON.md} color={color} />
      <Text style={[styles.bannerText, { color }]}>{message}</Text>
      {onPress ? <Ionicons name="chevron-forward" size={ICON.sm} color={color} /> : null}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button">
      {body}
    </Pressable>
  ) : (
    body
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: TOKENS.spacing.xl },
  loadingText: { ...FONT.caption, marginTop: TOKENS.spacing.md },
  banner: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.sm, borderWidth: TOKENS.layout.hairline, borderRadius: TOKENS.radius.md, padding: TOKENS.spacing.md, marginBottom: TOKENS.spacing.md },
  bannerText: { ...FONT.caption, flex: 1 },
});
