import React from "react";
import { View, StyleSheet } from "react-native";
import { ModalShell } from "../ui/ModalShell";
import { SelectableCard } from "../ui/SelectableCard";
import { ICONS } from "../../constants/icons";
import { TOKENS } from "../../constants/theme";
import { t, useLanguage } from "../../i18n";

/**
 * ExitDetectionModal — "decision hub" de salida (Producto §5.7).
 * Portado de GEOTrack (binario: continuar / finalizar) y ampliado a cuatro
 * acciones de igual peso semántico y distinto peso visual:
 * Sigo trabajando aquí · Iniciar almuerzo · Iniciar traslado · Cerrar jornada.
 * El tiempo mostrado es la PRIMERA salida, no la última.
 * Presentacional: cada acción es un callback que la pantalla traduce a intención.
 * NO descartable (dismissible={false}): sin X, sin toque en el fondo y el botón
 * atrás no lo cierra; la salida se decide con una de las cuatro acciones.
 * Los botones van apilados a ancho completo (no en el pie de dos botones).
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
  useLanguage();
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
      <View style={styles.grid}>
        <SelectableCard role="button" label={t("modals.exitStay")} onPress={onStay} disabled={busy} />
        <SelectableCard role="button" label={t("modals.exitLunch")} onPress={onLunch} disabled={busy} />
        <SelectableCard role="button" label={t("modals.exitTransfer")} onPress={onTransfer} disabled={busy} />
        <SelectableCard role="button" label={t("modals.exitClose")} onPress={onCloseDay} disabled={busy} />
      </View>
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  grid: { gap: TOKENS.spacing.sm },
});
