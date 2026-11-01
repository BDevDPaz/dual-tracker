/**
 * (onboarding)/permissions.tsx — Un solo route, tres subpasos visuales.
 * 1 ubicación precisa (obligatoria). 2 segundo plano + batería (opcional).
 * 3 notificaciones (opcional; Android 12 y anteriores no tienen este paso).
 * El estado sale de PermissionsHealthService. Continuar del paso 2 no
 * vuelve a pedir la ubicación precisa.
 */
import { useState } from "react";
import { Platform, ScrollView, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { HelpButton } from "../../src/components/support/HelpButton";
import { PermissionsStep } from "../../src/components/blocks/PermissionsStep";
import { TOKENS } from "../../src/constants/theme";
import { useResponsive } from "../../src/components/ui/responsive";
import type { OsSettingsTarget, PermissionKey } from "../../src/core/contracts";
import { useBusyAction, useWorkTracker } from "../../src/core/hooks";
import { selectHealth, selectSettings } from "../../src/core/selectors";
import { formatReminderClock, permissionSubsteps, readDeviceHour24, substepIndex } from "../../src/onboarding/flow";
import { androidApiLevel } from "../../src/utils/permissionGuidance";

export default function PermissionsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ focus?: string }>();
  const focus = typeof params.focus === "string" ? params.focus : undefined;
  const { state, emit } = useWorkTracker();
  const health = selectHealth(state);
  const reminder = selectSettings(state).profile.dailyReminderTime;
  const { busy, run } = useBusyAction();
  const { screenPadding } = useResponsive();
  const platform = Platform.OS;
  const apiLevel = androidApiLevel(platform, Platform.Version);
  const steps = permissionSubsteps(platform, apiLevel);
  const [index, setIndex] = useState(() => substepIndex(steps, focus));
  const step = steps[Math.min(index, steps.length - 1)] ?? "fine";

  const request = (key: PermissionKey) =>
    run(async () => {
      const res = await emit({ type: "REQUEST_PERMISSION", permission: key });
      if (res.ok && res.data === "unknown") return { ok: false as const, code: "ERROR" };
      return res;
    });

  const openSettings = (target: OsSettingsTarget) => run(() => emit({ type: "OPEN_OS_SETTINGS", target }));

  const onAdvance = () => {
    if (index < steps.length - 1) setIndex(index + 1);
    else router.push("/(onboarding)/profile");
  };

  return (
    <ScrollView contentContainerStyle={[styles.content, { padding: screenPadding }]} keyboardShouldPersistTaps="handled">
      <PermissionsStep
        titleAccessory={<HelpButton screen="permissions" />}
        step={step}
        index={index + 1}
        total={steps.length}
        foreground={health.locationForeground}
        accuracy={health.locationAccuracy}
        background={health.locationBackground}
        notifications={health.notifications}
        battery={health.batteryOptimization}
        platform={platform}
        apiLevel={apiLevel}
        busy={busy}
        reminderLabel={formatReminderClock(reminder, readDeviceHour24())}
        onRequest={(key) => void request(key)}
        onOpenSettings={(target) => void openSettings(target)}
        onAdvance={onAdvance}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: TOKENS.spacing.md },
});
