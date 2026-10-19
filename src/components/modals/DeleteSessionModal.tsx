import React from "react";
import { ModalShell } from "../ui/ModalShell";
import { ICONS } from "../../constants/icons";
import { t, useLanguage } from "../../i18n";

/**
 * DeleteSessionModal — portado de GEOTrack. El copy original prometía un
 * borrado "permanente" que no se correspondía con el soft-delete; ahora dice
 * la verdad: borrado LÓGICO (isDeleted), la sesión se conserva en el expediente.
 */
interface DeleteSessionModalProps {
  visible: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteSessionModal({ visible, busy = false, onCancel, onConfirm }: DeleteSessionModalProps) {
  useLanguage();
  return (
    <ModalShell
      visible={visible}
      title={t("modals.deleteTitle")}
      description={t("modals.deleteBody")}
      tone="danger"
      icon={ICONS.actions.delete}
      onClose={onCancel}
      showCloseButton={false}
      primaryAction={{ label: t("common.delete"), onPress: onConfirm, variant: "danger", loading: busy }}
      secondaryAction={{ label: t("common.cancel"), onPress: onCancel }}
    />
  );
}
