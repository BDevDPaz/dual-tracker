import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TOKENS, FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import type { ScreenStatus } from "../../core/contracts";
import { Banner } from "../ui/Banner";
import { EmptyState } from "../ui/EmptyState";
import { Skeleton } from "../ui/Skeleton";

/**
 * Estados de pantalla obligatorios (Producto §4): loading, empty, degraded,
 * conflict, ready. Este bloque pinta los cuatro no-ready de forma uniforme.
 * - loading / empty sustituyen el contenido.
 * - degraded / conflict son banners persistentes sobre el contenido.
 */
interface Props {
  status: ScreenStatus;
  message?: string;
  /** Segunda línea editorial del vacío. */
  emptyDescription?: string;
  onPress?: () => void;
  emptyIcon?: React.ComponentProps<typeof Ionicons>["name"];
}

export function ScreenStatusBanner({ status, message, emptyDescription, onPress, emptyIcon }: Props) {
  const { colors } = useTheme();
  if (status === "ready") return null;
  if (status === "loading") {
    return (
      <View style={styles.center}>
        <Skeleton />
        {message ? <Text style={[styles.loadingText, { color: colors.text.secondary }]}>{message}</Text> : null}
      </View>
    );
  }
  if (status === "empty") return <EmptyState title={message ?? ""} description={emptyDescription} icon={emptyIcon} />;
  return <Banner tone={status === "conflict" ? "danger" : "warning"} message={message ?? ""} onPress={onPress} />;
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", padding: TOKENS.spacing.xl },
  loadingText: { ...FONT.caption, marginTop: TOKENS.spacing.md },
});
