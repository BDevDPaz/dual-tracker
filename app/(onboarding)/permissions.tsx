/**
 * (onboarding)/permissions.tsx — Permisos reales (Producto §5.5).
 * Ubicación en uso → segundo plano → notificaciones, y en Android la
 * optimización de batería (Samsung / One UI incluido). El alta no se
 * bloquea: sin permisos se sigue en modo limitado y el pago no cambia.
 */
import { useState } from "react";
import { Platform, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import * as Device from "expo-device";
import { HelpButton } from "../../src/components/support/HelpButton";
import { PermissionsStep } from "../../src/components/blocks/PermissionsStep";
import { TOKENS } from "../../src/constants/theme";
import { useResponsive } from "../../src/components/ui/responsive";
import type { OsSettingsTarget, PermissionKey } from "../../src/core/contracts";
import { useBusyAction, useWorkTracker } from "../../src/core/hooks";
import { selectHealth } from "../../src/core/selectors";
import { androidApiLevel, isSamsungManufacturer } from "../../src/utils/permissionGuidance";

export default function PermissionsScreen() {
  const router = useRouter();
  const { state, emit } = useWorkTracker();
  const health = selectHealth(state);
  const { busy, run } = useBusyAction();
  const [attempted, setAttempted] = useState<Partial<Record<PermissionKey, boolean>>>({});
  const { screenPadding } = useResponsive();

  const request = (key: PermissionKey) =>
    run(async () => {
      try {
        const res = await emit({ type: "REQUEST_PERMISSION", permission: key });
        // El servicio traga el fallo y devuelve "unknown" con ok: true. Hay que avisarlo.
        if (res.ok && res.data === "unknown") return { ok: false as const, code: "ERROR" };
        return res;
      } finally {
        setAttempted((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
      }
    });

  const openSettings = (target: OsSettingsTarget) => run(() => emit({ type: "OPEN_OS_SETTINGS", target }));

  return (
    <ScrollView contentContainerStyle={[styles.content, { padding: screenPadding }]} keyboardShouldPersistTaps="handled">
      <PermissionsStep
        titleAccessory={<HelpButton screen="permissions" />}
        foreground={health.locationForeground}
        background={health.locationBackground}
        notifications={health.notifications}
        battery={health.batteryOptimization}
        platform={Platform.OS}
        apiLevel={androidApiLevel(Platform.OS, Platform.Version)}
        samsung={isSamsungManufacturer(Device.brand, Device.manufacturer)}
        busy={busy}
        attempted={attempted}
        onRequest={(key) => void request(key)}
        onOpenSettings={(target) => void openSettings(target)}
        onContinue={() => router.push("/(onboarding)/profile")}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: TOKENS.spacing.md },
});
