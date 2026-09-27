import React, { useState, useEffect } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { ModalShell } from "../ui/ModalShell";
import { Input } from "../ui/Input";
import { ICONS } from "../../constants/icons";
import { TOKENS, FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
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
  | {
      visible: boolean;
      mode: "close";
      /** La jornada cruza un límite de jornada: se pide la hora de inicio (spec v1.3 §5.3). */
      askStartTime?: boolean;
      onCancel: () => void;
      onConfirm: (minutes: number | null, startHHmm: string | null) => void;
    }
  | { visible: boolean; mode: "supervisor"; elapsed: string; onCancel: () => void; onResume: () => void; onFinish: () => void };

const OPTIONS = [0, 30, 45, 60];
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function LunchModal(props: LunchModalProps) {
  const { colors } = useTheme();
  const [selected, setSelected] = useState<number | null>(null);
  const [startHHmm, setStartHHmm] = useState("");
  useEffect(() => {
    if (props.visible) {
      setSelected(null);
      setStartHHmm("");
    }
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

  const needsStart = !!props.askStartTime && (selected ?? 0) > 0;
  return (
    <ModalShell
      visible={props.visible}
      title={t("modals.lunchTitle")}
      description={t("modals.lunchSub")}
      icon={ICONS.domain.lunch}
      onClose={props.onCancel}
      primaryAction={{
        label: t("common.confirm"),
        onPress: () => props.onConfirm(selected, needsStart ? startHHmm.trim() : null),
        disabled: selected === null || (needsStart && !HHMM.test(startHHmm.trim())),
      }}
      secondaryAction={{ label: t("common.cancel"), onPress: props.onCancel }}
    >
      <View style={styles.optionsGrid} testID="lunch-options">
        {OPTIONS.map((min) => (
          <Pressable
            key={min}
            onPress={() => setSelected(min)}
            style={[
              styles.optionPill,
              { backgroundColor: colors.surface, borderColor: colors.border },
              selected === min && { backgroundColor: colors.statusBg.primary, borderColor: colors.primary },
            ]}
            accessibilityRole="radio"
            accessibilityState={{ selected: selected === min }}
            accessibilityLabel={`${min} ${t("common.minutes")}`}
          >
            <Text style={[styles.optionText, { color: colors.text.secondary }, selected === min && { color: colors.primary }]}>
              {min === 0 ? t("modals.lunchNo") : `${min} ${t("common.minutes")}`}
            </Text>
          </Pressable>
        ))}
      </View>
      {needsStart ? (
        <View style={styles.startRow}>
          <Input label={t("modals.lunchStartQuestion")} value={startHHmm} onChangeText={setStartHHmm} placeholder="12:30" mask="HH:mm" testID="lunch-start" />
          <Text style={[styles.hint, { color: colors.text.muted }]}>{t("modals.lunchStartHint")}</Text>
        </View>
      ) : null}
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  // Rejilla 2×2: en teléfonos estrechos cuatro píldoras en fila no caben con texto de 16.
  optionsGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: TOKENS.spacing.sm },
  optionPill: {
    width: "48.5%",
    minHeight: TOKENS.layout.minTouchTarget + 4,
    paddingVertical: TOKENS.spacing.md,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: TOKENS.radius.md,
    borderWidth: 1,
  },
  optionText: { ...FONT.bodyStrong },
  startRow: { marginTop: TOKENS.spacing.md, gap: TOKENS.spacing.xs },
  hint: { ...FONT.caption },
});
