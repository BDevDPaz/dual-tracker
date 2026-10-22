import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { FONT, TOKENS } from "../../constants/theme";
import type { OsSettingsTarget, PermissionKey, PermissionState } from "../../core/contracts";
import { t, tHealthValue, useLanguage } from "../../i18n";
import { permissionCardEnabled } from "../../utils/permissionChain";
import {
  backgroundDegraded,
  backgroundGuidance,
  batteryGuidance,
  continuePresentation,
  firstPendingIndex,
  notificationGuidance,
  showBatteryCard,
  type BatteryOptimizationState,
  type GuidanceModel,
} from "../../utils/permissionGuidance";
import { Button } from "../ui/Button";
import { PermissionCard, type PermissionGuidanceContent } from "./PermissionCard";
import { ScreenStatusBanner } from "./ScreenStatusBanner";

const CARDS: { key: PermissionKey; title: string; body: string; target: OsSettingsTarget }[] = [
  { key: "locationForeground", title: "onboarding.permFgTitle", body: "onboarding.permFgBody", target: "LOCATION" },
  { key: "locationBackground", title: "onboarding.permBgTitle", body: "onboarding.permBgBody", target: "LOCATION" },
  { key: "notifications", title: "onboarding.permNotifTitle", body: "onboarding.permNotifBody", target: "NOTIFICATIONS" },
];

interface Props {
  foreground: PermissionState;
  background: PermissionState;
  notifications: PermissionState;
  battery: BatteryOptimizationState;
  platform: string;
  apiLevel: number | null;
  samsung: boolean;
  busy: boolean;
  attempted: Partial<Record<PermissionKey, boolean>>;
  onRequest: (key: PermissionKey) => void;
  onOpenSettings: (target: OsSettingsTarget) => void;
  onContinue: () => void;
  /** Se lee después del título (botón de ayuda). */
  titleAccessory?: React.ReactNode;
}

function contentFor(model: GuidanceModel): PermissionGuidanceContent {
  return {
    body: t(model.bodyKey),
    steps: model.stepKeys.map((key) => t(key)),
    extras: model.extraKeys.map((key) => t(key)),
    actionLabel: t(model.actionLabelKey),
    accessibilityLabel: t("a11y.permissionSettings", { title: t(model.titleKey) }),
  };
}

/** Paso de permisos. El aviso va encima de las tarjetas y Continuar nunca se deshabilita. */
export function PermissionsStep({
  foreground,
  background,
  notifications,
  battery,
  platform,
  apiLevel,
  samsung,
  busy,
  attempted,
  onRequest,
  onOpenSettings,
  onContinue,
  titleAccessory,
}: Props) {
  useLanguage();
  const states: Record<PermissionKey, PermissionState> = {
    locationForeground: foreground,
    locationBackground: background,
    notifications,
  };
  const enabled = CARDS.map((card, index) =>
    permissionCardEnabled(index === 0 ? null : states[CARDS[index - 1].key], index === 0 ? false : attempted[CARDS[index - 1].key] === true, busy),
  );
  const pending = firstPendingIndex(
    CARDS.map((card) => states[card.key]),
    enabled,
  );
  const next = continuePresentation(states);
  const batteryVisible = showBatteryCard({ platform, battery });
  const batteryGuide = batteryGuidance({ platform, battery, samsung });
  const batteryPending = pending < 0 && batteryVisible && battery !== "unrestricted";
  const context = { platform, apiLevel, foreground, background, notifications };

  return (
    <>
      <View style={styles.titleRow}>
        <Text style={[styles.title, styles.titleFlex, { color: TOKENS.colors.text.primary }]}>{t("onboarding.permissionsTitle")}</Text>
        {titleAccessory}
      </View>
      {backgroundDegraded(background) ? <ScreenStatusBanner status="degraded" message={t("onboarding.degradedBanner")} /> : null}
      {next.tone === "limited" ? <ScreenStatusBanner status="degraded" message={t("onboarding.limitedBanner")} /> : null}
      {CARDS.map((card, index) => {
        const guide =
          card.key === "locationBackground"
            ? backgroundGuidance(context)
            : card.key === "notifications"
              ? notificationGuidance(context)
              : null;
        return (
          <PermissionCard
            key={card.key}
            testID={`permission-${card.key}`}
            title={t(card.title)}
            body={t(card.body)}
            state={states[card.key]}
            enabled={enabled[index]}
            highlighted={pending === index}
            guidance={guide ? contentFor(guide) : null}
            onRequest={() => onRequest(card.key)}
            onOpenSettings={() => onOpenSettings(card.target)}
          />
        );
      })}
      {batteryVisible ? (
        <PermissionCard
          testID="permission-battery"
          title={t("onboarding.permBatteryTitle")}
          body={t("onboarding.permBatteryBody")}
          state={battery === "unrestricted" ? "granted" : battery === "restricted" ? "denied" : "unknown"}
          statusLabel={tHealthValue(battery)}
          enabled={!busy}
          highlighted={batteryPending}
          hideRequest
          guidance={batteryGuide ? contentFor(batteryGuide) : null}
          onRequest={() => onOpenSettings("BATTERY")}
          onOpenSettings={() => onOpenSettings("BATTERY")}
        />
      ) : null}
      <Button label={t(next.labelKey)} variant={next.tone === "ready" ? "primary" : "secondary"} disabled={!next.enabled} onPress={onContinue} />
    </>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.sm },
  title: { ...FONT.h2, marginBottom: TOKENS.spacing.lg },
  titleFlex: { flex: 1 },
});
