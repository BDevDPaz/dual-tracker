import React, { useState, useEffect } from "react";
import { StyleSheet, Text } from "react-native";
import { ModalShell } from "../ui/ModalShell";
import { Input } from "../ui/Input";
import { useFormFocusChain } from "../ui/formChain";
import { FORM_FIELDS } from "../ui/formFields";
import { ICONS } from "../../constants/icons";
import { FONT, TOKENS } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { t, useLanguage } from "../../i18n";

/**
 * AddNoteModal — portado del código heredado. Se abre desde Detalle o Conflicto para
 * justificación de auditoría (la nota queda en el ledger vía ADD_NOTE).
 */
interface AddNoteModalProps {
  visible: boolean;
  title?: string;
  busy?: boolean;
  onCancel: () => void;
  onSave: (note: string) => void;
  /** HH-5: nota actual de la jornada. ADD_NOTE la sustituye: se avisa antes. */
  currentNote?: string;
}

export function AddNoteModal({ visible, title, busy = false, onCancel, onSave, currentNote }: AddNoteModalProps) {
  useLanguage();
  const { colors } = useTheme();
  const [note, setNote] = useState("");
  useEffect(() => {
    if (visible) setNote("");
  }, [visible]);
  const chain = useFormFocusChain(FORM_FIELDS.addNote, {
    canSubmit: note.trim().length > 0 && !busy,
    onSubmit: () => onSave(note.trim()),
  });

  return (
    <ModalShell
      visible={visible}
      title={title ?? t("modals.noteTitle")}
      onClose={onCancel}
      icon={ICONS.actions.add}
      primaryAction={{ label: t("common.save"), onPress: () => onSave(note.trim()), disabled: !note.trim(), loading: busy }}
      secondaryAction={{ label: t("common.cancel"), onPress: onCancel }}
    >
      {currentNote ? (
        <Text style={[styles.replaces, { color: colors.statusText.warning }]} testID="note-replaces">
          {t("modals.noteReplaces", { note: currentNote })}
        </Text>
      ) : null}
      <Input {...chain.props("note")} label={t("modals.noteLabel")} placeholder={t("modals.notePlaceholder")} value={note} onChangeText={setNote} multiline numberOfLines={4} style={styles.textArea} autoFocus />
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  textArea: { height: TOKENS.layout.textAreaLg, textAlignVertical: "top" },
  replaces: { ...FONT.caption, marginBottom: TOKENS.spacing.sm },
});
