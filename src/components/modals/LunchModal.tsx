import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { ModalShell } from "../ui/ModalShell";
import { SelectableCard } from "../ui/SelectableCard";
import { Input } from "../ui/Input";
import { useFormFocusChain } from "../ui/formChain";
import { FORM_FIELDS } from "../ui/formFields";
import { ICONS } from "../../constants/icons";
import { TOKENS, FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { t, useLanguage } from "../../i18n";
import { TimeAuthorityService } from "../../services/evidence/TimeAuthorityService";
import { fixedLunchExceedsSession, lunchOutsideSession, timePickerMaximum } from "../../services/domain/sessionTimeGuard";
import { formatCurrency, wallMinutesOnOrAfter } from "../../utils/dateUtils";

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
      /** Inicio de la jornada y hora de cierre. Sirven para rechazar un almuerzo fuera o en el futuro. */
      sessionStartMs?: number;
      sessionEndMs?: number;
      busy?: boolean;
      /** Minutos y estimado actuales, solo para la vista previa. */
      netMinutes?: number;
      grossEstimate?: number;
      onCancel: () => void;
      onConfirm: (minutes: number | null, startHHmm: string | null) => void;
    }
  | { visible: boolean; mode: "supervisor"; busy?: boolean; elapsed: string; onCancel: () => void; onResume: () => void; onFinish: () => void };

const OPTIONS = [0, 30, 45, 60];
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function LunchModal(props: LunchModalProps) {
  useLanguage();
  const { colors } = useTheme();
  const [selected, setSelected] = useState<number | null>(null);
  const [startHHmm, setStartHHmm] = useState("");
  useEffect(() => {
    if (props.visible) {
      setSelected(null);
      setStartHHmm("");
    }
  }, [props.visible]);

  const needsStart = props.mode === "close" && !!props.askStartTime && (selected ?? 0) > 0;
  const startValid = HHMM.test(startHHmm.trim());
  const ceilingMs = TimeAuthorityService.futureCeiling();
  const maximumDate = timePickerMaximum(ceilingMs);
  let lunchError: string | undefined;
  const fixedTooLong =
    props.mode === "close" &&
    selected != null &&
    selected > 0 &&
    props.sessionStartMs != null &&
    props.sessionEndMs != null &&
    fixedLunchExceedsSession({ startAtMs: null, endAtMs: null, deductedMinutes: selected }, props.sessionStartMs, props.sessionEndMs);
  if (fixedTooLong) lunchError = t("modals.lunchMustFit");
  if (!lunchError && props.mode === "close" && needsStart && startValid && props.sessionStartMs != null && props.sessionEndMs != null) {
    const [h, m] = startHHmm.trim().split(":").map(Number);
    const lunchStart = wallMinutesOnOrAfter(props.sessionStartMs, h * 60 + m);
    const lunchEnd = lunchStart + (selected ?? 0) * 60_000;
    if (lunchStart > ceilingMs || lunchEnd > ceilingMs) lunchError = t("modals.futureTime");
    else if (lunchOutsideSession(props.sessionStartMs, props.sessionEndMs, lunchStart, lunchEnd)) lunchError = t("modals.lunchOutside");
  }
  const chain = useFormFocusChain(FORM_FIELDS.lunchStart, {
    canSubmit: props.mode === "close" && selected !== null && (!needsStart || startValid) && !lunchError,
    onSubmit: () => {
      if (props.mode !== "close" || selected === null || (needsStart && !startValid)) return;
      props.onConfirm(selected, needsStart ? startHHmm.trim() : null);
    },
  });

  if (props.mode === "supervisor") {
    const busy = props.busy === true;
    return (
      <ModalShell
        visible={props.visible}
        title={t("modals.lunchSupervisorTitle")}
        description={`${t("modals.lunchElapsed")}: ${props.elapsed}`}
        icon={ICONS.domain.lunch}
        onClose={props.onCancel}
        primaryAction={{ label: t("cta.resume"), onPress: () => { if (!busy) props.onResume(); }, disabled: busy }}
        secondaryAction={{ label: t("cta.finishDay"), onPress: () => { if (!busy) props.onFinish(); }, variant: "secondary", disabled: busy }}
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
      primaryAction={{
        label: t("cta.finishDay"),
        onPress: () => props.onConfirm(selected, needsStart ? startHHmm.trim() : null),
        disabled: selected === null || (needsStart && !HHMM.test(startHHmm.trim())) || !!lunchError || props.busy === true,
        loading: props.busy === true,
      }}
      secondaryAction={{ label: t("common.cancel"), onPress: props.onCancel }}
    >
      <View style={styles.optionsGrid} testID="lunch-options">
        {OPTIONS.map((min) => (
          <SelectableCard
            key={min}
            label={min === 0 ? t("modals.lunchNo") : `${min} ${t("common.minutes")}`}
            accessibilityLabel={min === 0 ? t("modals.lunchNo") : `${min} ${t("common.minutes")}`}
            selected={selected === min}
            onPress={() => setSelected(min)}
            style={styles.optionPill}
          />
        ))}
      </View>
      {selected === null ? <Text style={[styles.hint, { color: colors.text.secondary }]}>{t("modals.pickLunch")}</Text> : null}
      {selected !== null ? (
        <Text style={[styles.hint, { color: colors.text.secondary }]} testID="lunch-preview" accessibilityLiveRegion="polite">
          {t("modals.lunchPreview", { minutes: selected })}
          {props.netMinutes != null && props.netMinutes > 0 && props.grossEstimate != null
            ? ` · ${formatCurrency((props.grossEstimate * Math.max(0, props.netMinutes - selected)) / props.netMinutes)}`
            : ""}
        </Text>
      ) : null}
      {lunchError && !needsStart ? <Text style={[styles.hint, { color: colors.status.warning }]}>{lunchError}</Text> : null}
      {needsStart ? (
        <View style={styles.startRow}>
          <Input {...chain.props("start")} label={t("modals.lunchStartQuestion")} value={startHHmm} onChangeText={setStartHHmm} placeholder="12:30" mask="HH:mm" maximumDate={maximumDate} error={lunchError} testID="lunch-start" />
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
    minHeight: TOKENS.layout.minTouchTarget,
    paddingVertical: TOKENS.spacing.md,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: TOKENS.radius.md,
    borderWidth: TOKENS.layout.hairline,
  },
  startRow: { marginTop: TOKENS.spacing.md, gap: TOKENS.spacing.xs },
  hint: { ...FONT.caption },
});
