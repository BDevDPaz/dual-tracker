import React from "react";
import { View, StyleSheet } from "react-native";
import { ModalShell } from "../ui/ModalShell";
import { Button } from "../ui/Button";
import { ICONS } from "../../constants/icons";
import { TOKENS } from "../../constants/theme";
import { t } from "../../i18n";

/**
 * ExitDetectionModal — "decision hub" de salida (Producto §5.7).
 * Portado de GEOTrack (binario: continuar / finalizar) y ampliado a cuatro
 * acciones de igual peso semántico y distinto peso visual:
 * Sigo trabajando aquí · Iniciar almuerzo · Iniciar traslado · Cerrar jornada.
 * El tiempo mostrado es la PRIMERA salida, no la última.
 * Presentacional: cada acción es un callback que la pantalla traduce a intención.
 */
interface ExitDetectionModalProps {
  visible: boolean;
  firstExitTime: string;
  busy?: boolean;
  onStay: () => void;
  onLunch: () => void;
  onTransfer: () => void;
  onCloseDay: () => void;
  onDismiss: () => void;
}

export function ExitDetectionModal({ visible, firstExitTime, busy = false, onStay, onLunch, onTransfer, onCloseDay, onDismiss }: ExitDetectionModalProps) {
  return (
    <ModalShell
      visible={visible}
      title={t("modals.exitTitle")}
      description={t("modals.exitSub", { time: firstExitTime })}
      tone="warning"
      icon={ICONS.status.warning}
      onClose={onDismiss}
    >
      <View style={styles.grid}>
        <Button label={t("modals.exitStay")} variant="primary" onPress={onStay} isLoading={busy} style={styles.btn} />
        <Button label={t("modals.exitLunch")} variant="secondary" onPress={onLunch} disabled={busy} style={styles.btn} iconName="restaurant-outline" />
        <Button label={t("modals.exitTransfer")} variant="secondary" onPress={onTransfer} disabled={busy} style={styles.btn} iconName="navigate-outline" />
        <Button label={t("modals.exitClose")} variant="danger" onPress={onCloseDay} disabled={busy} style={styles.btn} iconName="stop-circle-outline" />
      </View>
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  grid: { gap: TOKENS.spacing.sm },
  btn: { width: "100%" },
});
