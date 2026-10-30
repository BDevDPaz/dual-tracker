import React, { useMemo } from "react";
import { View, Text, ScrollView, StyleSheet, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  ScreenContainer,
  PageHeader,
  Card,
  Section,
  Button,
  LoadingOverlay,
} from "../../src/components/ui";
import { FONT, type AppTokens } from "../../src/constants/theme";
import { useTheme } from "../../src/context/ThemeContext";
import { useSystemHealth } from "../../src/core/hooks/dualTracker";

// Tipo local en vez de importar PermissionHealthStatus de
// src/services/PermissionsHealthService -- las rutas de app/ no importan
// directamente de src/services/*, solo consumen la forma ya inferida por
// useSystemHealth().
type PermissionHealthStatus = "granted" | "denied" | "unknown";

const STATUS_LABEL: Record<PermissionHealthStatus, string> = {
  granted: "Concedido",
  denied: "Denegado",
  unknown: "Desconocido",
};

interface SensorRowProps {
  label: string;
  status: PermissionHealthStatus;
  impact: string;
  showRepair?: boolean;
}

function SensorRow({ label, status, impact, showRepair }: SensorRowProps) {
  const { tokens } = useTheme();
  const styles = useMemo(() => getStyles(tokens), [tokens]);
  const STATUS_COLOR: Record<PermissionHealthStatus, string> = {
    granted: tokens.colors.status.success,
    denied: tokens.colors.status.danger,
    unknown: tokens.colors.status.warning,
  };
  return (
    <View style={styles.sensorRow}>
      <View style={styles.sensorRowHeader}>
        <Text style={styles.sensorLabel}>{label}</Text>
        <View style={[styles.statusPill, { backgroundColor: `${STATUS_COLOR[status]}20` }]}>
          <Ionicons
            name={status === "granted" ? "checkmark-circle-outline" : "alert-circle-outline"}
            size={12}
            color={STATUS_COLOR[status]}
          />
          <Text style={[styles.statusPillText, { color: STATUS_COLOR[status] }]}>
            {STATUS_LABEL[status]}
          </Text>
        </View>
      </View>
      <Text style={styles.sensorImpact}>{impact}</Text>
      {showRepair && status !== "granted" ? (
        <Button
          label="Reparar"
          variant="secondary"
          size="sm"
          iconName="settings-outline"
          style={styles.repairButton}
          onPress={() => void Linking.openSettings()}
        />
      ) : null}
    </View>
  );
}

export default function SystemHealthScreen() {
  const { tokens } = useTheme();
  const styles = useMemo(() => getStyles(tokens), [tokens]);
  const { loading, error, health, drift, tasks, refresh } = useSystemHealth();

  return (
    <ScreenContainer noPadding>
      <PageHeader title="Salud del sistema" subtitle="Sensores en vivo, sin caché de UI" showBack />

      <LoadingOverlay visible={loading && !health} message="Leyendo sensores…" />

      <ScrollView contentContainerStyle={styles.content}>
        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={16} color={tokens.colors.status.danger} />
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        ) : null}

        {health ? (
          <Section title="Permisos">
            <Card style={styles.card}>
              <SensorRow
                label="Ubicación en uso"
                status={health.locationForeground}
                impact="Necesaria para check-in y confirmación de llegada."
                showRepair
              />
              <View style={styles.rowDivider} />
              <SensorRow
                label="Ubicación en segundo plano"
                status={health.locationBackground}
                impact="Sin esto no hay sello VALID."
                showRepair
              />
              <View style={styles.rowDivider} />
              <SensorRow
                label="Notificaciones"
                status={health.notifications}
                impact="Sin esto no llegan recordatorios ni la decisión de salida."
                showRepair
              />
            </Card>
          </Section>
        ) : null}

        {health ? (
          <Section title="Servicio en primer plano (Android)">
            <Card style={styles.card}>
              <Text style={styles.value}>
                {health.androidForegroundServiceType === "location"
                  ? "Activo (tipo: ubicación)"
                  : health.androidForegroundServiceType === "none"
                    ? "Inactivo"
                    : "Desconocido"}
              </Text>
              <Text style={styles.sensorImpact}>
                Sin este servicio corriendo, el rastreo en segundo plano puede detenerse cuando el
                sistema operativo suspende la app.
              </Text>
              {health.degraded ? (
                <View style={styles.degradedBanner}>
                  <Ionicons name="warning-outline" size={14} color={tokens.colors.status.warning} />
                  <Text style={styles.degradedBannerText}>
                    Jornada abierta en modo degradado: no puede certificarse como VALID.
                  </Text>
                </View>
              ) : null}
            </Card>
          </Section>
        ) : null}

        {drift ? (
          <Section title="Reloj">
            <Card style={styles.card}>
              <Text style={styles.value}>Desfase: {drift.driftMs} ms</Text>
              {drift.isDrifted ? (
                <Text style={styles.sensorImpactWarning}>
                  La integridad no puede ser VALID mientras el reloj esté desalineado.
                </Text>
              ) : (
                <Text style={styles.sensorImpact}>
                  Reloj alineado con el tiempo monotónico del dispositivo.
                </Text>
              )}
            </Card>
          </Section>
        ) : null}

        <Section title="Tareas en segundo plano">
          <Card style={styles.card}>
            {tasks.map((task, index) => (
              <View
                key={task.name}
                style={[styles.taskRow, index < tasks.length - 1 && styles.rowDivider]}
              >
                <Text style={styles.taskName}>{task.name}</Text>
                <Text style={styles.taskDescription}>{task.description}</Text>
              </View>
            ))}
          </Card>
        </Section>

        <Button
          label="Actualizar"
          variant="ghost"
          iconName="refresh-outline"
          onPress={() => void refresh()}
          style={styles.refreshButton}
        />
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
  card: {
    marginBottom: tokens.spacing.sm,
  },
  sensorRow: {
    paddingVertical: tokens.spacing.sm,
  },
  sensorRowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  sensorLabel: {
    ...FONT.bodyStrong,
    color: tokens.colors.text.primary,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: 2,
    borderRadius: tokens.radius.xs,
  },
  statusPillText: {
    ...FONT.label,
    fontWeight: "700",
  },
  sensorImpact: {
    ...FONT.caption,
    color: tokens.colors.text.secondary,
  },
  sensorImpactWarning: {
    ...FONT.caption,
    color: tokens.colors.status.warning,
  },
  repairButton: {
    marginTop: tokens.spacing.sm,
    alignSelf: "flex-start",
  },
  rowDivider: {
    height: 1,
    backgroundColor: tokens.colors.border,
    marginVertical: tokens.spacing.sm,
  },
  value: {
    ...FONT.bodyStrong,
    color: tokens.colors.text.primary,
    marginBottom: 4,
  },
  degradedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.xs,
    marginTop: tokens.spacing.sm,
    padding: tokens.spacing.sm,
    borderRadius: tokens.radius.sm,
    backgroundColor: `${tokens.colors.status.warning}15`,
  },
  degradedBannerText: {
    ...FONT.caption,
    color: tokens.colors.status.warning,
    flex: 1,
  },
  taskRow: {
    paddingVertical: tokens.spacing.xs,
  },
  taskName: {
    ...FONT.bodyStrong,
    color: tokens.colors.text.primary,
  },
  taskDescription: {
    ...FONT.caption,
    color: tokens.colors.text.secondary,
  },
  refreshButton: {
    marginTop: tokens.spacing.md,
  },
  });
}
