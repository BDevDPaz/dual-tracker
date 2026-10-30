import React, { useState, useEffect, useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { ModalShell } from "../ui/ModalShell";
import { Input } from "../ui/Input";
import { ICONS } from "../../constants/icons";
import { useTheme } from "../../context/ThemeContext";

interface EditSessionModalProps {
  visible: boolean;
  onCancel: () => void;
  onSave: () => void;
}

export function EditSessionModal({ visible, onCancel, onSave }: EditSessionModalProps) {
  const { tokens } = useTheme();
  const [inTime, setInTime] = useState("04:56 PM");
  const [outTime, setOutTime] = useState("06:34 PM");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (visible) setNote("");
  }, [visible]);

  const isCorrupted =
    inTime.includes("??") || outTime.includes("??") || inTime === "" || outTime === "";

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: { flexDirection: "row", gap: tokens.spacing.md },
        flexInput: { flex: 1 },
        textArea: { height: 90, textAlignVertical: "top" },
      }),
    [tokens],
  );

  return (
    <ModalShell
      visible={visible}
      title="Editar jornada"
      description="Ajusta los horarios registrados de esta jornada."
      onClose={onCancel}
      icon={ICONS.actions.edit}
      primaryAction={{
        label: "Guardar cambios",
        onPress: onSave,
        disabled: !note.trim() || isCorrupted,
      }}
      secondaryAction={{ label: "Cancelar", onPress: onCancel }}
      scrollable
    >
      <View style={styles.row}>
        <Input
          label="Hora de inicio"
          value={inTime}
          onChangeText={setInTime}
          placeholder="08:00 AM"
          error={isCorrupted ? "Dato inválido" : undefined}
          containerStyle={styles.flexInput}
        />
        <Input
          label="Hora de fin"
          value={outTime}
          onChangeText={setOutTime}
          placeholder="05:00 PM"
          error={isCorrupted ? "Dato inválido" : undefined}
          containerStyle={styles.flexInput}
        />
      </View>
      <Input
        label="Motivo del ajuste"
        placeholder="Describe el motivo del cambio..."
        value={note}
        onChangeText={setNote}
        multiline
        numberOfLines={3}
        style={styles.textArea}
      />
    </ModalShell>
  );
}
