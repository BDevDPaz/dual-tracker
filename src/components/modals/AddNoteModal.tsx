import React, { useState, useEffect } from "react";
import { StyleSheet } from "react-native";
import { ModalShell } from "../ui/ModalShell";
import { Input } from "../ui/Input";
import { ICONS } from "../../constants/icons";

interface AddNoteModalProps {
  visible: boolean;
  onCancel: () => void;
  onSave: (note: string) => void;
}

export function AddNoteModal({ visible, onCancel, onSave }: AddNoteModalProps) {
  const [note, setNote] = useState("");

  useEffect(() => {
    if (visible) {
      setNote("");
    }
  }, [visible]);

  return (
    <ModalShell
      visible={visible}
      title="Agregar nota"
      description="Agrega información adicional a esta jornada."
      onClose={onCancel}
      primaryAction={{
        label: "Guardar nota",
        onPress: () => onSave(note),
        disabled: !note.trim(),
      }}
      secondaryAction={{
        label: "Cancelar",
        onPress: onCancel,
      }}
      icon={ICONS.actions.add}
    >
      <Input
        placeholder="Escribe tu nota aquí..."
        value={note}
        onChangeText={setNote}
        multiline
        numberOfLines={4}
        style={styles.textArea}
        autoFocus
      />
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  textArea: {
    height: 120,
    textAlignVertical: "top",
  },
});
