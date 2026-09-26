/**
 * (boot)/hydrating.tsx — Rehidratación (Producto §5.2).
 * Marca centrada + "Restaurando expediente…". Nunca ofrece "Iniciar jornada".
 * Cuando el store queda hidratado vuelve al gate, que decide el destino; si
 * había una jornada ACTIVA, Hoy abre ya en ese estado (store hidratado).
 * El aviso de OS_KILL lo emite boot() vía FeedbackService.
 */
import { useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { AppBrandTitle, Button } from "../../src/components/ui";
import { TOKENS, FONT } from "../../src/constants/theme";
import { useWorkTracker } from "../../src/core/hooks";
import { selectBootError, selectIsHydrated } from "../../src/core/selectors";
import { boot } from "../../src/core/boot";
import { t } from "../../src/i18n";

export default function HydratingScreen() {
  const router = useRouter();
  const { state } = useWorkTracker();
  const hydrated = selectIsHydrated(state);
  const bootError = selectBootError(state);

  useEffect(() => {
    if (hydrated) router.replace("/");
  }, [hydrated, router]);

  return (
    <View style={[styles.root, { backgroundColor: TOKENS.colors.background }]}>
      <AppBrandTitle />
      {bootError ? (
        <>
          <Text style={[styles.status, { color: TOKENS.colors.status.danger }]}>{t("boot.error")}</Text>
          <Button label={t("common.retry")} variant="secondary" onPress={() => void boot()} />
        </>
      ) : (
        <>
          <ActivityIndicator color={TOKENS.colors.primary} style={styles.spinner} />
          <Text style={[styles.status, { color: TOKENS.colors.text.secondary }]}>{t("boot.restoring")}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", padding: TOKENS.spacing.xl, gap: TOKENS.spacing.lg },
  spinner: { marginTop: TOKENS.spacing.xl },
  status: { ...FONT.caption, textAlign: "center" },
});
