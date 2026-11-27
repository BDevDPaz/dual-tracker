import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { EvidencePack } from "../../core/contracts";
import { TOKENS, FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { t, useLanguage } from "../../i18n";
import { formatDateTime } from "../../utils/dateUtils";
import { Button } from "../ui/Button";
import { ModalShell } from "../ui/ModalShell";

/** Qué botón de compartir pidió el aviso (D4). */
export type ShareTarget = "employee" | "employer";

/** Pack elegido que no es el último de su periodo y el último (selectLatestPackForPeriod). */
export interface PendingNotLatestShare {
  target: ShareTarget;
  chosen: EvidencePack;
  latest: EvidencePack;
}

const packLine = (pack: EvidencePack) => ({ date: formatDateTime(pack.manifest.sealedAtMs), hash: pack.manifest.packHash.slice(0, 8) });

/**
 * D4 (Solicitud 8): aviso antes de compartir un pack que no es el último de su
 * periodo. Muestra fecha y los 8 primeros caracteres del hash del elegido y del
 * más nuevo. «Compartir este» envía el elegido con `confirmNotLatest`;
 * «Compartir el último» envía el más nuevo; «Cancelar» no comparte.
 */
export function ShareNotLatestModal({
  pending,
  busy = false,
  onShareThis,
  onShareLatest,
  onCancel,
}: {
  pending: PendingNotLatestShare | null;
  busy?: boolean;
  onShareThis: (pending: PendingNotLatestShare) => void;
  onShareLatest: (pending: PendingNotLatestShare) => void;
  onCancel: () => void;
}) {
  useLanguage();
  const { colors } = useTheme();
  if (!pending) return null;
  const chosen = packLine(pending.chosen);
  const latest = packLine(pending.latest);
  return (
    <ModalShell
      visible
      title={t("reports.notLatestTitle")}
      description={t("reports.notLatestBody")}
      tone="warning"
      onClose={onCancel}
      showCloseButton={false}
      testID="share-not-latest"
      primaryAction={{ label: t("reports.shareLatest"), onPress: () => onShareLatest(pending), loading: busy, disabled: busy }}
      secondaryAction={{ label: t("common.cancel"), onPress: onCancel, disabled: busy }}
    >
      <View style={styles.rows}>
        <Text testID="share-not-latest-chosen" style={[styles.row, { color: colors.text.primary }]}>
          {t("reports.notLatestChosen", chosen)}
        </Text>
        <Text testID="share-not-latest-newest" style={[styles.row, { color: colors.text.primary }]}>
          {t("reports.notLatestNewest", latest)}
        </Text>
        <Button testID="share-not-latest-this" label={t("reports.shareThis")} variant="secondary" disabled={busy} onPress={() => onShareThis(pending)} />
      </View>
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  rows: { gap: TOKENS.spacing.sm },
  row: { ...FONT.bodySmall },
});
