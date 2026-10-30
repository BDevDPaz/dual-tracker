import React from "react";
import { Text, View, StyleSheet } from "react-native";
import { ModalShell } from "../ui/ModalShell";
import { SelectableCard } from "../ui/SelectableCard";
import { ICONS } from "../../constants/icons";
import { TOKENS, FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { t, useLanguage } from "../../i18n";

/** Solo almuerzo (sin pago) y descanso (pagado). California por defecto (D-25). */
interface PauseKindModalProps {
  visible: boolean;
  busy?: boolean;
  lunchUsed?: boolean;
  onLunch: () => void;
  onRest: () => void;
  onCancel: () => void;
}

export function PauseKindModal({ visible, busy = false, lunchUsed = false, onLunch, onRest, onCancel }: PauseKindModalProps) {
  useLanguage();
  const { colors } = useTheme();
  return (
    <ModalShell
      visible={visible}
      title={t("modals.pauseTitle")}
      description={t("modals.pauseSub")}
      icon={ICONS.domain.lunch}
      onClose={onCancel}
      testID="pause-kind-modal"
      secondaryAction={{ label: t("common.cancel"), onPress: onCancel }}
    >
      <View style={styles.grid}>
        <SelectableCard
          role="button"
          label={t("modals.pauseLunch")}
          description={lunchUsed ? t("modals.pauseLunchUsed") : t("modals.pauseLunchSub")}
          onPress={onLunch}
          disabled={busy || lunchUsed}
        />
        <SelectableCard role="button" label={t("modals.pauseRest")} description={t("modals.pauseRestSub")} onPress={onRest} disabled={busy} />
      </View>
      <Text style={[styles.note, { color: colors.text.secondary }]}>{t("modals.pauseStateNote")}</Text>
      <Text style={[styles.note, { color: colors.text.secondary }]}>{t("modals.pauseExitIgnored")}</Text>
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  grid: { gap: TOKENS.spacing.sm },
  note: { ...FONT.caption, marginTop: TOKENS.spacing.sm },
});
