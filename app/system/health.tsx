/**
 * system/health.tsx — Salud operativa (Producto §5.15). NUEVO.
 * Ocho sensores: locationForeground, locationBackground, notifications,
 * foregroundService, batteryOptimization, clockDrift, isMonitoring,
 * lastSpatialFactAt. Cada fila: estado, impacto en integridad ("sin esto no
 * hay VALIDADA") y CTA Reparar hacia el ajuste nativo cuando existe.
 * Intenciones: REQUEST_PERMISSION, OPEN_OS_SETTINGS.
 */
import { useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { HealthRow, ScreenStatusBanner } from "../../src/components/blocks";
import { Button, Card, Input, Section } from "../../src/components/ui";
import { PIN_MIN_LENGTH } from "../../src/constants/security";
import { TOKENS, FONT } from "../../src/constants/theme";
import type { HealthSensor, PermissionKey, PermissionState, ViewIntent } from "../../src/core/contracts";
import { useClock, useWorkTracker } from "../../src/core/hooks";
import { selectActiveSession, selectAdmin, selectBackupAdvice, selectCryptoHealth, selectHealth, selectLedgerHealth, selectSystemHealth } from "../../src/core/selectors";
import { t } from "../../src/i18n";
import { formatDateTime } from "../../src/utils/dateUtils";

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
  const ledger = selectLedgerHealth(state);
  const crypto = selectCryptoHealth(state);
  const nowMs = useClock(60_000);
  const backup = selectBackupAdvice(state, nowMs);
  const admin = selectAdmin(state);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const acknowledge = async () => {
    if (!ledger.broken) return;
    setBusy(true);
    await emit({ type: "ACKNOWLEDGE_LEDGER_BREAK", pin, incident: ledger.broken });
    setPin("");
    setBusy(false);
  };

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
    { sensor: "lastSpatialFactAt", value: formatDateTime(h.lastSpatialFactAt), ok: true, blocksValid: false },
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
      <Section title={t("health.ledger.title")}>
        <Card style={styles.card}>
          {ledger.broken ? (
            <>
              <ScreenStatusBanner status="conflict" message={`${t("health.ledger.brokenTitle")} — ${t("health.ledger.brokenBody")}`} />
              {admin.hasPin ? (
                <>
                  <Input label={t("health.ledger.pin")} value={pin} onChangeText={setPin} secureTextEntry keyboardType="number-pad" />
                  <Button label={t("health.ledger.acknowledge")} disabled={busy || pin.length < PIN_MIN_LENGTH} isLoading={busy} onPress={() => void acknowledge()} />
                </>
              ) : (
                <Text style={[styles.hint, { color: TOKENS.colors.text.secondary }]}>{t("settings.adminSetup", { min: PIN_MIN_LENGTH })}</Text>
              )}
            </>
          ) : ledger.acknowledgedBreaks > 0 ? (
            <Text style={[styles.hint, { color: TOKENS.colors.status.warning }]}>{t("health.ledger.acknowledged")}</Text>
          ) : (
            <Text style={[styles.hint, { color: TOKENS.colors.text.secondary }]}>{t("health.ledger.ok")}</Text>
          )}
          {ledger.broken || ledger.acknowledgedBreaks > 0 ? (
            <>
              <Button label={t("health.ledger.export")} variant="secondary" size="sm" disabled={busy} onPress={() => void emit({ type: "EXPORT_LEDGER_INCIDENT" })} />
              <Text style={[styles.hint, { color: TOKENS.colors.text.muted }]}>{t("health.ledger.exportHint")}</Text>
            </>
          ) : null}
        </Card>
      </Section>
      <Section title={t("fieldCrypto.sectionTitle")}>
        <Card style={styles.card}>
          <Text style={[styles.hint, { color: TOKENS.colors.text.secondary }]}>{t(`fieldCrypto.status.${crypto.status}`)}</Text>
          {!crypto.platformSupported ? <ScreenStatusBanner status="degraded" message={t("fieldCrypto.web")} /> : null}
          {crypto.status === "UNAVAILABLE" ? (
            <ScreenStatusBanner status="degraded" message={`${t("fieldCrypto.unavailableTitle")} — ${t("fieldCrypto.unavailableBody")}`} />
          ) : null}
          {crypto.status === "KEY_MISSING" ? (
            <ScreenStatusBanner status="degraded" message={`${t("fieldCrypto.keyMissingTitle")} — ${t("fieldCrypto.keyMissingBody")}`} />
          ) : null}
          <HealthRow
            label={t("backup.title")}
            value={backup.pendingPeriods > 0 ? t("backup.healthRow", { n: backup.pendingPeriods }) : t("backup.healthOk")}
            ok={backup.pendingPeriods === 0}
            blocksValid={false}
          />
        </Card>
      </Section>
      {h.checkedAtMs ? (
        <Text style={[styles.caption, { color: TOKENS.colors.text.muted }]}>
          {formatDateTime(h.checkedAtMs)}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: TOKENS.layout.screenPadding, paddingVertical: TOKENS.spacing.lg, paddingBottom: TOKENS.spacing["3xl"] },
  mode: { ...FONT.bodyStrong, marginBottom: TOKENS.spacing.md },
  caption: { ...FONT.caption, marginTop: TOKENS.spacing.md, textAlign: "right" },
  card: { padding: TOKENS.spacing.lg, gap: TOKENS.spacing.sm },
  hint: { ...FONT.caption },
});
