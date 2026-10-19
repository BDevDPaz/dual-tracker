import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";

import { TOKENS, FONT, ICON } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { t, useLanguage } from "../../i18n";
import { formatUiDecimal } from "../../utils/dateUtils";

export interface PreviewLine {
  label: string;
  value: string;
}

interface DocumentPreviewWidgetProps {
  employeeName: string;
  dateRange: string;
  totalHours: string;
  totalEarnings: string;
  /** Nombre de empresa desde CompanyPolicy (antes "GEOTrack Solutions Inc." en duro). */
  companyName?: string;
  /** Sello visible cuando el periodo tiene CONFLICT. */
  certified?: boolean;
  /** Líneas reales del rollup: se pintan las dos primeras en lugar de las barras de esqueleto. */
  lines?: PreviewLine[];
  /**
   * SHA-256 del expediente sellado del periodo (manifest.packHash). SOLO el
   * hash del paquete: nunca notas, alias ni ubicaciones. Si llega, se muestra
   * una fila pulsable con los 12 últimos caracteres que copia el hash completo.
   */
  packHash?: string | null;
  /** Tras copiar (la pantalla muestra el aviso); recibe los 12 últimos caracteres. */
  onHashCopied?: (hashTail: string) => void;
  /**
   * El margen lateral es de la PANTALLA (ScreenContainer o el contentContainer
   * del ScrollView). true solo si se usa fuera de un contenedor con padding.
   */
  inset?: boolean;
}

const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

