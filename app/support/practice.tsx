/**
 * Modo práctica. El simulador vive en src/support/practice.ts (AsyncStorage
 * `dt.practice.v1`). Esta pantalla no emite intenciones de jornada.
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useNavigation, useRouter } from "expo-router";
import { Button, Card, Input, IntegrityBadge, SAFE_EDGES, ScreenScroll, StatusPill } from "../../src/components/ui";
import { useFormFocusChain } from "../../src/components/ui/formChain";
import { FORM_FIELDS } from "../../src/components/ui/formFields";
import { ScreenStatusBanner, KeyValueRow } from "../../src/components/blocks";
import { LanguageSwitch } from "../../src/components/support/LanguageSwitch";
import { TOKENS, FONT } from "../../src/constants/theme";
import { usePractice } from "../../src/core/hooks";
import { getSessionStateUI } from "../../src/core/selectors";
import { t, useLanguage } from "../../src/i18n";
import { practicePhase, type PracticeAction, type PracticeCode } from "../../src/support/practice";

export default function PracticeScreen() {
  useLanguage();
  const router = useRouter();
  const navigation = useNavigation();
  const { snapshot, enter, exit, dispatch } = usePractice();
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState<null | "edit" | "forgot">(null);
  const [error, setError] = useState<PracticeCode | null>(null);
  const [statement, setStatement] = useState(false);

  useEffect(() => {
    void enter();
  }, [enter]);

  useEffect(() => {
    const unsub = navigation.addListener("beforeRemove", () => {
      void exit();
    });
    return unsub;
  }, [navigation, exit]);

  const phase = practicePhase(snapshot);
  const ui = getSessionStateUI(phase);
  const session = snapshot.session;

  const run = async (action: PracticeAction) => {
    const res = await dispatch(action);
    if (!res.ok) setError(res.code);
    else {
      setError(null);
      setAsking(null);
      setNote("");
    }
  };
  const noteChain = useFormFocusChain(FORM_FIELDS.practiceNote, {
    canSubmit: asking !== null,
    onSubmit: () => {
      if (!asking) return;
      void run(asking === "edit" ? { type: "EDIT_NOTE", note } : { type: "FORGOT_CLOCK", note });
    },
  });

  const leave = () => {
    router.back();
  };

  return (
    <View style={styles.root}>
      <ScreenStatusBanner status="degraded" message={t("support.practice.banner")} />
      <ScreenScroll edges={SAFE_EDGES.stack}>
        <LanguageSwitch />
        <Text style={[styles.note, { color: TOKENS.colors.text.secondary }]}>{t("support.practice.isolated")}</Text>
        <Card style={styles.card}>
          <StatusPill tone={ui.tone} label={t(ui.labelKey)} symbol={phase === "ACTIVA" ? "arrival" : undefined} />
          <Text style={[styles.site, { color: TOKENS.colors.text.primary }]}>
            {session?.site === "B" ? t("support.practice.siteB") : t("support.practice.siteA")}
            {session?.transfer ? ` → ${t("support.practice.siteB")}` : ""}
          </Text>
          {session ? <IntegrityBadge integrity={session.integrity} blocked={session.blocked} /> : null}
        </Card>

        {error ? <Text style={[styles.error, { color: TOKENS.colors.status.danger }]}>{t(`support.practice.errors.${error}`)}</Text> : null}

        {asking ? (
          <Card style={styles.card}>
            <Input {...noteChain.props("note")} label={t("support.practice.noteLabel")} value={note} onChangeText={setNote} />
            <Button
              label={t("common.confirm")}
              onPress={() => void run(asking === "edit" ? { type: "EDIT_NOTE", note } : { type: "FORGOT_CLOCK", note })}
            />
            <Button label={t("common.cancel")} variant="ghost" onPress={() => setAsking(null)} />
          </Card>
        ) : (
          <View style={styles.actions}>
            {phase === "NO_INICIADA" ? (
              <>
                <Button label={t("cta.startDay")} onPress={() => void run({ type: "START_MANUAL" })} />
                <Button label={t("support.flows.startGeofence.title")} variant="secondary" onPress={() => void run({ type: "START_GEOFENCE" })} />
                <Button label={t("support.flows.forgotClock.title")} variant="ghost" onPress={() => setAsking("forgot")} />
              </>
            ) : null}
            {phase === "ESPERANDO" ? (
              <>
                <Button label={t("cta.confirmArrival")} onPress={() => void run({ type: "CONFIRM_ARRIVAL" })} />
                <Button label={t("support.practice.simulateEnter")} variant="secondary" onPress={() => void run({ type: "SIMULATE_ENTER" })} />
                <Button label={t("cta.cancelDay")} variant="ghost" onPress={() => void run({ type: "CANCEL_DAY" })} />
              </>
            ) : null}
            {phase === "ACTIVA" ? (
              <>
                <Button label={t("cta.startLunch")} onPress={() => void run({ type: "START_LUNCH" })} />
                <Button label={t("modals.exitTransfer")} variant="secondary" onPress={() => void run({ type: "START_TRANSFER" })} />
                <Button label={t("support.practice.detectExit")} variant="ghost" onPress={() => void run({ type: "DETECT_EXIT" })} />
                <Button label={t("cta.closeDay")} variant="ghost" onPress={() => void run({ type: "CLOSE_MANUAL" })} />
              </>
            ) : null}
            {phase === "PAUSADA" ? (
              <>
                <Button label={t("cta.resume")} onPress={() => void run({ type: "RESUME" })} />
                <Button label={t("cta.finishDay")} variant="secondary" onPress={() => void run({ type: "CLOSE_MANUAL" })} />
              </>
            ) : null}
            {phase === "TRASLADO" ? (
              <>
                <Button label={t("cta.confirmArrival")} onPress={() => void run({ type: "CONFIRM_ARRIVAL" })} />
                <Button label={t("support.practice.simulateEnter")} variant="secondary" onPress={() => void run({ type: "SIMULATE_ENTER" })} />
                <Button label={t("cta.cancelTransfer")} variant="ghost" onPress={() => void run({ type: "CANCEL_TRANSFER" })} />
              </>
            ) : null}
            {phase === "SALIDA" ? (
              <>
                <Button label={t("cta.confirmExit")} onPress={() => void run({ type: "CLOSE_MANUAL" })} />
                <Button label={t("modals.exitTransfer")} variant="secondary" onPress={() => void run({ type: "START_TRANSFER" })} />
                <Button label={t("cta.stayWorking")} variant="ghost" onPress={() => void run({ type: "STAY" })} />
                <Button label={t("support.practice.autoClose")} variant="ghost" onPress={() => void run({ type: "CLOSE_AUTO" })} />
              </>
            ) : null}
            {phase === "CERRADA" ? (
              <>
                <Button label={t("modals.editTitle")} variant="secondary" onPress={() => setAsking("edit")} />
                <Button label={t("support.flows.forgotClock.title")} variant="ghost" onPress={() => setAsking("forgot")} />
                <Button label={t("reports.generate")} variant="secondary" onPress={() => void run({ type: "SEAL" })} />
                <Button label={t("support.practice.reset")} variant="ghost" onPress={() => void run({ type: "RESET_DEMO" })} />
                <Button
                  label={statement ? t("support.practice.hideStatement") : t("support.practice.viewStatement")}
                  variant="ghost"
                  onPress={() => setStatement((v) => !v)}
                />
              </>
            ) : null}
          </View>
        )}

        {session?.sealed ? <Text style={[styles.note, { color: TOKENS.colors.status.warning }]}>{t("support.practice.provisional")}</Text> : null}
        {session?.note ? <Text style={[styles.note, { color: TOKENS.colors.text.secondary }]}>{session.note}</Text> : null}

        {statement && phase === "CERRADA" ? (
          <Card style={styles.card}>
            <Text style={[styles.note, { color: TOKENS.colors.text.muted }]}>{t("support.practice.notPayroll")}</Text>
            <KeyValueRow label={t("support.practice.siteA")} value={t("support.practice.hours")} />
            <KeyValueRow label={t("support.practice.minutesLabel")} value={t("support.practice.minutes")} />
            <KeyValueRow label={t("reports.total")} value={t("support.practice.amount")} emphasis />
            <Text style={[styles.note, { color: TOKENS.colors.text.primary }]}>
              {t("history.continuesUntil", { date: t("support.practice.nextMonday") })}
            </Text>
            <KeyValueRow label={t("support.practice.zeroMinutes")} value={t("support.practice.zeroAmount")} />
            <Text style={[styles.note, { color: TOKENS.colors.text.secondary }]}>{t("support.practice.hiddenZero")}</Text>
            <Text style={[styles.note, { color: TOKENS.colors.text.secondary }]}>{t("reports.zeroRowsOmitted", { count: 1 })}</Text>
          </Card>
        ) : null}

        <Button label={t("support.practice.exit")} variant="danger" onPress={leave} />
      </ScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: TOKENS.colors.background },
  card: { padding: TOKENS.spacing.lg, gap: TOKENS.spacing.sm },
  actions: { gap: TOKENS.spacing.sm },
  site: { ...FONT.h3 },
  note: { ...FONT.body },
  error: { ...FONT.caption },
});
