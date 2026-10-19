import React, { useState, useEffect } from "react";
import { StyleSheet } from "react-native";
import { ModalShell } from "../ui/ModalShell";
import { Input } from "../ui/Input";
import { useFormFocusChain } from "../ui/formChain";
import { FORM_FIELDS } from "../ui/formFields";
import { ICONS } from "../../constants/icons";
import { TOKENS } from "../../constants/theme";
import { t, useLanguage } from "../../i18n";

/**
 * AddNoteModal — portado de GEOTrack. Se abre desde Detalle o Conflicto para
 * justificación de auditoría (la nota queda en el ledger vía ADD_NOTE).
 */
interface AddNoteModalProps {
  visible: boolean;
  title?: string;
  busy?: boolean;
  onCancel: () => void;
  onSave: (note: string) => void;
}

export function AddNoteModal({ visible, title, busy = false, onCancel, onSave }: AddNoteModalProps) {
  useLanguage();
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
      <Input {...chain.props("note")} placeholder={t("modals.notePlaceholder")} value={note} onChangeText={setNote} multiline numberOfLines={4} style={styles.textArea} autoFocus />
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  textArea: { height: TOKENS.layout.textAreaLg, textAlignVertical: "top" },
});
