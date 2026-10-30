import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";

interface DocumentPreviewWidgetProps {
  employeeName: string;
  dateRange: string;
  totalHours: string;
  totalEarnings: string;
}

export function DocumentPreviewWidget({
  employeeName,
  dateRange,
  totalHours,
  totalEarnings,
}: DocumentPreviewWidgetProps) {
  const { tokens } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { marginHorizontal: tokens.layout.screenPadding, alignItems: "center" },
        docHeader: {
          flexDirection: "row",
          alignItems: "center",
          marginBottom: tokens.spacing.sm,
          gap: 6,
        },
        docHeaderText: { ...FONT.label },
        paper: {
          width: "100%",
          backgroundColor: "#EAECEE",
          borderRadius: tokens.radius.md,
          padding: tokens.spacing.lg,
        },
        paperHeaderRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: tokens.spacing.sm,
        },
        companyName: { fontSize: 11, fontWeight: "800", color: "#1A1A1A", width: "60%" },
        docType: { fontSize: 9, fontWeight: "800", color: "#666666", letterSpacing: 1 },
        divider: { height: 1, backgroundColor: "#CCCCCC", marginVertical: tokens.spacing.md },
        detailsRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: tokens.spacing.md,
        },
        label: {
          fontSize: 9,
          fontWeight: "700",
          color: "#888888",
          textTransform: "uppercase",
          marginBottom: 2,
        },
        value: { fontSize: 12, fontWeight: "700", color: "#333333" },
        skeletonContainer: {
          gap: 10,
          marginBottom: tokens.spacing.sm,
          marginTop: tokens.spacing.sm,
        },
        skeletonRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        },
        skeletonBarLong: { height: 5, backgroundColor: "#D1D5DB", borderRadius: 3, width: "65%" },
        skeletonBarShort: { height: 5, backgroundColor: "#D1D5DB", borderRadius: 3, width: "20%" },
        totalsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
        totalLabel: { fontSize: 11, fontWeight: "800", color: "#666666" },
        totalValue: { fontSize: 18, fontWeight: "800", color: "#1A1A1A", letterSpacing: -0.5 },
      }),
    [tokens],
  );

  return (
    <View style={styles.container}>
      <View style={styles.docHeader}>
        <Ionicons name="document-text-outline" size={14} color={tokens.colors.primary} />
        <Text style={[styles.docHeaderText, { color: tokens.colors.text.secondary }]}>
          Vista previa del reporte
        </Text>
      </View>
      <View style={[styles.paper, tokens.shadows.md]}>
        <View style={styles.paperHeaderRow}>
          <Text style={styles.companyName}>Dual Tracker</Text>
          <Text style={styles.docType}>Reporte semanal</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.detailsRow}>
          <View>
            <Text style={styles.label}>Nombre</Text>
            <Text style={styles.value}>{employeeName}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.label}>Periodo</Text>
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
          <Text style={styles.totalLabel}>Total horas: {totalHours}</Text>
          <Text style={styles.totalValue}>{totalEarnings}</Text>
        </View>
      </View>
    </View>
  );
}
