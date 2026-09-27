import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { TOKENS, FONT } from "../../constants/theme";
import { t } from "../../i18n";

interface DocumentPreviewWidgetProps {
  employeeName: string;
  dateRange: string;
  totalHours: string;
  totalEarnings: string;
  /** Nombre de empresa desde CompanyPolicy (antes "GEOTrack Solutions Inc." en duro). */
  companyName?: string;
  /** Sello visible cuando el periodo tiene CONFLICT. */
  certified?: boolean;
  /**
   * El margen lateral es de la PANTALLA (ScreenContainer o el contentContainer
   * del ScrollView). true solo si se usa fuera de un contenedor con padding.
   */
  inset?: boolean;
}

export function DocumentPreviewWidget({
  employeeName,
  dateRange,
  totalHours,
  totalEarnings,
  companyName = "",
  certified = true,
  inset = false,
}: DocumentPreviewWidgetProps) {
  return (
    <View style={[styles.container, inset && styles.inset]}>
      <View style={styles.docHeader}>
        <Ionicons
          name="document-text-outline"
          size={14}
          color={TOKENS.colors.primary}
        />
        <Text
          style={[
            styles.docHeaderText,
            { color: TOKENS.colors.text.secondary },
          ]}
        >
          {t("report.previewTitle")}
        </Text>
      </View>

      <View style={[styles.paper, TOKENS.shadows.md]}>
        <View style={styles.paperHeaderRow}>
          <Text style={styles.companyName}>{companyName || "—"}</Text>
          <Text style={styles.docType}>{certified ? t("report.statement") : `${t("report.statement")} · ${t("report.uncertified").toUpperCase()}`}</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.detailsRow}>
          <View>
            <Text style={styles.label}>{t("report.name")}</Text>
            <Text style={styles.value}>{employeeName}</Text>
          </View>

          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.label}>{t("report.period")}</Text>
            <Text style={styles.value}>{dateRange}</Text>
          </View>
        </View>

        <View style={styles.skeletonContainer}>
          {[1, 2, 3, 4].map((i) => (
            <View key={i} style={styles.skeletonRow}>
              <View style={styles.skeletonBarLong} />
              <View style={styles.skeletonBarShort} />
            </View>
          ))}
        </View>

        <View style={styles.divider} />

        <View style={styles.totalsRow}>
          <Text style={styles.totalLabel}>{t("report.totalHours", { hours: totalHours })}</Text>
          <Text style={styles.totalValue}>{totalEarnings}</Text>
        </View>
      </View>
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
    gap: 6,
  },
  docHeaderText: {
    ...FONT.label,
  },
  paper: {
    width: "100%",
    backgroundColor: "#EAECEE",
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
    fontSize: 11,
    fontWeight: "800",
    color: "#1A1A1A",
    width: "60%",
  },
  docType: {
    fontSize: 9,
    fontWeight: "800",
    color: "#666666",
    letterSpacing: 1,
  },
  divider: {
    height: 1,
    backgroundColor: "#CCCCCC",
    marginVertical: TOKENS.spacing.md,
  },
  detailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: TOKENS.spacing.md,
  },
  label: {
    fontSize: 9,
    fontWeight: "700",
    color: "#888888",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  value: {
    fontSize: 12,
    fontWeight: "700",
    color: "#333333",
  },
  skeletonContainer: {
    gap: 10,
    marginBottom: TOKENS.spacing.sm,
    marginTop: TOKENS.spacing.sm,
  },
  skeletonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  skeletonBarLong: {
    height: 5,
    backgroundColor: "#D1D5DB",
    borderRadius: 3,
    width: "65%",
  },
  skeletonBarShort: {
    height: 5,
    backgroundColor: "#D1D5DB",
    borderRadius: 3,
    width: "20%",
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#666666",
  },
  totalValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1A1A1A",
    letterSpacing: -0.5,
  },
});
