import React from "react";
import { ModalShell, type ModalTone } from "../ui/ModalShell";
import { t, useLanguage } from "../../i18n";

/**
 * Confirmación destructiva o legal con el mismo cascarón que DeleteSessionModal:
 * ModalShell, sin X duplicada, Cancelar + acción, y loading mientras corre.
 */
interface ConfirmActionModalProps {
  visible: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: ModalTone;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmActionModal({
  visible,
  title,
  description,
  confirmLabel,
  tone = "danger",
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmActionModalProps) {
  useLanguage();
  return (
    <ModalShell
      visible={visible}
      title={title}
      description={description}
      tone={tone}
      onClose={onCancel}
      showCloseButton={false}
      primaryAction={{
        label: confirmLabel,
        onPress: onConfirm,
        variant: tone === "danger" ? "danger" : "primary",
        loading: busy,
        disabled: busy,
      }}
      secondaryAction={{ label: t("common.cancel"), onPress: onCancel }}
    />
  );
}
