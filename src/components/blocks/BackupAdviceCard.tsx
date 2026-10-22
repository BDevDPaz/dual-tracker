import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TOKENS, FONT, ICON } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { t, useLanguage } from "../../i18n";
import { Button } from "../ui/Button";

/**
 * Recomendación de exportar el expediente (spec FieldCrypto v1.3 §16).
 * Reportes (bajo la lista de expedientes) y detalle del pack tras sellar.
 * Solo presenta: la vista decide cuándo mostrarla (selectBackupAdvice).
 */
interface Props {
  onExport?: () => void;
  busy?: boolean;
}

export function BackupAdviceCard({ onExport, busy }: Props) {
  useLanguage();
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="summary"
      style={[styles.card, { borderColor: colors.status.warning, backgroundColor: colors.surface }]}
    >
      <View style={styles.titleRow}>
        <Ionicons name="warning-outline" size={ICON.md} color={colors.status.warning} accessibilityElementsHidden importantForAccessibility="no" />
        <Text style={[styles.title, { color: colors.text.primary }]}>{t("backup.title")}</Text>
      </View>
      <Text style={[styles.body, { color: colors.text.secondary }]}>{t("backup.advice")}</Text>
      {onExport ? <Button label={t("backup.export")} size="sm" iconName="cloud-upload-outline" isLoading={busy} disabled={busy} onPress={onExport} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: TOKENS.layout.hairline, borderRadius: TOKENS.radius.lg, padding: TOKENS.spacing.lg, gap: TOKENS.spacing.sm },
  titleRow: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.sm },
  title: { ...FONT.bodyStrong, flex: 1 },
  body: { ...FONT.caption },
});
