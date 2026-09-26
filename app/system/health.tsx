/**
 * system/health.tsx — Salud operativa (Producto §5.15). NUEVO.
 * Ocho sensores: locationForeground, locationBackground, notifications,
 * foregroundService, batteryOptimization, clockDrift, isMonitoring,
 * lastSpatialFactAt. Cada fila: estado, impacto en integridad ("sin esto no
 * hay VALIDADA") y CTA Reparar hacia el ajuste nativo cuando existe.
 * Intenciones: REQUEST_PERMISSION, OPEN_OS_SETTINGS.
 */
import { ScrollView, StyleSheet, Text } from "react-native";
import { HealthRow } from "../../src/components/blocks";
import { TOKENS, FONT } from "../../src/constants/theme";
import type { HealthSensor, PermissionKey, PermissionState, ViewIntent } from "../../src/core/contracts";
import { useWorkTracker } from "../../src/core/hooks";
import { selectActiveSession, selectHealth, selectSystemHealth } from "../../src/core/selectors";
import { t } from "../../src/i18n";
import { formatDate, formatTime } from "../../src/utils/dateUtils";

interface Row {
  sensor: HealthSensor;
  value: string;
  ok: boolean;
  blocksValid: boolean;
  repair?: ViewIntent;
}

export default function HealthScreen() {
  const { state, emit } = useWorkTracker();
  const h = selectHealth(state);
  const sys = selectSystemHealth(state);
  const hasOpenSession = !!selectActiveSession(state);

  const permRepair = (key: PermissionKey, s: PermissionState, target: "LOCATION" | "NOTIFICATIONS"): ViewIntent =>
    s === "blocked" || s === "denied" ? { type: "OPEN_OS_SETTINGS", target } : { type: "REQUEST_PERMISSION", permission: key };

  // TODO(propuesta): qué sensores bloquean VALIDADA además de ubicación/FGS/reloj (tabla no cerrada en §5.15).
  const rows: Row[] = [
    { sensor: "locationForeground", value: t(`permission.${h.locationForeground}`), ok: h.locationForeground === "granted", blocksValid: true, repair: permRepair("locationForeground", h.locationForeground, "LOCATION") },
    { sensor: "locationBackground", value: t(`permission.${h.locationBackground}`), ok: h.locationBackground === "granted", blocksValid: true, repair: permRepair("locationBackground", h.locationBackground, "LOCATION") },
    { sensor: "notifications", value: t(`permission.${h.notifications}`), ok: h.notifications === "granted", blocksValid: false, repair: permRepair("notifications", h.notifications, "NOTIFICATIONS") },
    { sensor: "foregroundService", value: h.foregroundService, ok: h.foregroundService === "running" || h.foregroundService === "n/a" || !hasOpenSession, blocksValid: true, repair: { type: "OPEN_OS_SETTINGS", target: "APP" } },
    { sensor: "batteryOptimization", value: h.batteryOptimization, ok: h.batteryOptimization !== "restricted", blocksValid: false, repair: { type: "OPEN_OS_SETTINGS", target: "BATTERY" } },
    { sensor: "clockDriftMs", value: `${Math.round(h.clockDriftMs / 1000)} s`, ok: !h.clockDriftExceeded, blocksValid: true },
    { sensor: "isMonitoring", value: h.isMonitoring ? t("health.ok") : "—", ok: h.isMonitoring || !hasOpenSession, blocksValid: true },
    { sensor: "lastSpatialFactAt", value: h.lastSpatialFactAt ? `${formatDate(h.lastSpatialFactAt)} ${formatTime(h.lastSpatialFactAt)}` : "—", ok: true, blocksValid: false },
  ];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={[styles.mode, { color: sys.degraded ? TOKENS.colors.status.warning : TOKENS.colors.status.success }]}>
        {t(`health.modes.${sys.traceMode}`)}
        {sys.degraded ? ` · ${t("screen.degraded")}` : ""}
      </Text>
      {rows.map((r) => (
        <HealthRow
          key={r.sensor}
          label={t(`health.sensors.${r.sensor}`)}
          value={r.value}
          ok={r.ok}
          blocksValid={r.blocksValid}
          onRepair={r.repair ? () => void emit(r.repair!) : undefined}
        />
      ))}
      {h.checkedAtMs ? (
        <Text style={[styles.caption, { color: TOKENS.colors.text.muted }]}>
          {formatDate(h.checkedAtMs)} {formatTime(h.checkedAtMs)}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: TOKENS.spacing.lg, paddingBottom: TOKENS.spacing["3xl"] },
  mode: { ...FONT.bodyStrong, marginBottom: TOKENS.spacing.md },
  caption: { ...FONT.caption, marginTop: TOKENS.spacing.md, textAlign: "right" },
});
