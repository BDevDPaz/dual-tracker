import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FONT, TOKENS } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import type { OsSettingsTarget, PermissionKey, PermissionState } from "../../core/contracts";
import { t, tHealthValue, useLanguage } from "../../i18n";
import {
  backgroundBundleActive,
  preciseLocationOk,
  type LocationAccuracy,
  type PermissionSubstep,
} from "../../onboarding/flow";
import { ANDROID_11_API, showBatteryCard, type BatteryOptimizationState } from "../../utils/permissionGuidance";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { ModalShell } from "../ui/ModalShell";
import { StatusPill } from "../ui/StatusPill";

interface Props {
  step: PermissionSubstep;
  /** 1-based, para «Permisos · N de 3». */
  index: number;
  total: number;
  foreground: PermissionState;
  accuracy: LocationAccuracy;
  background: PermissionState;
  notifications: PermissionState;
  battery: BatteryOptimizationState;
  platform: string;
  apiLevel: number | null;
  busy: boolean;
  /** Hora ya formateada del recordatorio («7:00 AM»). */
  reminderLabel: string;
  onRequest: (key: PermissionKey) => void;
  onOpenSettings: (target: OsSettingsTarget) => void;
  /** Sale de este subpaso. No vuelve a exigir la ubicación precisa. */
  onAdvance: () => void;
  titleAccessory?: React.ReactNode;
}

function StateBadge({ label, ok, unknown }: { label: string; ok: boolean; unknown: boolean }) {
  const tone = ok ? "success" : unknown ? "neutral" : "warning";
  return <StatusPill tone={tone} label={label} />;
}

