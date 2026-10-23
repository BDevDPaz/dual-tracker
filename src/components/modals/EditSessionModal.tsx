import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { ModalShell } from "../ui/ModalShell";
import { Input } from "../ui/Input";
import { useFormFocusChain } from "../ui/formChain";
import { FORM_FIELDS } from "../ui/formFields";
import { ICONS } from "../../constants/icons";
import { TOKENS, FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import type { CompanyPolicy, PayrollRates, SessionRecord } from "../../core/contracts";
import { t, useLanguage } from "../../i18n";
import { PayrollEngineService } from "../../services/domain/PayrollEngineService";
import { TimeAuthorityService } from "../../services/evidence/TimeAuthorityService";
import { fixedLunchExceedsSession, timePickerMaximum } from "../../services/domain/sessionTimeGuard";
import { formatCurrency, resolveSessionEditTimes, toHHmm } from "../../utils/dateUtils";

/**
 * EditSessionModal — portado de GEOTrack (que traía horas de ejemplo en duro
 * "04:56 PM" y un chequeo "??" de datos corruptos simulados).
 *  - Precarga las horas reales de la sesión.
 *  - Los HH:mm prefijados no se reconstruyen: si el usuario no los cambia,
 *    se conservan los epoch ms (una sesión del mismo minuto no pasa a 24 h
 *    y los segundos no se truncan). Ver resolveSessionEditTimes.
 *  - Si cambia un reloj, salida ≤ entrada ⇒ día siguiente (spec v1.3 §5.2 N6),
 *    igualdad tecleada incluida. El aviso «Termina al día siguiente» lo dice.
 *  - Nota OBLIGATORIA si cambian horas (requiresAuditNote / sessionMachine).
 *    Una nota sin cambio de HH:mm no habilita Guardar: MANUAL_PATCH rechaza
 *    NO_CHANGE. La nota sola va por AddNoteModal (ADD_NOTE).
 *  - Banner de solape REAL vía PersistenceService.checkOverlap (inyectado como
 *    `checkOverlap`), no la regla demo "00:00" de W Tracker.
 */
interface EditSessionModalProps {
  visible: boolean;
  session: SessionRecord | null;
  busy?: boolean;
  onCancel: () => void;
  onSave: (patch: { declaredStartAtMs: number; endAtMs: number | null; note: string }) => void;
  checkOverlap: (startMs: number, endMs: number | null, excludeId: number | null) => Promise<boolean>;
  /** Solo para la vista previa de solo lectura. No guarda el total. */
  rates?: PayrollRates;
  company?: CompanyPolicy;
  nowMs?: number;
}

export function EditSessionModal({ visible, session, busy = false, onCancel, onSave, checkOverlap, rates, company, nowMs }: EditSessionModalProps) {
  useLanguage();
  const { colors } = useTheme();
  const base = session ? session.actualStartAtMs ?? session.declaredStartAtMs : 0;
  const [inTime, setInTime] = useState("");
  const [outTime, setOutTime] = useState("");
  const [note, setNote] = useState("");
  const [overlap, setOverlap] = useState(false);

  useEffect(() => {
    if (visible && session) {
      setInTime(toHHmm(base));
      setOutTime(toHHmm(session.endAtMs));
      setNote("");
      setOverlap(false);
    }
  }, [visible, session, base]);

  // HH:mm sin tocar → ms almacenados. Relojes editados → N6 (≤ ⇒ día siguiente).
  const resolved = session ? resolveSessionEditTimes(base, session.endAtMs, inTime, outTime) : null;
  const start = resolved?.start ?? null;
  const end = resolved?.end ?? null;
  const nextDay = resolved?.nextDay ?? false;
  const invalidStart = resolved?.invalidStart ?? false;
  const invalidEnd = resolved?.invalidEnd ?? false;
  const changed = resolved?.timesChanged ?? false;
  const ceilingMs = TimeAuthorityService.futureCeiling();
  const maximumDate = timePickerMaximum(ceilingMs);
  const startFuture = start !== null && start > ceilingMs;
  const endFuture = end !== null && end > ceilingMs;
  const future = startFuture || endFuture;
  const orderError = start !== null && end !== null && end <= start;
  const lunchTooLong = !!session && start !== null && end !== null && fixedLunchExceedsSession(session.lunch, start, end);
  const startError = invalidStart ? t("common.invalidTime") : startFuture ? t("modals.futureTime") : undefined;
  const endError = invalidEnd
    ? t("common.invalidTime")
    : endFuture
      ? t("modals.futureTime")
      : orderError
        ? t("modals.endNotAfterStart")
        : lunchTooLong
          ? t("modals.lunchMustFit")
          : undefined;

  useEffect(() => {
    let alive = true;
    if (!session || start === null || invalidEnd) return;
    checkOverlap(start, end, session.id)
      .then((r) => alive && setOverlap(r))
      .catch(() => alive && setOverlap(false));
    return () => {
      alive = false;
    };
  }, [session, start, end, invalidEnd, checkOverlap]);

  let previewTotal = "—";
  if (session && rates && company && start !== null && end !== null && !invalidEnd && !orderError) {
    const clone: SessionRecord = {
      ...session,
      declaredStartAtMs: start,
      actualStartAtMs: start,
      endAtMs: end,
      domainStatus: "CERRADA",
    };
    const preview = PayrollEngineService.previewSession(clone, rates, company, nowMs ?? end);
    if (preview && Number.isFinite(preview.grossEstimate)) previewTotal = formatCurrency(preview.grossEstimate);
  }
  const canSave = !!session && start !== null && !invalidEnd && !future && !orderError && !lunchTooLong && changed && note.trim().length > 0 && !overlap;
  const chain = useFormFocusChain(FORM_FIELDS.editSession, {
    canSubmit: canSave && !busy,
    onSubmit: () => {
      if (start !== null) onSave({ declaredStartAtMs: start, endAtMs: end, note: note.trim() });
    },
  });

  return (
    <ModalShell
      visible={visible}
      title={t("modals.editTitle")}
      onClose={onCancel}
      showCloseButton={false}
      icon={ICONS.actions.edit}
      scrollable
      primaryAction={{
        label: t("common.save"),
        onPress: () => start !== null && onSave({ declaredStartAtMs: start, endAtMs: end, note: note.trim() }),
        disabled: !canSave,
        loading: busy,
      }}
      secondaryAction={{ label: t("common.cancel"), onPress: onCancel }}
    >
      {overlap ? (
        <View style={[styles.banner, { borderColor: colors.status.warning }]}>
          <Text style={[styles.bannerText, { color: colors.status.warning }]}>{t("modals.overlapBanner")}</Text>
        </View>
      ) : null}
      <View style={styles.row}>
        <Input {...chain.props("start")} label={t("modals.editStart")} value={inTime} onChangeText={setInTime} placeholder="08:00" mask="HH:mm" maximumDate={maximumDate} error={startError} containerStyle={styles.flexInput} testID="edit-start" />
        <Input {...chain.props("end")} label={t("modals.editEnd")} value={outTime} onChangeText={setOutTime} placeholder="17:00" mask="HH:mm" maximumDate={maximumDate} error={endError} containerStyle={styles.flexInput} testID="edit-end" />
      </View>
      {nextDay ? <Text style={[styles.nextDay, { color: colors.text.secondary }]}>{t("modals.endsNextDay")}</Text> : null}
      <Input {...chain.props("note")} label={t("modals.editNote")} value={note} onChangeText={setNote} multiline numberOfLines={3} style={styles.textArea} testID="edit-note" />
      <Text style={[styles.nextDay, { color: colors.text.secondary }]} testID="edit-preview" accessibilityLiveRegion="polite">
        {t("modals.editPreview", { total: previewTotal })}
      </Text>
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: TOKENS.spacing.md },
  flexInput: { flex: 1 },
  textArea: { height: TOKENS.layout.textArea, textAlignVertical: "top" },
  banner: { borderWidth: TOKENS.layout.hairline, borderRadius: TOKENS.radius.md, padding: TOKENS.spacing.md, marginBottom: TOKENS.spacing.md },
  bannerText: { ...FONT.caption },
  nextDay: { ...FONT.caption, marginTop: -TOKENS.spacing.xs, marginBottom: TOKENS.spacing.sm },
});
