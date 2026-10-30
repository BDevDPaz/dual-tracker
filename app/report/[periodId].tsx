import React, { useMemo } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useLocalSearchParams, Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import dayjs from "../../src/utils/dayjsSetup";
import {
  ScreenContainer,
  PageHeader,
  Card,
  Section,
  LoadingOverlay,
  EmptyState,
} from "../../src/components/ui";
import { FONT, type AppTokens } from "../../src/constants/theme";
import { useTheme } from "../../src/context/ThemeContext";
import { useReportsCenter, type ReportPeriodKey } from "../../src/core/hooks/dualTracker";
import type { PayrollLine } from "../../src/core/contracts/domain";

const LINE_KIND_LABEL: Record<PayrollLine["kind"], string> = {
  REGULAR: "Regular",
  OVERTIME_DAILY: "Tiempo extra (diario)",
  OVERTIME_WEEKLY: "Tiempo extra (semanal)",
  LUNCH_UNPAID: "Almuerzo no pagado",
  TRANSIT_PAID: "Tránsito pagado",
  DEDUCTION: "Deducción",
};

function isReportPeriodKey(value: string | undefined): value is ReportPeriodKey {
  return value === "CURRENT_WEEK" || value === "PREVIOUS_WEEK";
}

export default function ReportPeriodScreen() {
  const { tokens } = useTheme();
  const styles = useMemo(() => getStyles(tokens), [tokens]);
  const params = useLocalSearchParams<{ periodId: string }>();

  // periodId solo puede llegar como uno de los dos literales de ReportPeriodKey
  // en la práctica, porque esta ruta se alcanza principalmente vía un Link
  // desde la tab Reportes que siempre pasa "CURRENT_WEEK" o "PREVIOUS_WEEK".
  // Cualquier otro valor (deep link malformado, navegación manual) cae de
  // forma silenciosa y segura a CURRENT_WEEK: no hay nada más que "el
  // periodo activo" que este valor pueda representar de forma honesta.
  const period: ReportPeriodKey = isReportPeriodKey(params.periodId)
    ? params.periodId
    : "CURRENT_WEEK";

  const { loading, error, statement, hasConflict, periodStart, periodEnd } =
    useReportsCenter(period);

  const dateRange = useMemo(
    () => `${dayjs(periodStart).format("DD MMM YYYY")} — ${dayjs(periodEnd).format("DD MMM YYYY")}`,
    [periodStart, periodEnd],
  );

  return (
    <ScreenContainer noPadding>
      <PageHeader title="Estado de nómina" subtitle={dateRange} showBack />

      <LoadingOverlay visible={loading} message="Cargando estado de nómina…" />

      <ScrollView contentContainerStyle={styles.content}>
        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={16} color={tokens.colors.status.danger} />
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        ) : null}

        {hasConflict ? (
          <View style={styles.warningBanner}>
            <Ionicons name="warning-outline" size={18} color={tokens.colors.status.warning} />
            <Text style={styles.warningBannerText}>
              Este periodo tiene sesiones sin resolver (CONFLICT). El estimado no está certificado
              hasta que se resuelvan en /system/conflict.
            </Text>
          </View>
        ) : null}

        {!statement && !loading ? (
          <EmptyState
            title="Sin estado de nómina"
            description="No hay líneas calculadas para este periodo."
          />
        ) : null}

        {statement ? (
          <>
            <Card style={styles.card}>
              <Text style={styles.policyCaption}>Política: {statement.policyId}</Text>
              <Text style={styles.hashCaption} selectable>
                Hash: {statement.packHash}
              </Text>
            </Card>

            <Section title="Líneas de nómina">
              <Card style={styles.card}>
                {statement.lines.length === 0 ? (
                  <Text style={styles.emptyLinesText}>Sin líneas en este periodo.</Text>
                ) : (
                  statement.lines.map((line, index) => (
                    <View
                      key={`${line.kind}-${line.sessionId ?? "none"}-${index}`}
                      style={[
                        styles.lineRow,
                        index < statement.lines.length - 1 && styles.lineRowBorder,
                      ]}
                    >
                      <View style={styles.lineRowLeft}>
                        <Text style={styles.lineKind}>{LINE_KIND_LABEL[line.kind]}</Text>
                        <Text style={styles.lineDescription}>{line.description}</Text>
                      </View>
                      <View style={styles.lineRowRight}>
                        <Text style={styles.lineMinutes}>{line.minutes} min</Text>
                        <Text style={styles.lineAmount}>
                          ${line.amount.toFixed(2)} @ ${line.rate.toFixed(2)}/h
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </Card>
            </Section>

            <View style={styles.linkRow}>
              <Ionicons name="document-attach-outline" size={16} color={tokens.colors.primary} />
              <Link href="/(tabs)/reports" style={styles.linkText}>
                Ir a Reportes para generar un expediente sellado
              </Link>
            </View>
          </>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

function getStyles(tokens: AppTokens) {
  return StyleSheet.create({
  content: {
    paddingHorizontal: tokens.layout.screenPadding,
    paddingBottom: tokens.spacing["4xl"],
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.md,
    padding: tokens.spacing.md,
    borderRadius: tokens.radius.md,
    backgroundColor: `${tokens.colors.status.danger}15`,
  },
  errorBannerText: {
    ...FONT.caption,
    color: tokens.colors.status.danger,
    flex: 1,
  },
  warningBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.md,
    padding: tokens.spacing.md,
    borderRadius: tokens.radius.md,
    backgroundColor: `${tokens.colors.status.warning}15`,
  },
  warningBannerText: {
    ...FONT.caption,
    color: tokens.colors.status.warning,
    flex: 1,
  },
  card: {
    marginBottom: tokens.spacing.md,
  },
  policyCaption: {
    ...FONT.caption,
    color: tokens.colors.text.secondary,
    marginBottom: tokens.spacing.xs,
  },
  hashCaption: {
    ...FONT.caption,
    color: tokens.colors.text.muted,
    fontFamily: "monospace",
  },
  emptyLinesText: {
    ...FONT.body,
    color: tokens.colors.text.secondary,
  },
  lineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: tokens.spacing.sm,
  },
  lineRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
  },
  lineRowLeft: {
    flex: 1,
    paddingRight: tokens.spacing.sm,
  },
  lineKind: {
    ...FONT.bodyStrong,
    color: tokens.colors.text.primary,
  },
  lineDescription: {
    ...FONT.caption,
    color: tokens.colors.text.secondary,
  },
  lineRowRight: {
    alignItems: "flex-end",
  },
  lineMinutes: {
    ...FONT.bodyStrong,
    color: tokens.colors.text.primary,
  },
  lineAmount: {
    ...FONT.caption,
    color: tokens.colors.text.secondary,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.md,
  },
  linkText: {
    ...FONT.bodyStrong,
    color: tokens.colors.primary,
  },
  });
}
