import React from "react";
import { t, useLanguage } from "../../i18n";
import { formatUiDecimal } from "../../utils/dateUtils";
import { SummaryCard } from "./SummaryCard";

interface DailySummaryBlockProps {
  hours: string;
  earnings: string;
  /**
   * El margen lateral es de la PANTALLA (ScreenContainer o el contentContainer
   * del ScrollView). true solo si se usa fuera de un contenedor con padding.
   */
  inset?: boolean;
}

export function DailySummaryBlock({ hours, earnings, inset = false }: DailySummaryBlockProps) {
  const language = useLanguage();
  return (
    <SummaryCard
      hoursLabel={t("today.netHours")}
      hours={formatUiDecimal(hours, language)}
      moneyLabel={t("today.estimate")}
      money={earnings}
      inset={inset}
    />
  );
}
