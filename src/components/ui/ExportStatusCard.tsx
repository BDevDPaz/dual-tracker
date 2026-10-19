import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Card } from "./Card";
import { StatusPill } from "./StatusPill";
import { TOKENS, FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { t, useLanguage } from "../../i18n";

interface ExportStatusCardProps {
  sealed: boolean;
  matches: boolean;
  early: boolean;
  pendingExport: boolean;
}

/** Estado del expediente de la semana visible. No sella ni exporta. */
export function ExportStatusCard({ sealed, matches, early, pendingExport }: ExportStatusCardProps) {
  useLanguage();
  const { colors } = useTheme();
  const tone = !sealed || early || (sealed && !matches) || pendingExport ? "warning" : "success";
  const detail = !sealed
    ? t("reports.exportOpen")
    : early
      ? t("reports.exportEarly")
      : !matches
        ? t("reports.exportStale")
        : pendingExport
          ? t("reports.exportPending")
          : t("reports.exportMatches");
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <Text style={[styles.title, { color: colors.text.primary }]}>{t("reports.exportStatus")}</Text>
        <StatusPill tone={tone} label={t(sealed ? "reports.exportSealed" : "reports.exportOpenShort")} />
      </View>
      <Text style={[styles.detail, { color: colors.text.secondary }]}>{detail}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: TOKENS.spacing.sm },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: TOKENS.spacing.sm },
  title: { ...FONT.bodyStrong, flex: 1 },
  detail: { ...FONT.bodySmall },
});
