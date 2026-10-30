import React from "react";
import { Text, View, StyleSheet } from "react-native";
import { ModalShell } from "../ui/ModalShell";
import { SelectableCard } from "../ui/SelectableCard";
import { ICONS } from "../../constants/icons";
import { TOKENS, FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { t, useLanguage } from "../../i18n";

/** Hoja "Salida detectada": terminar, otro trabajo, sigo trabajando. Sin almuerzo (D-19). */
interface ExitDetectionModalProps {
  visible: boolean;
  firstExitTime: string;
  siteName?: string;
  recheckTime?: string;
  reopened?: boolean;
  busy?: boolean;
  onStay: () => void;
  onLunch?: () => void;
  onTransfer: () => void;
  onErrand?: () => void;
  onCloseDay: () => void;
  onDismiss: () => void;
}

export function ExitDetectionModal({
  visible,
  firstExitTime,
  siteName = "",
  recheckTime = "",
  reopened = false,
  busy = false,
  onStay,
  onTransfer,
  onCloseDay,
  onDismiss,
}: ExitDetectionModalProps) {
  useLanguage();
  const { colors } = useTheme();
  const siteLine = reopened ? t("modals.exitReopenSite", { site: siteName }) : t("modals.exitSite", { site: siteName });
  return (
    <ModalShell
      visible={visible}
      title={t("modals.exitTitle")}
      description={t("modals.exitSub", { time: firstExitTime })}
      tone="warning"
      icon={ICONS.status.warning}
      onClose={onDismiss}
      dismissible={false}
      testID="exit-detection-modal"
    >
      <Text style={[styles.site, { color: colors.text.secondary }]}>{siteLine}</Text>
      <View style={styles.grid}>
        <SelectableCard role="button" label={t("modals.exitClose")} description={t("modals.exitCloseSub", { time: firstExitTime })} onPress={onCloseDay} disabled={busy} />
        <SelectableCard role="button" label={t("modals.exitTransfer")} description={t("modals.exitTransferSub")} onPress={onTransfer} disabled={busy} />
        <SelectableCard role="button" label={t("modals.exitStay")} description={t("modals.exitStaySub")} onPress={onStay} disabled={busy} />
      </View>
      <Text style={[styles.note, { color: colors.text.secondary }]}>
        {reopened ? t("modals.exitReopenNote") : t("modals.exitTimeoutNote", { time: recheckTime, exit: firstExitTime })}
      </Text>
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  grid: { gap: TOKENS.spacing.sm },
  site: { ...FONT.bodySmall, marginBottom: TOKENS.spacing.sm },
  note: { ...FONT.caption, marginTop: TOKENS.spacing.md },
});