/** Un subpaso del alta. El visto sale del estado real, no de un intento local. */
export function PermissionsStep({
  step,
  index,
  total,
  foreground,
  accuracy,
  background,
  notifications,
  battery,
  platform,
  apiLevel,
  busy,
  reminderLabel,
  onRequest,
  onOpenSettings,
  onAdvance,
  titleAccessory,
}: Props) {
  useLanguage();
  const { colors } = useTheme();
  const [sheet, setSheet] = useState<"skip" | "later" | null>(null);
  const [oemOpen, setOemOpen] = useState(false);
  const precise = preciseLocationOk(foreground, accuracy);
  const approximate = foreground === "granted" && accuracy === "coarse";
  const bundleOn = backgroundBundleActive({ platform, background, battery });
  const batteryVisible = showBatteryCard({ platform, battery });
  const androidAlways = platform === "android" && (apiLevel == null || apiLevel >= ANDROID_11_API);
  const notifGranted = notifications === "granted";

  const leaveBackground = () => {
    if (bundleOn) onAdvance();
    else setSheet("skip");
  };
  const leaveNotifications = () => {
    if (notifGranted) onAdvance();
    else setSheet("later");
  };

  const title =
    step === "fine" ? t("onboarding.permFineTitle") : step === "background" ? t("onboarding.permBgScreenTitle") : t("onboarding.permNotifScreenTitle");
  const subtitle =
    step === "background"
      ? t(batteryVisible ? "onboarding.permBgScreenSubtitle" : "onboarding.permBgOnlySubtitle")
      : step === "notifications"
        ? t("onboarding.permNotifScreenBody")
        : null;

  return (
    <View style={styles.stack}>
      <Text style={[styles.counter, { color: colors.text.secondary }]}>{t("onboarding.permCounter", { n: index, total })}</Text>
      <View style={styles.titleRow}>
        <Text style={[styles.title, styles.titleFlex, { color: colors.text.primary }]}>{title}</Text>
        {titleAccessory}
      </View>
      {subtitle ? <Text style={[styles.body, { color: colors.text.secondary }]}>{subtitle}</Text> : null}

      {step === "fine" ? (
        <Card testID="permission-fine" style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={[styles.cardTitle, { color: colors.text.primary }]}>{t("onboarding.permFineTitle")}</Text>
            <StateBadge
              label={approximate ? t("health.approximateValue") : t(`permission.${foreground}`)}
              ok={precise}
              unknown={foreground === "unknown"}
            />
          </View>
          <Text style={[styles.body, { color: colors.text.secondary }]}>{t("onboarding.permFineBody")}</Text>
          {approximate ? <Text style={[styles.body, { color: colors.text.secondary }]}>{t("health.approximateWarning")}</Text> : null}
          {precise ? null : foreground === "blocked" || approximate ? (
            <Button label={t("onboarding.permOpenSettings")} variant="secondary" disabled={busy} onPress={() => onOpenSettings("LOCATION")} />
          ) : (
            <Button label={t("onboarding.permRequest")} disabled={busy} onPress={() => onRequest("locationForeground")} />
          )}
        </Card>
      ) : null}

      {step === "background" ? (
        <>
          <Card testID="permission-background" style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={[styles.cardTitle, { color: colors.text.primary }]}>{t("onboarding.permBgTitle")}</Text>
              <StateBadge label={t(`permission.${background}`)} ok={background === "granted"} unknown={background === "unknown"} />
            </View>
            <Text style={[styles.body, { color: colors.text.secondary }]}>
              {androidAlways ? t("onboarding.permBgAlwaysBody") : t("onboarding.permBgBody")}
            </Text>
            {androidAlways ? <Text style={[styles.body, { color: colors.text.primary }]}>{t("onboarding.permBgStepAlways")}</Text> : null}
            <Button
              label={androidAlways || background === "blocked" ? t("onboarding.permGoSettings") : t("onboarding.permRequest")}
              variant="secondary"
              disabled={busy}
              onPress={() => (androidAlways || background === "blocked" ? onOpenSettings("LOCATION") : onRequest("locationBackground"))}
            />
          </Card>
          {batteryVisible ? (
            <Card testID="permission-battery" style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={[styles.cardTitle, { color: colors.text.primary }]}>{t("onboarding.permBatteryTitle")}</Text>
                <StateBadge label={tHealthValue(battery)} ok={battery === "unrestricted"} unknown={battery === "unknown"} />
              </View>
              <Text style={[styles.body, { color: colors.text.secondary }]}>{t("onboarding.permBatteryBody")}</Text>
              <Button label={t("onboarding.permActivate")} disabled={busy} onPress={() => onOpenSettings("BATTERY")} />
              <Pressable onPress={() => setOemOpen((open) => !open)} accessibilityRole="button">
                <Text style={[styles.link, { color: colors.goldText }]}>{t("onboarding.permOemLink")}</Text>
              </Pressable>
              {oemOpen ? (
                <View style={styles.steps} testID="permission-oem-steps">
                  <Text style={[styles.body, { color: colors.text.secondary }]}>{`1. ${t("onboarding.permBatteryStepSettings")}`}</Text>
                  <Text style={[styles.body, { color: colors.text.secondary }]}>{`2. ${t("onboarding.permBatteryStepUnrestricted")}`}</Text>
                  <Text style={[styles.body, { color: colors.text.secondary }]}>{t("onboarding.permBatterySamsung")}</Text>
                  <Text style={[styles.body, { color: colors.text.secondary }]}>{t("onboarding.permOemXiaomi")}</Text>
                </View>
              ) : null}
            </Card>
          ) : null}
        </>
      ) : null}

      {step === "notifications" ? (
        <Card testID="permission-notifications" style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={[styles.cardTitle, { color: colors.text.primary }]}>{t("onboarding.permNotifTitle")}</Text>
            <StateBadge label={t(`permission.${notifications}`)} ok={notifGranted} unknown={notifications === "unknown"} />
          </View>
          <Text style={[styles.body, { color: colors.text.secondary }]}>{t("onboarding.permNotifAround", { time: reminderLabel })}</Text>
          {notifGranted ? null : notifications === "blocked" ? (
            <Button label={t("onboarding.permOpenSettings")} variant="secondary" disabled={busy} onPress={() => onOpenSettings("NOTIFICATIONS")} />
          ) : (
            <Button label={t("onboarding.permNotifAllow")} disabled={busy} onPress={() => onRequest("notifications")} />
          )}
        </Card>
      ) : null}

      {step === "fine" ? (
        <Button
          testID="onboarding-continue"
          label={t("common.continue")}
          disabled={!precise || busy}
          onPress={() => {
            if (!precise || busy) return;
            onAdvance();
          }}
        />
      ) : (
        <View style={styles.actions}>
          <Button
            label={t("onboarding.permNotNow")}
            variant="ghost"
            disabled={busy}
            onPress={step === "background" ? leaveBackground : leaveNotifications}
          />
          <Button
            testID="onboarding-continue"
            label={t("common.continue")}
            disabled={busy}
            onPress={step === "background" ? leaveBackground : leaveNotifications}
          />
        </View>
      )}

      {sheet === "skip" ? (
        <ModalShell
          visible
          title={t("onboarding.permSkipTitle")}
          description={t("onboarding.permSkipBody")}
          onClose={() => setSheet(null)}
          showCloseButton={false}
          testID="perm-skip-sheet"
          secondaryAction={{ label: t("common.back"), onPress: () => setSheet(null) }}
          primaryAction={{
            label: t("onboarding.permSkipConfirm"),
            onPress: () => {
              setSheet(null);
              onAdvance();
            },
          }}
        />
      ) : null}
      {sheet === "later" ? (
        <ModalShell
          visible
          title={t("onboarding.permNotifLaterTitle")}
          description={t("onboarding.permNotifLaterBody")}
          onClose={() => setSheet(null)}
          showCloseButton={false}
          testID="perm-later-sheet"
          secondaryAction={{ label: t("common.back"), onPress: () => setSheet(null) }}
          primaryAction={{
            label: t("common.continue"),
            onPress: () => {
              setSheet(null);
              onAdvance();
            },
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: TOKENS.spacing.md },
  counter: { ...FONT.caption },
  titleRow: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.sm },
  title: { ...FONT.h2 },
  titleFlex: { flex: 1 },
  card: { padding: TOKENS.spacing.lg, gap: TOKENS.spacing.sm },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: TOKENS.spacing.sm },
  cardTitle: { ...FONT.bodyStrong, flex: 1 },
  body: { ...FONT.bodySmall },
  link: { ...FONT.bodyStrong },
  steps: { gap: TOKENS.spacing.xs },
  actions: { gap: TOKENS.spacing.sm },
});
