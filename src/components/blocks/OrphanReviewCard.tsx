import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { TOKENS, FONT } from "../../constants/theme";
import { t, useLanguage } from "../../i18n";
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
  onContinue,
  onConfirm,
}: {
  startMs: number;
  nowMs: number;
  busy?: boolean;
  onContinue: () => void;
  onConfirm: (endAtMs: number, note: string) => void;
}) {
  useLanguage();
  const [endText, setEndText] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const submit = () => {
    const resolved = resolveSessionEditTimes(startMs, null, toHHmm(startMs), endText);
    if (!note.trim()) {
      setError(t("today.orphanNoteRequired"));
      return;
    }
    if (resolved.invalidEnd || resolved.end === null || resolved.end < startMs) {
      setError(t("today.orphanInvalid"));
      return;
    }
    if (resolved.end > nowMs) {
      setError(t("today.orphanFuture"));
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
      <Input {...chain.props("end")} label={t("today.orphanEnd")} value={endText} onChangeText={setEndText} />
      <Input {...chain.props("note")} label={t("today.orphanNote")} value={note} onChangeText={setNote} />
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
