import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { ModalShell } from "../ui/ModalShell";
import { Input } from "../ui/Input";
import { ICONS } from "../../constants/icons";
import { TOKENS, FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import type { SessionRecord } from "../../core/contracts";
import { t } from "../../i18n";
import { resolveSessionEditTimes, toHHmm } from "../../utils/dateUtils";

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
}

export function EditSessionModal({ visible, session, busy = false, onCancel, onSave, checkOverlap }: EditSessionModalProps) {
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

  const canSave = !!session && start !== null && !invalidEnd && changed && note.trim().length > 0 && !overlap;

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
        <Input label={t("modals.editStart")} value={inTime} onChangeText={setInTime} placeholder="08:00" mask="HH:mm" error={invalidStart ? t("common.invalidTime") : undefined} containerStyle={styles.flexInput} testID="edit-start" />
        <Input label={t("modals.editEnd")} value={outTime} onChangeText={setOutTime} placeholder="17:00" mask="HH:mm" error={invalidEnd ? t("common.invalidTime") : undefined} containerStyle={styles.flexInput} testID="edit-end" />
      </View>
      {nextDay ? <Text style={[styles.nextDay, { color: colors.text.secondary }]}>{t("modals.endsNextDay")}</Text> : null}
      <Input label={t("modals.editNote")} value={note} onChangeText={setNote} multiline numberOfLines={3} style={styles.textArea} testID="edit-note" />
    </ModalShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: TOKENS.spacing.md },
  flexInput: { flex: 1 },
  textArea: { height: 90, textAlignVertical: "top" },
  banner: { borderWidth: 1, borderRadius: TOKENS.radius.md, padding: TOKENS.spacing.md, marginBottom: TOKENS.spacing.md },
  bannerText: { ...FONT.caption },
  nextDay: { ...FONT.caption, marginTop: -TOKENS.spacing.xs, marginBottom: TOKENS.spacing.sm },
});
