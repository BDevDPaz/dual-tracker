/**
 * (onboarding)/permissions.tsx — Permisos reales (Producto §5.5).
 * Tres tarjetas secuenciales: ubicación en uso → segundo plano →
 * notificaciones. Estado leído del store (PermissionsHealthService lo
 * publica). Si background se niega, banner de modo degradado; el alta no se
 * bloquea, se degrada la integridad.
 */
import { useState } from "react";
import { Text, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "../../src/components/ui";
import { HelpButton } from "../../src/components/support/HelpButton";
import { PermissionCard, ScreenStatusBanner } from "../../src/components/blocks";
import { TOKENS, FONT } from "../../src/constants/theme";
import { useResponsive } from "../../src/components/ui/responsive";
import type { OsSettingsTarget, PermissionKey } from "../../src/core/contracts";
import { useBusyAction, useWorkTracker } from "../../src/core/hooks";
import { selectHealth } from "../../src/core/selectors";
import { t } from "../../src/i18n";
import { permissionCardEnabled } from "../../src/utils/permissionChain";

const CARDS: { key: PermissionKey; title: string; body: string; target: OsSettingsTarget }[] = [
  { key: "locationForeground", title: "onboarding.permFgTitle", body: "onboarding.permFgBody", target: "LOCATION" },
  { key: "locationBackground", title: "onboarding.permBgTitle", body: "onboarding.permBgBody", target: "LOCATION" },
  { key: "notifications", title: "onboarding.permNotifTitle", body: "onboarding.permNotifBody", target: "NOTIFICATIONS" },
];

export default function PermissionsScreen() {
  const router = useRouter();
  const { state, emit } = useWorkTracker();
  const health = selectHealth(state);
  const { busy, run } = useBusyAction();
  const [attempted, setAttempted] = useState<Partial<Record<PermissionKey, boolean>>>({});

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

  const openSettings = (target: (typeof CARDS)[number]["target"]) => run(() => emit({ type: "OPEN_OS_SETTINGS", target }));

  const bgDegraded = health.locationBackground === "denied" || health.locationBackground === "blocked";
  const { screenPadding } = useResponsive();

  return (
    <ScrollView contentContainerStyle={[styles.content, { padding: screenPadding }]} keyboardShouldPersistTaps="handled">
      <HelpButton screen="permissions" />
      <Text style={[styles.title, { color: TOKENS.colors.text.primary }]}>{t("onboarding.permissionsTitle")}</Text>
      {CARDS.map((c, i) => {
        // Secuencial: una tarjeta se habilita cuando la anterior ya tiene respuesta.
        const prev = i > 0 ? CARDS[i - 1].key : null;
        return (
          <PermissionCard
            key={c.key}
            title={t(c.title)}
            body={t(c.body)}
            state={health[c.key]}
            enabled={permissionCardEnabled(prev ? health[prev] : null, prev ? attempted[prev] === true : false, busy)}
            onRequest={() => void request(c.key)}
            onOpenSettings={() => void openSettings(c.target)}
          />
        );
      })}
      {bgDegraded ? <ScreenStatusBanner status="degraded" message={t("onboarding.degradedBanner")} /> : null}
      <Button label={t("common.continue")} onPress={() => router.push("/(onboarding)/profile")} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: TOKENS.spacing.md },
  title: { ...FONT.h2, marginBottom: TOKENS.spacing.lg },
});