export function DocumentPreviewWidget({
  employeeName,
  dateRange,
  totalHours,
  totalEarnings,
  companyName = "",
  certified = true,
  lines,
  packHash,
  onHashCopied,
  inset = false,
}: DocumentPreviewWidgetProps) {
  const language = useLanguage();
  const { colors } = useTheme();
  const paper = colors.paper;
  const real = (lines ?? []).slice(0, 2);
  const tail = packHash ? packHash.slice(-12) : null;

  const copy = async () => {
    if (!packHash || !tail) return;
    await Clipboard.setStringAsync(packHash);
    onHashCopied?.(tail);
  };

  return (
    <View style={[styles.container, inset && styles.inset]}>
      <View style={styles.docHeader}>
        <Ionicons name="document-text-outline" size={ICON.sm} color={colors.primary} />
        <Text style={[styles.docHeaderText, { color: colors.text.secondary }]}>{t("report.previewTitle")}</Text>
      </View>

      <View style={[styles.paper, { backgroundColor: paper.background }, TOKENS.shadows.md]}>
        <View style={styles.paperHeaderRow}>
          <Text style={[styles.companyName, { color: paper.ink }]}>{companyName || "—"}</Text>
          <Text style={[styles.docType, { color: paper.muted }]}>
            {certified ? t("report.statement") : `${t("report.statement")} · ${t("report.uncertified").toUpperCase()}`}
          </Text>
        </View>

        <View style={[styles.divider, { backgroundColor: paper.line }]} />

        <View style={styles.detailsRow}>
          <View>
            <Text style={[styles.label, { color: paper.label }]}>{t("report.name")}</Text>
            <Text style={[styles.value, { color: paper.text }]}>{employeeName}</Text>
          </View>

          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.label, { color: paper.label }]}>{t("report.period")}</Text>
            <Text style={[styles.value, { color: paper.text }]}>{dateRange}</Text>
          </View>
        </View>

        <View style={styles.linesContainer}>
          {real.length > 0
            ? real.map((l) => (
                <View key={l.label} style={styles.lineRow} testID="preview-line">
                  <Text style={[styles.lineLabel, { color: paper.text }]}>{l.label}</Text>
                  <Text style={[styles.lineValue, { color: paper.text }]}>{formatUiDecimal(l.value, language)}</Text>
                </View>
              ))
            : [1, 2, 3, 4].map((i) => (
                <View key={i} style={styles.lineRow} testID="preview-skeleton">
                  <View style={[styles.skeletonBarLong, { backgroundColor: paper.skeleton }]} />
                  <View style={[styles.skeletonBarShort, { backgroundColor: paper.skeleton }]} />
                </View>
              ))}
        </View>

        <View style={[styles.divider, { backgroundColor: paper.line }]} />

        <View style={styles.totalsRow}>
          <Text style={[styles.totalLabel, { color: paper.muted }]}>{t("report.totalHours", { hours: formatUiDecimal(totalHours, language) })}</Text>
          <Text style={[styles.totalValue, { color: paper.ink }]}>{totalEarnings}</Text>
        </View>
      </View>

      {tail ? (
        <Pressable
          onPress={() => void copy()}
          style={({ pressed }) => [styles.hashRow, { borderColor: colors.border, backgroundColor: pressed ? colors.surfaceElevated : colors.surface }]}
          accessibilityRole="button"
          accessibilityLabel={t("report.copyHashA11y", { hash: tail })}
          accessibilityHint={t("report.hashHint")}
          testID="preview-hash"
        >
          <Ionicons name="finger-print-outline" size={ICON.sm} color={colors.primary} />
          <View style={styles.hashText}>
            <Text style={[styles.hashLabel, { color: colors.text.secondary }]}>{t("report.hash")}</Text>
            <Text style={[styles.hashValue, { color: colors.text.primary }]}>…{tail}</Text>
          </View>
          <Ionicons name="copy-outline" size={ICON.md} color={colors.text.secondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  inset: { marginHorizontal: TOKENS.layout.screenPadding },
  container: {
    marginHorizontal: 0,
    alignItems: "center",
  },
  docHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: TOKENS.spacing.sm,
    gap: TOKENS.spacing.sm,
  },
  docHeaderText: {
    ...FONT.label,
  },
  paper: {
    width: "100%",
    borderRadius: TOKENS.radius.md,
    padding: TOKENS.spacing.lg,
  },
  paperHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: TOKENS.spacing.sm,
  },
  companyName: {
    ...FONT.paperLabel,
    width: "60%",
  },
  docType: {
    ...FONT.paperKicker,
  },
  divider: {
    height: 1,
    marginVertical: TOKENS.spacing.md,
  },
  detailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: TOKENS.spacing.md,
  },
  label: {
    ...FONT.paperKicker,
    textTransform: "uppercase",
    marginBottom: TOKENS.spacing.xxs,
  },
  value: {
    ...FONT.paperValue,
    ...FONT.tabularNums,
  },
  linesContainer: {
    gap: TOKENS.spacing.md,
    marginBottom: TOKENS.spacing.sm,
    marginTop: TOKENS.spacing.sm,
  },
  lineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  lineLabel: {
    ...FONT.paperLine,
  },
  lineValue: {
    ...FONT.paperLine,
    ...FONT.tabularNums,
  },
  skeletonBarLong: {
    height: TOKENS.spacing.xs,
    borderRadius: TOKENS.radius.hairline,
    width: "65%",
  },
  skeletonBarShort: {
    height: TOKENS.spacing.xs,
    borderRadius: TOKENS.radius.hairline,
    width: "20%",
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: {
    ...FONT.paperLabel,
  },
  totalValue: {
    ...FONT.paperTotal,
  },
  hashRow: {
    marginTop: TOKENS.spacing.sm,
    width: "100%",
    minHeight: TOKENS.layout.minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: TOKENS.spacing.sm,
    borderWidth: TOKENS.layout.hairline,
    borderRadius: TOKENS.radius.md,
    paddingHorizontal: TOKENS.spacing.md,
    paddingVertical: TOKENS.spacing.sm,
  },
  hashText: { flex: 1 },
  hashLabel: { ...FONT.caption },
  hashValue: { ...FONT.paperHash, fontFamily: MONO },
});
