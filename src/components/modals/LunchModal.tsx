import React, { useState, useEffect } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { ModalShell } from "../ui/ModalShell";
import { ICONS } from "../../constants/icons";
import { TOKENS, FONT } from "../../constants/theme";
import { t } from "../../i18n";

/**
 * LunchModal — portado de GEOTrack con dos modos (Producto §7):
 *  - "close": al cerrar la jornada, deducción de almuerzo (0/30/45/60).
 *    Sin preselección: no se asume 60 min (la nómina marca
 *    LUNCH_DURATION_UNKNOWN si se omite).
 *  - "supervisor": en PAUSADA, muestra el tiempo transcurrido del almuerzo y
 *    permite reanudar o finalizar la jornada.
 */
type LunchModalProps =
  | { visible: boolean; mode: "close"; onCancel: () => void; onConfirm: (minutes: number | null) => void }
  | { visible: boolean; mode: "supervisor"; elapsed: string; onCancel: () => void; onResume: () => void; onFinish: () => void };

const OPTIONS = [0, 30, 45, 60];

export function LunchModal(props: LunchModalProps) {
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    if (props.visible) setSelected(null);
  }, [props.visible]);

  if (props.mode === "supervisor") {
    return (
      <ModalShell
        visible={props.visible}
        title={t("modals.lunchSupervisorTitle")}
        description={`${t("modals.lunchElapsed")}: ${props.elapsed}`}
        icon={ICONS.domain.lunch}
        onClose={props.onCancel}
        primaryAction={{ label: t("cta.resume"), onPress: props.onResume }}
        secondaryAction={{ label: t("cta.finishDay"), onPress: props.onFinish, variant: "secondary" }}
      />
    );
  }

  return (
    <ModalShell
      visible={props.visible}
      title={t("modals.lunchTitle")}
      description={t("modals.lunchSub")}
      icon={ICONS.domain.lunch}
      onClose={props.onCancel}
      primaryAction={{ label: t("common.confirm"), onPress: () => props.onConfirm(selected), disabled: selected === null }}
      secondaryAction={{ label: t("common.cancel"), onPress: props.onCancel }}
    >
      <View style={styles.optionsRow}>
        {OPTIONS.map((min) => (
          <Pressable
            key={min}
            onPress={() => setSelected(min)}
            style={[
              styles.optionPill,
              { backgroundColor: TOKENS.colors.surface, borderColor: TOKENS.colors.border },
              selected === min && [styles.optionPillActive, { borderColor: TOKENS.colors.primary }],
            ]}
            accessibilityRole="radio"
            accessibilityState={{ selected: selected === min }}
            accessibilityLabel={`${min} ${t("common.minutes")}`}
          >
            <Text style={[styles.optionText, { color: TOKENS.colors.text.secondary }, selected === min && { color: TOKENS.colors.primary }]}>
              {min === 0 ? t("modals.lunchNo") : `${min} ${t("common.minutes")}`}
            </Text>
          </Pressable>
        ))}
      </View>
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  optionsRow: { flexDirection: "row", justifyContent: "space-between", gap: TOKENS.spacing.sm },
  optionPill: { flex: 1, paddingVertical: TOKENS.spacing.md, alignItems: "center", borderRadius: TOKENS.radius.md, borderWidth: 1 },
  optionPillActive: { backgroundColor: `${TOKENS.colors.primary}15` },
  optionText: { ...FONT.bodyStrong, fontSize: 14 },
});
