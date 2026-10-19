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
import type { OsSettingsTarget, PermissionKey } from "../../src/core/contracts";
import { useWorkTracker } from "../../src/core/hooks";
import { selectHealth } from "../../src/core/selectors";
import { t } from "../../src/i18n";

const CARDS: { key: PermissionKey; title: string; body: string; target: OsSettingsTarget }[] = [
  { key: "locationForeground", title: "onboarding.permFgTitle", body: "onboarding.permFgBody", target: "LOCATION" },
  { key: "locationBackground", title: "onboarding.permBgTitle", body: "onboarding.permBgBody", target: "LOCATION" },
  { key: "notifications", title: "onboarding.permNotifTitle", body: "onboarding.permNotifBody", target: "NOTIFICATIONS" },
];

export default function PermissionsScreen() {
  const router = useRouter();
  const { state, emit } = useWorkTracker();
  const health = selectHealth(state);
  const [busy, setBusy] = useState<PermissionKey | null>(null);

  const request = async (key: PermissionKey) => {
    setBusy(key);
    await emit({ type: "REQUEST_PERMISSION", permission: key });
    setBusy(null);
  };

  const bgDegraded = health.locationBackground === "denied" || health.locationBackground === "blocked";

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <HelpButton screen="permissions" />
      <Text style={[styles.title, { color: TOKENS.colors.text.primary }]}>{t("onboarding.permissionsTitle")}</Text>
      {CARDS.map((c, i) => {
        // Secuencial: una tarjeta se habilita cuando la anterior ya tiene respuesta.
        const prev = i > 0 ? health[CARDS[i - 1].key] : "granted";
        return (
          <PermissionCard
            key={c.key}
            title={t(c.title)}
            body={t(c.body)}
            state={health[c.key]}
            enabled={prev !== "unknown" && busy === null}
            onRequest={() => void request(c.key)}
            onOpenSettings={() => void emit({ type: "OPEN_OS_SETTINGS", target: c.target })}
          />
        );
      })}
      {bgDegraded ? <ScreenStatusBanner status="degraded" message={t("onboarding.degradedBanner")} /> : null}
      <Button label={t("common.continue")} onPress={() => router.push("/(onboarding)/profile")} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: TOKENS.spacing.xl },
  title: { ...FONT.h2, marginBottom: TOKENS.spacing.lg },
});
