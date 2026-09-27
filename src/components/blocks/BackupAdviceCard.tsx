import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { TOKENS, FONT } from "../../constants/theme";
import { t } from "../../i18n";
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
  return (
    <View
      accessibilityRole="summary"
      style={[styles.card, { borderColor: TOKENS.colors.status.warning, backgroundColor: TOKENS.colors.surface }]}
    >
      <Text style={[styles.title, { color: TOKENS.colors.text.primary }]}>{t("backup.title")}</Text>
      <Text style={[styles.body, { color: TOKENS.colors.text.secondary }]}>{t("backup.advice")}</Text>
      {onExport ? <Button label={t("backup.export")} size="sm" iconName="cloud-upload-outline" isLoading={busy} disabled={busy} onPress={onExport} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: TOKENS.radius.lg, padding: TOKENS.spacing.lg, gap: TOKENS.spacing.sm },
  title: { ...FONT.bodyStrong },
  body: { ...FONT.caption, lineHeight: 18 },
});
