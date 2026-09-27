/**
 * (tabs)/settings.tsx — Ajustes y política (Producto §5.14). REDISEÑO.
 * Regiones: perfil laboral (siempre editable), monitoreo (estado REAL desde
 * PermissionsHealthService, no toggle simulado), destinos, zona
 * administrativa (SecurityService, PIN real; sin '1234') y legal.
 * Footer "Guardar" solo con cambios pendientes. Intenciones: SAVE_SETTINGS,
 * UNLOCK_ADMIN, LOCK_ADMIN, SETUP_ADMIN_PIN, OPEN_OS_SETTINGS.
 */
import { Fragment, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Button, Card, Input, PageHeader, ScreenContainer, Section, StatusPill } from "../../src/components/ui";
import { KeyValueRow } from "../../src/components/blocks";
import { TOKENS, FONT } from "../../src/constants/theme";
import { PIN_MIN_LENGTH } from "../../src/constants/security";
import type { SettingsPatch, TraceMode } from "../../src/core/contracts";
import { useClock, useWorkTracker } from "../../src/core/hooks";
import {
  selectAdmin,
  selectCalendarHistory,
  selectHealth,
  selectIsAdminUnlocked,
  selectPendingCalendarChange,
  selectSettings,
  selectSystemHealth,
} from "../../src/core/selectors";
import { legalFlags } from "../../src/utils/companyPolicy";
import { calendarAt, formatDateTime } from "../../src/utils/dateUtils";
import { t } from "../../src/i18n";

interface Draft {
  employeeName: string;
  language: "es" | "en";
  dailyReminderTime: string;
  hourlyRate: string;
  employerName: string;
  companyEmail: string;
  overtimeMultiplier: string;
  overtimePolicyId: string;
  traceRetentionDays: string;
  traceMode: TraceMode;
  defaultRadiusM: string;
}

