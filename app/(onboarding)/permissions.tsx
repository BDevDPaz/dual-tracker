import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";

import { ScreenContainer, Card, Button } from "../../src/components/ui";
import { useSystemHealth } from "../../src/core/hooks/dualTracker";
import { FONT } from "../../src/constants/theme";
import { useTheme } from "../../src/context/ThemeContext";

const TOTAL_STEPS = 4;

function OnboardingStepIndicator({ step }: { step: number }) {
  const { tokens } = useTheme();
  const styles = useMemo(() => StyleSheet.create({
    stepRow: { flexDirection: "row", gap: tokens.spacing.sm, marginBottom: tokens.spacing.xl },
    stepDot: { flex: 1, height: 4, borderRadius: tokens.radius.round },
  }), [tokens]);
  return (
    <View style={styles.stepRow}>
      {Array.from({ length: TOTAL_STEPS }).map((_, index) => {
        const isActive = index < step;
        return <View key={index} style={[styles.stepDot, { backgroundColor: isActive ? tokens.colors.primary : tokens.colors.surfaceElevated }]} />;
      })}
    </View>
  );
}

type PermissionStatus = "granted" | "denied" | "unknown";
function statusLabel(status: PermissionStatus): string {
  if (status === "granted") return "Concedido";
  if (status === "denied") return "Denegado";
  return "Sin determinar";
}

function PermissionCard({ icon, title, description, status, onRequest, isRequesting }: {
  icon: React.ComponentProps<typeof Ionicons>["name"]; title: string; description: string;
  status: PermissionStatus; onRequest: () => void; isRequesting: boolean;
}) {
  const { tokens } = useTheme();
  const statusColor = status === "granted" ? tokens.colors.status.success : status === "denied" ? tokens.colors.status.danger : tokens.colors.text.muted;
  const styles = useMemo(() => StyleSheet.create({
    permissionCard: { marginBottom: tokens.spacing.md },
    permissionHeader: { flexDirection: "row", gap: tokens.spacing.md, marginBottom: tokens.spacing.md },
    permissionTitleWrap: { flex: 1 },
    permissionTitle: { ...FONT.bodyStrong, color: tokens.colors.text.primary, marginBottom: tokens.spacing.xs },
    permissionDescription: { ...FONT.caption, color: tokens.colors.text.secondary },
    permissionFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    statusRow: { flexDirection: "row", alignItems: "center", gap: tokens.spacing.xs },
    statusDot: { width: 8, height: 8, borderRadius: tokens.radius.round },
    statusText: { ...FONT.label },
  }), [tokens]);
  return (
    <Card style={styles.permissionCard} variant="elevated">
      <View style={styles.permissionHeader}>
        <Ionicons name={icon} size={24} color={tokens.colors.primary} />
        <View style={styles.permissionTitleWrap}>
          <Text style={styles.permissionTitle}>{title}</Text>
          <Text style={styles.permissionDescription}>{description}</Text>
        </View>
      </View>
      <View style={styles.permissionFooter}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel(status)}</Text>
        </View>
        {status !== "granted" && <Button label="Conceder" variant="secondary" size="sm" isLoading={isRequesting} onPress={onRequest} />}
      </View>
    </Card>
  );
}

export default function PermissionsScreen() {
  const { tokens } = useTheme();
  const router = useRouter();
  const { health, refresh } = useSystemHealth();
  const [requestingKey, setRequestingKey] = useState<"foreground" | "background" | "notifications" | null>(null);
  const locationForeground: PermissionStatus = health?.locationForeground ?? "unknown";
  const locationBackground: PermissionStatus = health?.locationBackground ?? "unknown";
  const notifications: PermissionStatus = health?.notifications ?? "unknown";

  const styles = useMemo(() => StyleSheet.create({
    content: { flex: 1, paddingTop: tokens.spacing.xl, paddingBottom: tokens.spacing.xl },
    title: { ...FONT.h2, color: tokens.colors.text.primary, marginBottom: tokens.spacing.xs },
    subtitle: { ...FONT.body, color: tokens.colors.text.secondary, marginBottom: tokens.spacing.lg },
    banner: { flexDirection: "row", alignItems: "center", gap: tokens.spacing.sm, backgroundColor: tokens.colors.surfaceElevated, borderWidth: 1, borderColor: tokens.colors.status.warning, borderRadius: tokens.radius.md, padding: tokens.spacing.md, marginTop: tokens.spacing.sm, marginBottom: tokens.spacing.lg },
    bannerText: { ...FONT.caption, color: tokens.colors.status.warning, flex: 1 },
    cta: { width: "100%", marginTop: "auto" },
  }), [tokens]);

  const requestForeground = async () => { setRequestingKey("foreground"); try { await Location.requestForegroundPermissionsAsync(); await refresh(); } finally { setRequestingKey(null); } };
  const requestBackground = async () => { setRequestingKey("background"); try { await Location.requestBackgroundPermissionsAsync(); await refresh(); } finally { setRequestingKey(null); } };
  const requestNotifications = async () => { setRequestingKey("notifications"); try { await Notifications.requestPermissionsAsync(); await refresh(); } finally { setRequestingKey(null); } };
  const showDegradedBanner = locationBackground === "denied";

  return (
    <ScreenContainer>
      <View style={styles.content}>
        <OnboardingStepIndicator step={3} />
        <Text style={styles.title}>Permisos que Dual Tracker necesita</Text>
        <Text style={styles.subtitle}>Cada permiso se pide por separado para que sepas exactamente para qué se usa.</Text>
        <PermissionCard icon="navigate-outline" title="Ubicación en uso" description="Necesaria para confirmar tu llegada al sitio (check-in)." status={locationForeground} onRequest={requestForeground} isRequesting={requestingKey === "foreground"} />
        <PermissionCard icon="locate-outline" title="Ubicación en segundo plano" description="Necesaria para el sello VALID y el watchdog de jornada." status={locationBackground} onRequest={requestBackground} isRequesting={requestingKey === "background"} />
        <PermissionCard icon="notifications-outline" title="Notificaciones" description="Para el recordatorio diario y avisos de salida detectada." status={notifications} onRequest={requestNotifications} isRequesting={requestingKey === "notifications"} />
        {showDegradedBanner && (
          <View style={styles.banner}>
            <Ionicons name="warning-outline" size={20} color={tokens.colors.status.warning} />
            <Text style={styles.bannerText}>Modo degradado: las jornadas no podrán certificarse como validadas</Text>
          </View>
        )}
        <Button label="Continuar" variant="primary" size="lg" style={styles.cta} onPress={() => router.push("/(onboarding)/profile")} />
      </View>
    </ScreenContainer>
  );
}
