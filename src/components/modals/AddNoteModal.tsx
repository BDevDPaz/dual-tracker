import React, { useState, useEffect } from "react";
import { StyleSheet } from "react-native";
import { ModalShell } from "../ui/ModalShell";
import { Input } from "../ui/Input";
import { ICONS } from "../../constants/icons";
import { t } from "../../i18n";

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
  const [note, setNote] = useState("");
  useEffect(() => {
    if (visible) setNote("");
  }, [visible]);

  return (
    <ModalShell
      visible={visible}
      title={title ?? t("modals.noteTitle")}
      onClose={onCancel}
      icon={ICONS.actions.add}
      primaryAction={{ label: t("common.save"), onPress: () => onSave(note.trim()), disabled: !note.trim(), loading: busy }}
      secondaryAction={{ label: t("common.cancel"), onPress: onCancel }}
    >
      <Input placeholder={t("modals.notePlaceholder")} value={note} onChangeText={setNote} multiline numberOfLines={4} style={styles.textArea} autoFocus />
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  textArea: { height: 120, textAlignVertical: "top" },
});
