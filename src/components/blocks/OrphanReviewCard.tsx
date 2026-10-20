import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { TOKENS, FONT } from "../../constants/theme";
import { t, useLanguage } from "../../i18n";
import { TimeAuthorityService } from "../../services/evidence/TimeAuthorityService";
import { fixedLunchExceedsSession, timePickerMaximum } from "../../services/domain/sessionTimeGuard";
import { resolveSessionEditTimes, toHHmm } from "../../utils/dateUtils";
import { Button, Card, Input } from "../ui";
import { useFormFocusChain } from "../ui/formChain";
import { FORM_FIELDS } from "../ui/formFields";

/**
 * Resolución de una jornada en Revisar por abandono.
 * El operario confirma la hora de fin (con nota) o sigue trabajando.
 * No propone una hora inventada.
 */
export function OrphanReviewCard({
  startMs,
  nowMs,
  busy,
  fixedLunchMinutes,
  onContinue,
  onConfirm,
}: {
  startMs: number;
  nowMs: number;
  busy?: boolean;
  /** Minutos de almuerzo fijo ya declarados. Si el fin no los cubre, no se confirma. */
  fixedLunchMinutes?: number | null;
  onContinue: () => void;
  onConfirm: (endAtMs: number, note: string) => void;
}) {
  useLanguage();
  const [endText, setEndText] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const ceilingMs = Math.max(nowMs, TimeAuthorityService.futureCeiling());
  const submit = () => {
    const resolved = resolveSessionEditTimes(startMs, null, toHHmm(startMs), endText);
    if (!note.trim()) {
      setError(t("today.orphanNoteRequired"));
      return;
    }
    if (resolved.invalidEnd || resolved.end === null || resolved.end <= startMs) {
      setError(t("modals.endNotAfterStart"));
      return;
    }
    if (resolved.end > ceilingMs) {
      setError(t("modals.futureTime"));
      return;
    }
    if (
      fixedLunchMinutes != null &&
      fixedLunchExceedsSession({ startAtMs: null, endAtMs: null, deductedMinutes: fixedLunchMinutes }, startMs, resolved.end)
    ) {
      setError(t("modals.lunchMustFit"));
      return;
    }
    setError("");
    onConfirm(resolved.end, note.trim());
  };
  const chain = useFormFocusChain(FORM_FIELDS.orphanReview, {
    canSubmit: note.trim().length > 0 && endText.trim().length > 0 && !busy,
    onSubmit: submit,
  });
  return (
    <Card style={styles.card}>
      <Text style={[styles.title, { color: TOKENS.colors.text.primary }]}>{t("today.orphanTitle")}</Text>
      <Text style={[styles.body, { color: TOKENS.colors.text.secondary }]}>{t("today.orphanBody")}</Text>
      <Input {...chain.props("end")} label={t("today.orphanEnd")} value={endText} onChangeText={setEndText} mask="HH:mm" maximumDate={timePickerMaximum(ceilingMs)} testID="orphan-end" />
      <Input {...chain.props("note")} label={t("today.orphanNote")} value={note} onChangeText={setNote} testID="orphan-note" />
      {error ? <Text style={[styles.body, { color: TOKENS.colors.status.warning }]}>{error}</Text> : null}
      <Button label={t("today.orphanConfirm")} disabled={busy || !note.trim() || !endText.trim()} isLoading={busy} onPress={submit} />
      <Button label={t("today.orphanContinue")} variant="secondary" disabled={busy} onPress={onContinue} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: TOKENS.spacing.lg, gap: TOKENS.spacing.sm, marginBottom: TOKENS.spacing.md },
  title: { ...FONT.bodyStrong },
  body: { ...FONT.caption },
});