export default function SettingsScreen() {
  const router = useRouter();
  const { state, emit, queries } = useWorkTracker();
  const nowMs = useClock(15_000);
  const settings = selectSettings(state);
  const admin = selectAdmin(state);
  const unlocked = selectIsAdminUnlocked(state, nowMs);
  const health = selectHealth(state);
  const sys = selectSystemHealth(state);

  const initial = useMemo<Draft>(
    () => ({
      employeeName: settings.profile.employeeName,
      language: settings.profile.language,
      dailyReminderTime: settings.profile.dailyReminderTime,
      hourlyRate: String(settings.profile.hourlyRate),
      employerName: settings.company.employerName,
      companyEmail: settings.company.companyEmail,
      overtimeMultiplier: String(settings.company.overtimeMultiplier),
      overtimePolicyId: settings.company.overtimePolicyId,
      traceRetentionDays: String(settings.company.traceRetentionDays),
      traceMode: settings.company.traceMode,
      defaultRadiusM: String(settings.company.defaultRadiusM),
    }),
    [settings],
  );
  const [draft, setDraft] = useState<Draft>(initial);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(initial), [initial]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const dirty = (Object.keys(draft) as (keyof Draft)[]).some((k) => draft[k] !== initial[k]);

  const num = (s: string) => Number(s.replace(",", "."));
  const onSave = async () => {
    const patch: SettingsPatch = {
      profile: { employeeName: draft.employeeName.trim(), language: draft.language, dailyReminderTime: draft.dailyReminderTime },
    };
    if (unlocked) {
      if (draft.hourlyRate !== initial.hourlyRate) patch.profile!.hourlyRate = num(draft.hourlyRate);
      patch.company = {
        employerName: draft.employerName.trim(),
        companyEmail: draft.companyEmail.trim(),
        overtimeMultiplier: num(draft.overtimeMultiplier),
        overtimePolicyId: draft.overtimePolicyId,
        traceRetentionDays: Math.round(num(draft.traceRetentionDays)),
        traceMode: draft.traceMode,
        defaultRadiusM: Math.round(num(draft.defaultRadiusM)),
      };
    }
    setBusy(true);
    await emit({ type: "SAVE_SETTINGS", patch });
    setBusy(false);
  };

  const onAdminPin = async () => {
    setBusy(true);
    await emit(admin.hasPin ? { type: "UNLOCK_ADMIN", pin } : { type: "SETUP_ADMIN_PIN", pin });
    setPin("");
    setBusy(false);
  };

  const permTone = (ok: boolean) => (ok ? "success" : "warning");

  return (
    <ScreenContainer noPadding>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <PageHeader title={t("settings.title")} />

        <Section title={t("settings.profile")}>
          <Input label={t("onboarding.employeeName")} value={draft.employeeName} onChangeText={(v) => set("employeeName", v)} />
          <Text style={[styles.label, { color: TOKENS.colors.text.secondary }]}>{t("onboarding.language")}</Text>
          <View style={styles.row}>
            {(["es", "en"] as const).map((l) => (
              <Chip key={l} label={l.toUpperCase()} selected={draft.language === l} onPress={() => set("language", l)} />
            ))}
          </View>
          <Input label={t("onboarding.reminderTime")} value={draft.dailyReminderTime} onChangeText={(v) => set("dailyReminderTime", v)} />
        </Section>

        <Section title={t("settings.monitoring")}>
          <Card style={styles.card}>
            <View style={styles.statusRow}>
              <Text style={{ color: TOKENS.colors.text.primary }}>{t("health.gps")}</Text>
              <StatusPill tone={permTone(sys.gpsOk)} label={t(`permission.${health.locationForeground}`)} />
            </View>
            <View style={styles.statusRow}>
              <Text style={{ color: TOKENS.colors.text.primary }}>{t("health.background")}</Text>
              <StatusPill tone={permTone(sys.backgroundOk)} label={t(`permission.${health.locationBackground}`)} />
            </View>
            <View style={styles.statusRow}>
              <Text style={{ color: TOKENS.colors.text.primary }}>{t("health.sensors.foregroundService")}</Text>
              <StatusPill tone={health.foregroundService === "running" ? "success" : "neutral"} label={health.foregroundService} />
            </View>
            <View style={styles.statusRow}>
              <Text style={{ color: TOKENS.colors.text.primary }}>{t("settings.traceMode")}</Text>
              <Text style={{ color: TOKENS.colors.text.secondary }}>{t(`settings.traceModes.${settings.company.traceMode}`)}</Text>
            </View>
            <Button label={t("settings.openHealth")} variant="secondary" size="sm" onPress={() => router.push("/system/health")} />
            <Button label={t("settings.openOsSettings")} variant="ghost" size="sm" onPress={() => void emit({ type: "OPEN_OS_SETTINGS", target: "APP" })} />
          </Card>
        </Section>

        <Section title={t("settings.sites")}>
          <Card style={styles.card}>
            <KeyValueRow label={t("settings.defaultRadius")} value={`${settings.company.defaultRadiusM} m`} />
            <Button label={t("cta.manageSites")} variant="secondary" size="sm" onPress={() => router.push("/sites")} />
          </Card>
        </Section>

        <Section title={t("settings.admin")}>
          {!unlocked ? (
            <Card style={styles.card}>
              <View style={styles.statusRow}>
                <Ionicons name="lock-closed-outline" size={18} color={TOKENS.colors.text.secondary} />
                <Text style={[styles.hint, { color: TOKENS.colors.text.secondary }]}>
                  {admin.hasPin ? t("settings.adminLocked") : t("settings.adminSetup", { min: PIN_MIN_LENGTH })}
                </Text>
              </View>
              <Input label={t("settings.pin")} value={pin} onChangeText={setPin} secureTextEntry keyboardType="number-pad" />
              <Button
                label={admin.hasPin ? t("settings.unlock") : t("settings.setPin")}
                disabled={pin.length < PIN_MIN_LENGTH || busy || admin.status === "locked_out"}
                isLoading={busy && admin.status === "validating"}
                onPress={() => void onAdminPin()}
              />
              {/* TODO(propuesta): aprovisionamiento del PIN por el empleador (hoy lo fija el primer usuario del dispositivo). */}
            </Card>
          ) : (
            <Card style={styles.card}>
              <Input label={t("onboarding.hourlyRate")} value={draft.hourlyRate} onChangeText={(v) => set("hourlyRate", v)} keyboardType="decimal-pad" />
              <Input label={t("settings.overtimeMultiplier")} value={draft.overtimeMultiplier} onChangeText={(v) => set("overtimeMultiplier", v)} keyboardType="decimal-pad" />
              <Input label={t("settings.employerName")} value={draft.employerName} onChangeText={(v) => set("employerName", v)} />
              <Input label={t("settings.companyEmail")} value={draft.companyEmail} onChangeText={(v) => set("companyEmail", v)} keyboardType="email-address" autoCapitalize="none" />
              <Text style={[styles.label, { color: TOKENS.colors.text.secondary }]}>{t("settings.overtimePolicy")}</Text>
              <View style={styles.row}>
                {queries.payrollPolicies().map((p) => (
                  <Chip key={p.id} label={p.label} selected={draft.overtimePolicyId === p.id} onPress={() => set("overtimePolicyId", p.id)} />
                ))}
              </View>
              <Text style={[styles.label, { color: TOKENS.colors.text.secondary }]}>{t("settings.traceMode")}</Text>
              <View style={styles.row}>
                {(["PERIMETER", "BREADCRUMB"] as const).map((m) => (
                  <Chip key={m} label={t(`settings.traceModes.${m}`)} selected={draft.traceMode === m} onPress={() => set("traceMode", m)} />
                ))}
              </View>
              <Input label={t("settings.retention")} value={draft.traceRetentionDays} onChangeText={(v) => set("traceRetentionDays", v)} keyboardType="number-pad" />
              <Input label={t("settings.defaultRadius")} value={draft.defaultRadiusM} onChangeText={(v) => set("defaultRadiusM", v)} keyboardType="number-pad" />
              <WorkCalendarBlock />
              <Button label={t("settings.lock")} variant="ghost" size="sm" iconName="lock-closed-outline" onPress={() => void emit({ type: "LOCK_ADMIN" })} />
            </Card>
          )}
        </Section>

        <Section title={t("settings.legal")}>
          <Card style={styles.card}>
            <LinkRow label={t("settings.disclosure")} onPress={() => router.push("/legal/disclosure")} />
            <LinkRow label={t("settings.retentionPolicy")} onPress={() => router.push("/legal/retention")} />
          </Card>
        </Section>
      </ScrollView>

      {dirty ? (
        <View style={[styles.footer, { backgroundColor: TOKENS.colors.surface, borderColor: TOKENS.colors.border }]}>
          <Button label={t("common.save")} isLoading={busy} onPress={() => void onSave()} />
        </View>
      ) : null}
    </ScreenContainer>
  );
}

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const;
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * Calendario laboral (spec v1.3 §5.1) [CONFIRMAR CON ASESORÍA LEGAL]: inicio de
 * jornada y día de inicio de semana. El cambio es prospectivo (final de la
 * semana en curso) y se puede anular antes de entrar en vigor.
 */
