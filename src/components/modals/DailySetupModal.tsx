import React, { useState, useEffect } from "react";
import { ModalShell } from "../ui/ModalShell";
import { Input } from "../ui/Input";
import { ICONS } from "../../constants/icons";

interface DailySetupModalProps {
  visible: boolean;
  onCancel: () => void;
  onConfirm: (destination: string, address?: string) => void;
}

export function DailySetupModal({ visible, onCancel, onConfirm }: DailySetupModalProps) {
  const [dest, setDest] = useState("");
  const [addr, setAddr] = useState("");

  useEffect(() => {
    if (visible) {
      setDest("");
      setAddr("");
    }
  }, [visible]);

  return (
    <ModalShell
      visible={visible}
      title="Iniciar jornada"
      description="Configura el destino inicial para el seguimiento automático."
      onClose={onCancel}
      primaryAction={{
        label: "Iniciar jornada",
        onPress: () => onConfirm(dest || "Destino no especificado", addr),
        disabled: !dest.trim(),
      }}
      secondaryAction={{
        label: "Cancelar",
        onPress: onCancel,
      }}
      icon={ICONS.domain.location}
      scrollable
    >
      <Input
        label="Destino"
        placeholder="Ej. Taller central"
        icon={ICONS.domain.location}
        value={dest}
        onChangeText={setDest}
        autoFocus
      />
      <Input
        label="Dirección (opcional)"
        placeholder="Ej. 123 Main St"
        icon="map-outline"
        value={addr}
        onChangeText={setAddr}
      />
    </ModalShell>
  );
}
