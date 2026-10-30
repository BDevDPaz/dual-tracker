import React from "react";
import { ModalShell } from "../ui/ModalShell";
import { ICONS } from "../../constants/icons";

interface ExitDetectionModalProps {
  visible: boolean;
  exitTime: string;
  onContinueOperating: () => void;
  onCloseShift: () => void;
}

export function ExitDetectionModal({
  visible,
  exitTime,
  onContinueOperating,
  onCloseShift,
}: ExitDetectionModalProps) {
  return (
    <ModalShell
      visible={visible}
      title="Salida de zona"
      description={`Se detectó una salida de la zona registrada a las ${exitTime}. ¿Deseas continuar con la jornada o finalizarla?`}
      tone="warning"
      icon={ICONS.status.warning}
      onClose={onContinueOperating}
      primaryAction={{
        label: "Continuar jornada",
        onPress: onContinueOperating,
      }}
      secondaryAction={{
        label: "Finalizar jornada",
        onPress: onCloseShift,
        variant: "secondary",
      }}
    />
  );
}