function WorkCalendarBlock() {
  const { state, emit } = useWorkTracker();
  const nowMs = useClock(60_000);
  const current = calendarAt(nowMs, selectCalendarHistory(state));
  const pending = selectPendingCalendarChange(state, nowMs);
  const flags = legalFlags(selectSettings(state).company);
  const [start, setStart] = useState(hhmm(current.workdayStartMinutes));
  const [day, setDay] = useState<number>(current.workweekStartDay);
  const [busy, setBusy] = useState(false);
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(start.trim());
  const minutes = m ? Number(m[1]) * 60 + Number(m[2]) : null;
  const changed = minutes !== null && (minutes !== current.workdayStartMinutes || day !== current.workweekStartDay);

  const run = async (intent: Parameters<typeof emit>[0]) => {
    setBusy(true);
    await emit(intent);
    setBusy(false);
  };

  return (
    <View style={styles.calendar}>
      <Text style={[styles.label, { color: TOKENS.colors.text.secondary }]}>{t("settings.calendar.title")}</Text>
      <KeyValueRow
        label={t("settings.calendar.current")}
        value={`${hhmm(current.workdayStartMinutes)} · ${t(`settings.calendar.days.${current.workweekStartDay}`)}`}
      />
      {pending ? (
        <>
          <Text style={[styles.hint, { color: TOKENS.colors.status.warning }]}>
            {t("settings.calendar.pending", {
              start: hhmm(pending.workdayStartMinutes),
              day: t(`settings.calendar.days.${pending.workweekStartDay}`),
              date: formatDateTime(pending.effectiveFromMs),
            })}
          </Text>
          <Button label={t("settings.calendar.cancel")} variant="secondary" size="sm" disabled={busy} onPress={() => void run({ type: "CANCEL_CALENDAR_CHANGE" })} />
        </>
      ) : (
        <>
          <Input label={t("settings.calendar.workdayStart")} value={start} onChangeText={setStart} placeholder="00:00" />
          <Text style={[styles.label, { color: TOKENS.colors.text.secondary }]}>{t("settings.calendar.weekStart")}</Text>
          <View style={styles.row}>
            {WEEKDAYS.map((d) => (
              <Chip key={d} label={t(`settings.calendar.days.${d}`)} selected={day === d} onPress={() => setDay(d)} />
            ))}
          </View>
          <Text style={[styles.hint, { color: TOKENS.colors.text.muted }]}>{t("settings.calendar.hint")}</Text>
          <Button
            label={t("settings.calendar.schedule")}
            size="sm"
            disabled={!changed || busy}
            isLoading={busy}
            onPress={() => void run({ type: "SAVE_SETTINGS", patch: { calendar: { workdayStartMinutes: minutes!, workweekStartDay: day } } })}
          />
        </>
      )}
      <Text style={[styles.label, { color: TOKENS.colors.text.secondary }]}>{t("settings.calendar.transitionThreshold")}</Text>
      <View style={styles.row}>
        {(["FULL", "PRORATED"] as const).map((v) => (
          <Chip
            key={v}
            label={t(`settings.calendar.threshold.${v}`)}
            selected={flags.transitionWeeklyThreshold === v}
            onPress={() => void run({ type: "SAVE_SETTINGS", patch: { company: { payrollLegalFlags: { ...flags, transitionWeeklyThreshold: v } } } })}
          />
        ))}
      </View>
      {(["caDoubleTime", "caSeventhDay"] as const).map((flag) => (
        <Fragment key={flag}>
          <Text style={[styles.label, { color: TOKENS.colors.text.secondary }]}>{t(`settings.calendar.${flag}`)}</Text>
          <View style={styles.row}>
            {([false, true] as const).map((v) => (
              <Chip
                key={String(v)}
                label={t(v ? "settings.calendar.flagOn" : "settings.calendar.flagOff")}
                selected={flags[flag] === v}
                onPress={() => void run({ type: "SAVE_SETTINGS", patch: { company: { payrollLegalFlags: { ...flags, [flag]: v } } } })}
              />
            ))}
          </View>
        </Fragment>
      ))}
      <Text style={[styles.hint, { color: TOKENS.colors.text.muted }]}>{t("settings.legalReview")}</Text>
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.chip, { borderColor: selected ? TOKENS.colors.primary : TOKENS.colors.border }]}
    >
      <Text style={{ color: selected ? TOKENS.colors.primary : TOKENS.colors.text.secondary }}>{label}</Text>
    </Pressable>
  );
}

function LinkRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" style={styles.statusRow}>
      <Text style={{ color: TOKENS.colors.text.primary }}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={TOKENS.colors.text.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: TOKENS.layout.screenPadding, paddingVertical: TOKENS.spacing.lg, gap: TOKENS.spacing.md, paddingBottom: 120 },
  card: { padding: TOKENS.spacing.lg, gap: TOKENS.spacing.sm },
  label: { ...FONT.label, marginTop: TOKENS.spacing.sm },
  row: { flexDirection: "row", flexWrap: "wrap", gap: TOKENS.spacing.sm, marginBottom: TOKENS.spacing.sm },
  statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: TOKENS.spacing.sm, paddingVertical: TOKENS.spacing.xs },
  hint: { ...FONT.caption, flex: 1 },
  calendar: { gap: TOKENS.spacing.sm, marginTop: TOKENS.spacing.sm },
  chip: { borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: TOKENS.spacing.md },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: TOKENS.spacing.lg, borderTopWidth: 1 },
});
