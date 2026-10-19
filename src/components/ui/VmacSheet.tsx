import React from "react";
import { StyleSheet, View } from "react-native";
import { ModalShell } from "./ModalShell";
import { SelectableCard } from "./SelectableCard";
import { TOKENS } from "../../constants/theme";
import { t, useLanguage } from "../../i18n";

interface VmacSheetProps {
  visible: boolean;
  onClose: () => void;
}

/** Qué significan las cuatro letras de integridad. No altera clases ni nómina. */
export function VmacSheet({ visible, onClose }: VmacSheetProps) {
  useLanguage();
  return (
    <ModalShell visible={visible} title={t("vmac.title")} description={t("vmac.intro")} icon="information-circle-outline" onClose={onClose} testID="vmac-sheet">
      <View style={styles.list}>
        <SelectableCard interactive={false} label={t("vmac.v.title")} description={t("vmac.v.body")} />
        <SelectableCard interactive={false} label={t("vmac.m.title")} description={t("vmac.m.body")} />
        <SelectableCard interactive={false} label={t("vmac.a.title")} description={t("vmac.a.body")} />
        <SelectableCard interactive={false} label={t("vmac.c.title")} description={t("vmac.c.body")} />
      </View>
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  list: { gap: TOKENS.spacing.sm },
});
