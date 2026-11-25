/**
 * BackupSection — Ajustes → «Copia de seguridad». Es el ÚNICO sitio donde se
 * crea o se consume un archivo restaurable (.dtbackup). Reportes solo
 * entrega documentos de nómina.
 *
 *  - Estado real: fecha de la última copia creada en este teléfono y lo que
 *    hay ahora (jornadas, destinos, expedientes).
 *  - Crear: contraseña ×2 → EXPORT_BACKUP (hoja de compartir).
 *  - Restaurar: contraseña → PREVIEW_BACKUP_IMPORT (selector del sistema,
 *    descifra y valida; no escribe) → resumen → confirmación destructiva →
 *    IMPORT_BACKUP. Con PIN de administración, exige la zona desbloqueada.
 */
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { TOKENS, FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { useBusyAction, useClock, useQuery, useWorkTracker } from "../../core/hooks";
import { selectActiveSession, selectAdmin, selectIsAdminUnlocked } from "../../core/selectors";
import { t, useLanguage } from "../../i18n";
import { formatDate, formatDateTime } from "../../utils/dateUtils";
import { ConfirmActionModal } from "../modals/ConfirmActionModal";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

/** Igual que backupCodec.BACKUP_PASSPHRASE_MIN (la UI no importa servicios). */
export const BACKUP_PASSPHRASE_MIN_UI = 8;

interface Summary {
  createdAtMs: number;
  sessions: number;
  packs: number;
  fromMs: number | null;
  toMs: number | null;
  unreadable: number;
}

export function BackupSection() {
  useLanguage();
  const { colors } = useTheme();
  const { state, emit, queries } = useWorkTracker();
  const nowMs = useClock(15_000);
  const status = useQuery(() => queries.backupStatus(), [], ["settings"]);
  const { busy: working, run } = useBusyAction();
  // Restaurar tiene su propio anti-doble toque: confirmar justo después de revisar no queda bloqueado.
  const { busy: restoring, run: runRestore } = useBusyAction();
  const busy = working || restoring;
  const [pass, setPass] = useState("");
  const [repeat, setRepeat] = useState("");
  const [restorePass, setRestorePass] = useState("");
  const [preview, setPreview] = useState<{ token: string; summary: Summary } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const open = selectActiveSession(state) !== null;
  const admin = selectAdmin(state);
  const restoreLocked = admin.hasPin && !selectIsAdminUnlocked(state, nowMs);
  const sessions = Object.values(state.sessions.byId).filter((s) => !s.bookkeeping.isDeleted).length;
  const sites = Object.keys(state.sites.byId).length;
  const packs = Object.keys(state.packs.byId).length;

  const longEnough = [...pass].length >= BACKUP_PASSPHRASE_MIN_UI;
  const mismatch = repeat.length > 0 && repeat !== pass;
  const canCreate = !open && !busy && longEnough && repeat === pass;
  const canPick = !open && !busy && !restoreLocked && [...restorePass].length >= BACKUP_PASSPHRASE_MIN_UI;
  const last = status.data?.lastCreatedAtMs ?? null;

  const create = () =>
    void run(async () => {
      const res = await emit({ type: "EXPORT_BACKUP", passphrase: pass });
      if (res.ok) {
        setPass("");
        setRepeat("");
        status.reload();
      }
      return res;
    });

  const pick = () =>
    void run(async () => {
      const res = await emit({ type: "PREVIEW_BACKUP_IMPORT", passphrase: restorePass });
      if (res.ok) {
        setPreview(res.data as { token: string; summary: Summary });
        setRestorePass("");
      }
      // Cerrar el selector sin elegir no es un fallo que haya que avisar.
      return res.ok || res.code === "BACKUP_PICK_CANCELLED" ? { ok: true as const } : res;
    });

  const discard = () => {
    setPreview(null);
    void emit({ type: "CANCEL_BACKUP_IMPORT" });
  };

  const restore = () => {
    if (!preview) return;
    const token = preview.token;
    void runRestore(async () => {
      const res = await emit({ type: "IMPORT_BACKUP", token });
      setConfirming(false);
      if (res.ok || res.code === "BACKUP_EXPIRED") setPreview(null);
      if (res.ok) status.reload();
      return res;
    });
  };

  const s = preview?.summary;
  return (
    <View style={styles.wrap} testID="backup-section">
      <Text style={[styles.hint, { color: colors.text.secondary }]}>{t("settings.backup.body")}</Text>
      <Text style={[styles.status, { color: last ? colors.text.primary : colors.statusText.warning }]} testID="backup-last">
        {last ? t("settings.backup.lastCreated", { date: formatDateTime(last) }) : t("settings.backup.never")}
      </Text>
      <Text style={[styles.hint, { color: colors.text.muted }]}>{t("settings.backup.contents", { sessions, sites, packs })}</Text>
      {open ? (
        <Text style={[styles.hint, { color: colors.statusText.warning }]} testID="backup-open-session">
          {t("settings.backup.openSession")}
        </Text>
      ) : null}

      <Input
        label={t("settings.backup.passphrase")}
        value={pass}
        onChangeText={setPass}
        secureToggle
        autoCapitalize="none"
        autoCorrect={false}
        hint={t("settings.backup.passphraseHint", { min: BACKUP_PASSPHRASE_MIN_UI })}
        testID="backup-pass"
      />
      <Input
        label={t("settings.backup.passphraseRepeat")}
        value={repeat}
        onChangeText={setRepeat}
        secureToggle
        autoCapitalize="none"
        autoCorrect={false}
        error={mismatch ? t("settings.backup.mismatch") : undefined}
        testID="backup-pass-repeat"
      />
      <Button label={t("settings.backup.create")} size="sm" iconName="save-outline" disabled={!canCreate} isLoading={busy} onPress={create} testID="backup-create" />
      <Text style={[styles.hint, { color: colors.text.muted }]}>{t("settings.backup.createHint")}</Text>

      <Text style={[styles.label, { color: colors.text.secondary }]}>{t("settings.backup.restoreTitle")}</Text>
      <Text style={[styles.hint, { color: colors.text.secondary }]}>{t("settings.backup.restoreBody")}</Text>
      {restoreLocked ? (
        <Text style={[styles.hint, { color: colors.statusText.warning }]} testID="backup-admin-required">
          {t("settings.backup.adminRequired")}
        </Text>
      ) : null}
      {s ? (
        <View style={styles.preview} testID="backup-preview">
          <Text style={[styles.status, { color: colors.text.primary }]}>
            {s.sessions > 0
              ? t("settings.backup.preview", {
                  created: formatDateTime(s.createdAtMs),
                  sessions: s.sessions,
                  packs: s.packs,
                  from: s.fromMs !== null ? formatDate(s.fromMs) : "—",
                  to: s.toMs !== null ? formatDate(s.toMs) : "—",
                })
              : t("settings.backup.previewEmpty", { created: formatDateTime(s.createdAtMs) })}
          </Text>
          <Text style={[styles.hint, { color: colors.statusText.success }]}>{t("settings.backup.chainOk")}</Text>
          {s.unreadable > 0 ? <Text style={[styles.hint, { color: colors.statusText.warning }]}>{t("settings.backup.unreadable", { n: s.unreadable })}</Text> : null}
          <Text style={[styles.hint, { color: colors.text.muted }]}>{t("settings.backup.pdfNote")}</Text>
          <View style={styles.row}>
            <Button label={t("common.cancel")} variant="secondary" size="sm" disabled={busy} onPress={discard} testID="backup-discard" />
            <Button
              label={t("settings.backup.restore")}
              variant="danger"
              size="sm"
              disabled={busy || open || restoreLocked}
              onPress={() => setConfirming(true)}
              testID="backup-restore"
            />
          </View>
        </View>
      ) : (
        <>
          <Input
            label={t("settings.backup.restorePassphrase")}
            value={restorePass}
            onChangeText={setRestorePass}
            secureToggle
            autoCapitalize="none"
            autoCorrect={false}
            testID="backup-restore-pass"
          />
          <Button label={t("settings.backup.pick")} variant="secondary" size="sm" iconName="folder-open-outline" disabled={!canPick} isLoading={busy} onPress={pick} testID="backup-pick" />
        </>
      )}
      <ConfirmActionModal
        visible={confirming}
        title={t("settings.backup.confirmTitle")}
        description={t("settings.backup.confirmBody")}
        confirmLabel={t("settings.backup.confirm")}
        tone="danger"
        busy={busy}
        onCancel={() => setConfirming(false)}
        onConfirm={restore}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: TOKENS.spacing.sm },
  label: { ...FONT.label, marginTop: TOKENS.spacing.md },
  status: { ...FONT.bodyStrong },
  hint: { ...FONT.caption },
  preview: { gap: TOKENS.spacing.sm },
  row: { flexDirection: "row", flexWrap: "wrap", gap: TOKENS.spacing.sm },
});
