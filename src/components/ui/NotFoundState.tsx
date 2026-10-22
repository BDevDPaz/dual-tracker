import React from "react";
import { EmptyState } from "./EmptyState";
import { t, useLanguage } from "../../i18n";

/**
 * Estado único de «no existe» (sesión, rastro, expediente, destino, periodo).
 * El botón dice siempre Volver / Back.
 */
export function NotFoundState({
  title,
  description,
  onBack,
  accessory,
}: {
  title: string;
  description?: string;
  onBack: () => void;
  /** Se lee después del título (por ejemplo el botón de ayuda). */
  accessory?: React.ReactNode;
}) {
  useLanguage();
  return (
    <EmptyState
      title={title}
      description={description}
      icon="alert-circle-outline"
      afterTitle={accessory}
      action={{ label: t("common.back"), onPress: onBack }}
    />
  );
}
