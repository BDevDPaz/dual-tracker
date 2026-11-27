/**
 * ConsentActions — H-5: retirar el consentimiento y repetir el alta, cada uno
 * con confirmación. Va en el aviso de solo lectura (app/legal/disclosure.tsx)
 * y en la sección legal de Ajustes. Retirar solo aparece con el aviso vigente
 * aceptado y repetir solo con el alta completa. Tras confirmar se vuelve al
 * gate («/»), que pide el aviso o el alta antes de operar. Con jornada abierta
 * el router rechaza (BACKUP_OPEN_SESSION) y el aviso de rechazo lo explica.
 */
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { TOKENS } from "../../constants/theme";
import { useBusyAction, useWorkTracker } from "../../core/hooks";
import { selectNeedsDisclaimer, selectNeedsOnboarding } from "../../core/selectors";
import { t, useLanguage } from "../../i18n";
import { ConfirmActionModal } from "../modals/ConfirmActionModal";
import { Button } from "../ui/Button";

type Pending = "WITHDRAW_CONSENT" | "REPEAT_ONBOARDING" | null;

export function ConsentActions() {
  useLanguage();
  const router = useRouter();
  const { state, emit } = useWorkTracker();
  const { busy, run } = useBusyAction();
  const [pending, setPending] = useState<Pending>(null);
  const canWithdraw = !selectNeedsDisclaimer(state);
  const canRepeat = !selectNeedsOnboarding(state);
  if (!canWithdraw && !canRepeat) return null;

  const confirm = () =>
    run(async () => {
      if (!pending) return { ok: true as const };
      const res = await emit({ type: pending });
      setPending(null);
      if (res.ok) router.replace("/");
      return res;
    });

  return (
    <View style={styles.root} testID="consent-actions">
      {canRepeat ? (
        <Button label={t("legal.repeat")} variant="secondary" size="sm" disabled={busy} onPress={() => setPending("REPEAT_ONBOARDING")} testID="consent-repeat" />
      ) : null}
      {canWithdraw ? (
        <Button label={t("legal.withdraw")} variant="danger" size="sm" disabled={busy} onPress={() => setPending("WITHDRAW_CONSENT")} testID="consent-withdraw" />
      ) : null}
      <ConfirmActionModal
        visible={pending === "WITHDRAW_CONSENT"}
        title={t("legal.withdrawTitle")}
        description={t("legal.withdrawBody")}
        confirmLabel={t("legal.withdrawConfirm")}
        tone="danger"
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => void confirm()}
      />
      <ConfirmActionModal
        visible={pending === "REPEAT_ONBOARDING"}
        title={t("legal.repeatTitle")}
        description={t("legal.repeatBody")}
        confirmLabel={t("legal.repeatConfirm")}
        tone="warning"
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => void confirm()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: TOKENS.spacing.sm, marginTop: TOKENS.spacing.md },
});
