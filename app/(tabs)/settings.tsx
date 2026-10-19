/**
 * (tabs)/settings.tsx — Ajustes y política (Producto §5.14). REDISEÑO.
 * Regiones: perfil laboral (siempre editable), monitoreo (estado REAL desde
 * PermissionsHealthService, no toggle simulado), destinos, zona
 * administrativa (SecurityService, PIN real; sin '1234') y legal.
 * Footer "Guardar" solo con cambios pendientes. Intenciones: SAVE_SETTINGS,
 * UNLOCK_ADMIN, LOCK_ADMIN, SETUP_ADMIN_PIN, OPEN_OS_SETTINGS.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Button, Card, Chip, Input, PageHeader, PrimaryButton, SAFE_EDGES, ScreenScroll, Section, StatusPill } from "../../src/components/ui";
import { useFormFocusChain } from "../../src/components/ui/formChain";
import { FORM_FIELDS } from "../../src/components/ui/formFields";
import { KeyValueRow } from "../../src/components/blocks";
import { LanguageSwitch } from "../../src/components/support/LanguageSwitch";
import { TOKENS, FONT, ICON } from "../../src/constants/theme";
import { useTheme } from "../../src/context/ThemeContext";
import { PIN_MIN_LENGTH } from "../../src/constants/security";
import type { SettingsPatch, TraceMode } from "../../src/core/contracts";
import { useAutoRefresh, useClock, usePullToRefresh, useQuery, useWorkTracker } from "../../src/core/hooks";
import {
  selectAdmin,
  selectCalendarHistory,
  selectHealth,
  selectIsAdminUnlocked,
  selectPendingCalendarChange,
  selectRetentionStatus,
  selectSettings,
  selectSystemHealth,
} from "../../src/core/selectors";
import { legalFlags } from "../../src/utils/companyPolicy";
import { calendarAt, formatDateTime, formatRange } from "../../src/utils/dateUtils";
import { getLanguage, t, tHealthValue, useLanguage } from "../../src/i18n";
import { currentVersionLine } from "../../src/support/versionLine";

interface Draft {
  employeeName: string;
  dailyReminderTime: string;
  hourlyRate: string;
  employerName: string;
  companyEmail: string;
  overtimeMultiplier: string;
  overtimePolicyId: string;
  traceRetentionDays: string;
  traceMode: TraceMode;
  defaultRadiusM: string;
  portalUrl: string;
  portalEnabled: boolean;
}

export default function SettingsScreen() {
  useLanguage();
  const { colors } = useTheme();
  const router = useRouter();
  const { state, emit, queries } = useWorkTracker();
  const nowMs = useClock(15_000);
  const { refreshControl } = usePullToRefresh();
  useAutoRefresh();
  const settings = selectSettings(state);
  const admin = selectAdmin(state);
  const unlocked = selectIsAdminUnlocked(state, nowMs);
  const health = selectHealth(state);
  const sys = selectSystemHealth(state);
  const retentionRows = selectRetentionStatus(state, nowMs);

  const initial = useMemo<Draft>(
    () => ({
      employeeName: settings.profile.employeeName,
      dailyReminderTime: settings.profile.dailyReminderTime,
      hourlyRate: String(settings.profile.hourlyRate),
      employerName: settings.company.employerName,
      companyEmail: settings.company.companyEmail,
      overtimeMultiplier: String(settings.company.overtimeMultiplier),
      overtimePolicyId: settings.company.overtimePolicyId,
      traceRetentionDays: String(settings.company.traceRetentionDays),
      traceMode: settings.company.traceMode,
      defaultRadiusM: String(settings.company.defaultRadiusM),
      portalUrl: settings.company.employerPortalUrl ?? "",
      portalEnabled: settings.company.employerPortalEnabled === true,
    }),
    [settings],
  );
  const [draft, setDraft] = useState<Draft>(initial);
  const [pin, setPin] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const queue = useQuery(() => queries.listOfflineQueue(), [settings.company.employerPortalUrl ?? "", settings.company.employerPortalEnabled === true], ["packs", "settings"]);
  // El idioma no vive en el borrador: lo pinta LanguageSwitch y se guarda al
  // pulsar. Un SET_LANGUAGE no debe borrar el resto si aún no se pulsó Guardar.
  const seen = useRef(initial);
  useEffect(() => {
    const base = seen.current;
    setDraft((prev) => {
      const next: Draft = { ...initial };
      (Object.keys(prev) as (keyof Draft)[]).forEach((k) => {
        if (prev[k] !== base[k]) (next as Record<keyof Draft, Draft[keyof Draft]>)[k] = prev[k];
      });
      return next;
    });
    seen.current = initial;
  }, [initial]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const dirty = (Object.keys(draft) as (keyof Draft)[]).some((k) => draft[k] !== initial[k]);

  const num = (s: string) => Number(s.replace(",", "."));
  const onSave = async () => {
    const patch: SettingsPatch = {
      profile: { employeeName: draft.employeeName.trim(), language: getLanguage(), dailyReminderTime: draft.dailyReminderTime },
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
        employerPortalUrl: draft.portalUrl.trim() ? draft.portalUrl.trim() : null,
        employerPortalEnabled: draft.portalEnabled,
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

  const onProvision = async () => {
    setBusy(true);
    await emit({ type: "PROVISION_ADMIN_PIN", code: code.trim() });
    setCode("");
    setBusy(false);
  };

  const permTone = (ok: boolean) => (ok ? "success" : "warning");
  const profileChain = useFormFocusChain(FORM_FIELDS.settingsProfile, { onSubmit: () => void onSave(), canSubmit: dirty && !busy });
  const pinChain = useFormFocusChain(FORM_FIELDS.settingsPin, {
    onSubmit: () => void onAdminPin(),
    canSubmit: pin.length >= PIN_MIN_LENGTH && !busy && admin.status !== "locked_out",
  });
  const adminChain = useFormFocusChain(FORM_FIELDS.settingsAdmin, { onSubmit: () => void onSave(), canSubmit: dirty && !busy && unlocked });
  const provisionChain = useFormFocusChain(FORM_FIELDS.settingsProvision, {
    onSubmit: () => void onProvision(),
    canSubmit: code.trim().length > 0 && !busy,
  });
  const portalLabel = !settings.company.employerPortalUrl?.trim()
    ? t("settings.portalUnconfigured")
    : settings.company.employerPortalEnabled === true
      ? t("settings.portalActive")
      : t("settings.portalDisabled");

  return (
    <ScreenScroll
      edges={SAFE_EDGES.tab}
      refreshControl={refreshControl}
      footer={dirty ? <PrimaryButton label={t("common.save")} isLoading={busy} onPress={() => void onSave()} /> : null}
    >
        <PageHeader title={t("settings.title")} helpScreen="settings" showHealth />

        <Section title={t("settings.profile")}>
          <Input {...profileChain.props("name")} label={t("onboarding.employeeName")} value={draft.employeeName} onChangeText={(v) => set("employeeName", v)} />
          <LanguageSwitch />
          <Pressable
            onPress={() => void emit({ type: "SAVE_SETTINGS", patch: { profile: { highContrast: settings.profile.highContrast !== true } } })}
            accessibilityRole="switch"
            accessibilityState={{ checked: settings.profile.highContrast === true }}
            accessibilityLabel={t("settings.highContrast")}
            style={styles.statusRow}
          >
            <Text style={{ color: colors.text.primary }}>{t("settings.highContrast")}</Text>
            <StatusPill tone={settings.profile.highContrast ? "success" : "neutral"} label={t(settings.profile.highContrast ? "settings.highContrastOn" : "settings.highContrastOff")} />
          </Pressable>
          <Text style={[styles.hint, { color: colors.text.secondary }]}>{t("settings.highContrastHint")}</Text>
          <Input {...profileChain.props("reminder")} label={t("onboarding.reminderTime")} value={draft.dailyReminderTime} onChangeText={(v) => set("dailyReminderTime", v)} mask="HH:mm" />
        </Section>

        <Section title={t("settings.monitoring")}>
          <Card style={styles.card}>
            <View style={styles.statusRow}>
              <Text style={{ color: colors.text.primary }}>{t("health.gps")}</Text>
              <StatusPill tone={permTone(sys.gpsOk)} label={t(`permission.${health.locationForeground}`)} />
            </View>
            <View style={styles.statusRow}>
              <Text style={{ color: colors.text.primary }}>{t("health.background")}</Text>
              <StatusPill tone={permTone(sys.backgroundOk)} label={t(`permission.${health.locationBackground}`)} />
            </View>
            <View style={styles.statusRow}>
              <Text style={{ color: colors.text.primary }}>{t("health.sensors.foregroundService")}</Text>
              <StatusPill tone={health.foregroundService === "running" ? "success" : "neutral"} label={tHealthValue(health.foregroundService)} />
            </View>
            <View style={styles.statusRow}>
              <Text style={{ color: colors.text.primary }}>{t("settings.traceMode")}</Text>
              <Text style={{ color: colors.text.secondary }}>{t(`settings.traceModes.${settings.company.traceMode}`)}</Text>
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
          <Text style={[styles.hint, { color: colors.text.secondary }]}>
            {admin.pinOrigin === "EMPLOYER" ? t("settings.pinEmployer") : t("settings.pinLocal")}
          </Text>
          {!unlocked ? (
            <Card style={styles.card}>
              <View style={styles.statusRow}>
                <Ionicons name="lock-closed-outline" size={ICON.md} color={colors.text.secondary} />
                <Text style={[styles.hint, { color: colors.text.secondary }]}>
                  {admin.hasPin ? t("settings.adminLocked") : t("settings.adminSetup", { min: PIN_MIN_LENGTH })}
                </Text>
              </View>
              <Input {...pinChain.props("pin")} label={t("settings.pin")} value={pin} onChangeText={setPin} secureToggle />
              <Button
                label={admin.hasPin ? t("settings.unlock") : t("settings.setPin")}
                disabled={pin.length < PIN_MIN_LENGTH || busy || admin.status === "locked_out"}
                isLoading={busy && admin.status === "validating"}
                onPress={() => void onAdminPin()}
              />
            </Card>
          ) : (
            <Card style={styles.card}>
              <Input {...adminChain.props("rate")} label={t("onboarding.hourlyRate")} value={draft.hourlyRate} onChangeText={(v) => set("hourlyRate", v)} />
              <Input {...adminChain.props("multiplier")} label={t("settings.overtimeMultiplier")} value={draft.overtimeMultiplier} onChangeText={(v) => set("overtimeMultiplier", v)} />
              <Input {...adminChain.props("employer")} label={t("settings.employerName")} value={draft.employerName} onChangeText={(v) => set("employerName", v)} />
              <Input {...adminChain.props("email")} label={t("settings.companyEmail")} value={draft.companyEmail} onChangeText={(v) => set("companyEmail", v)} />
              <Text style={[styles.label, { color: colors.text.secondary }]}>{t("settings.overtimePolicy")}</Text>
              <View style={styles.row}>
                {queries.payrollPolicies().map((p) => {
                  const key = `settings.policies.${p.id}`;
                  const label = t(key);
                  return (
                    <Chip key={p.id} label={label === key ? p.label : label} selected={draft.overtimePolicyId === p.id} onPress={() => set("overtimePolicyId", p.id)} />
                  );
                })}
              </View>
              <Text style={[styles.label, { color: colors.text.secondary }]}>{t("settings.traceMode")}</Text>
              <View style={styles.row}>
                {(["PERIMETER", "BREADCRUMB"] as const).map((m) => (
                  <Chip key={m} label={t(`settings.traceModes.${m}`)} selected={draft.traceMode === m} onPress={() => set("traceMode", m)} />
                ))}
              </View>
              <Input {...adminChain.props("retention")} label={t("settings.retention")} value={draft.traceRetentionDays} onChangeText={(v) => set("traceRetentionDays", v)} />
              <Input {...adminChain.props("radius")} label={t("settings.defaultRadius")} value={draft.defaultRadiusM} onChangeText={(v) => set("defaultRadiusM", v)} />
              <Input {...adminChain.props("portalUrl")} label={t("settings.portalUrl")} value={draft.portalUrl} onChangeText={(v) => set("portalUrl", v)} autoCapitalize="none" autoCorrect={false} />
              <Text style={[styles.label, { color: colors.text.secondary }]}>{t("settings.portalOn")}</Text>
              <View style={styles.row}>
                <Chip label={t("settings.portalOff")} selected={!draft.portalEnabled} onPress={() => set("portalEnabled", false)} />
                <Chip label={t("settings.portalOn")} selected={draft.portalEnabled} onPress={() => set("portalEnabled", true)} />
              </View>
              <WorkCalendarBlock />
              <Button label={t("settings.lock")} variant="ghost" size="sm" iconName="lock-closed-outline" onPress={() => void emit({ type: "LOCK_ADMIN" })} />
            </Card>
          )}
          <Card style={styles.card}>
            <Text style={[styles.hint, { color: colors.text.secondary }]}>{t("settings.provisionHint")}</Text>
            <Input {...provisionChain.props("code")} label={t("settings.provisionCode")} value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} />
            <Button label={t("settings.provisionSubmit")} disabled={!code.trim() || busy} isLoading={busy} onPress={() => void onProvision()} />
          </Card>
          <Card style={styles.card}>
            <Text style={[styles.hint, { color: colors.text.primary }]}>{portalLabel}</Text>
            <Text style={[styles.label, { color: colors.text.secondary }]}>{t("settings.portalQueue")}</Text>
            {(queue.data ?? []).length === 0 ? (
              <Text style={[styles.hint, { color: colors.text.muted }]}>{t("settings.queueEmpty")}</Text>
            ) : (
              (queue.data ?? []).map((item) => (
                <KeyValueRow key={item.id} label={item.packId} value={t(`settings.queue.${item.status}`)} />
              ))
            )}
          </Card>
        </Section>

        <Section title={t("settings.retentionStatus")}>
          <Card style={styles.card}>
            {retentionRows.length === 0 ? (
              <Text style={[styles.hint, { color: colors.text.muted }]}>{t("settings.retentionEmpty")}</Text>
            ) : (
              retentionRows.map((row) => (
                <KeyValueRow key={row.periodStart} label={formatRange(row.periodStart, row.periodEnd)} value={t(`settings.retentionPhase.${row.phase}`)} />
              ))
            )}
          </Card>
        </Section>

        <Section title={t("support.title")}>
          <Card style={styles.card}>
            <Text style={[styles.hint, { color: colors.text.secondary }]}>{t("support.blurb")}</Text>
            <Text style={[styles.hint, { color: colors.text.muted }]}>{currentVersionLine()}</Text>
            <Button label={t("support.open")} variant="secondary" size="sm" onPress={() => router.push("/support")} />
          </Card>
        </Section>

        <Section title={t("settings.legal")}>
          <Card style={styles.card}>
            <LinkRow label={t("settings.disclosure")} onPress={() => router.push("/legal/disclosure")} />
            <LinkRow label={t("settings.retentionPolicy")} onPress={() => router.push("/legal/retention")} />
          </Card>
        </Section>
    </ScreenScroll>
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
  const { colors } = useTheme();
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
  const calendarChain = useFormFocusChain(FORM_FIELDS.settingsCalendar, {
    canSubmit: changed && !busy,
    onSubmit: () => {
      if (minutes === null || !changed) return;
      void run({ type: "SAVE_SETTINGS", patch: { calendar: { workdayStartMinutes: minutes, workweekStartDay: day } } });
    },
  });

  return (
    <View style={styles.calendar}>
      <Text style={[styles.label, { color: colors.text.secondary }]}>{t("settings.calendar.title")}</Text>
      <KeyValueRow
        label={t("settings.calendar.current")}
        value={`${hhmm(current.workdayStartMinutes)} · ${t(`settings.calendar.days.${current.workweekStartDay}`)}`}
      />
      {pending ? (
        <>
          <Text style={[styles.hint, { color: colors.status.warning }]}>
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
          <Input {...calendarChain.props("start")} label={t("settings.calendar.workdayStart")} value={start} onChangeText={setStart} placeholder="00:00" mask="HH:mm" />
          <Text style={[styles.label, { color: colors.text.secondary }]}>{t("settings.calendar.weekStart")}</Text>
          <View style={styles.row}>
            {WEEKDAYS.map((d) => (
              <Chip key={d} label={t(`settings.calendar.days.${d}`)} selected={day === d} onPress={() => setDay(d)} />
            ))}
          </View>
          <Text style={[styles.hint, { color: colors.text.muted }]}>{t("settings.calendar.hint")}</Text>
          <Button
            label={t("settings.calendar.schedule")}
            size="sm"
            disabled={!changed || busy}
            isLoading={busy}
            onPress={() => void run({ type: "SAVE_SETTINGS", patch: { calendar: { workdayStartMinutes: minutes!, workweekStartDay: day } } })}
          />
        </>
      )}
      <Text style={[styles.label, { color: colors.text.secondary }]}>{t("settings.calendar.transitionThreshold")}</Text>
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
          <Text style={[styles.label, { color: colors.text.secondary }]}>{t(`settings.calendar.${flag}`)}</Text>
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
      <Text style={[styles.hint, { color: colors.text.muted }]}>{t("settings.legalReview")}</Text>
    </View>
  );
}

function LinkRow({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" style={styles.statusRow}>
      <Text style={{ color: colors.text.primary }}>{label}</Text>
      <Ionicons name="chevron-forward" size={ICON.md} color={colors.text.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { padding: TOKENS.spacing.lg, gap: TOKENS.spacing.sm },
  label: { ...FONT.label, marginTop: TOKENS.spacing.sm },
  row: { flexDirection: "row", flexWrap: "wrap", gap: TOKENS.spacing.sm, marginBottom: TOKENS.spacing.sm },
  statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: TOKENS.spacing.sm, paddingVertical: TOKENS.spacing.xs },
  hint: { ...FONT.caption, flex: 1 },
  calendar: { gap: TOKENS.spacing.sm, marginTop: TOKENS.spacing.sm },
});
