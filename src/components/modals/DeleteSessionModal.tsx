import React from "react";
import { ModalShell } from "../ui/ModalShell";
import { ICONS } from "../../constants/icons";

interface DeleteSessionModalProps {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteSessionModal({ visible, onCancel, onConfirm }: DeleteSessionModalProps) {
  return (
    <ModalShell
      visible={visible}
      title="Eliminar jornada"
      description="Esta acción es irreversible. Se eliminarán permanentemente todos los registros y cálculos asociados."
      tone="danger"
      icon={ICONS.actions.delete}
      onClose={onCancel}
      primaryAction={{
        label: "Eliminar",
        onPress: onConfirm,
        variant: "danger",
      }}
      secondaryAction={{
        label: "Cancelar",
        onPress: onCancel,
      }}
    />
  );
}
