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
import { ConfirmActionModal } from "../../src/components/modals";
import { Button, Card, Chip, Input, PageHeader, PrimaryButton, SAFE_EDGES, ScreenScroll, Section, StatusPill } from "../../src/components/ui";
import { useFormFocusChain } from "../../src/components/ui/formChain";
import { FORM_FIELDS } from "../../src/components/ui/formFields";
import { KeyValueRow } from "../../src/components/blocks";
import { LanguageSwitch } from "../../src/components/support/LanguageSwitch";
import { TOKENS, FONT, ICON } from "../../src/constants/theme";
import { useTheme } from "../../src/context/ThemeContext";
import { PIN_MIN_LENGTH } from "../../src/constants/security";
import type { PayrollLegalFlags, SettingsPatch, TraceMode } from "../../src/core/contracts";
import { useAutoRefresh, useBusyAction, useClock, usePullToRefresh, useQuery, useWorkTracker } from "../../src/core/hooks";
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
import { companyTimezone, legalFlags } from "../../src/utils/companyPolicy";
import { PAYROLL_TIMEZONES, calendarAt, formatDateTime, formatRange } from "../../src/utils/dateUtils";
import { getLanguage, t, tHealthValue, useLanguage } from "../../src/i18n";
import { settingsFooterLine } from "../../src/support/versionLine";

const TIMEZONE_LABEL: Record<(typeof PAYROLL_TIMEZONES)[number], string> = {
  "America/Los_Angeles": "pacific",
  "America/Denver": "mountain",
  "America/Phoenix": "arizona",
  "America/Chicago": "central",
  "America/New_York": "eastern",
  "America/Anchorage": "alaska",
  "Pacific/Honolulu": "hawaii",
  "America/Guatemala": "guatemala",
  "America/El_Salvador": "elSalvador",
  "America/Tegucigalpa": "honduras",
  "America/Managua": "nicaragua",
  "America/Costa_Rica": "costaRica",
  "America/Panama": "panama",
  "America/Belize": "belize",
};

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
  arrivalDwellMin: string;
  arrivalAccuracyM: string;
  arrivalReadings: string;
  portalUrl: string;
  portalEnabled: boolean;
  timezone: string;
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
      arrivalDwellMin: String(Math.round((settings.company.arrivalDwellMs ?? 0) / 60_000)),
      arrivalAccuracyM: String(settings.company.arrivalAccuracyM ?? 50),
      arrivalReadings: String(settings.company.arrivalReadings ?? 2),
      portalUrl: settings.company.employerPortalUrl ?? "",
      portalEnabled: settings.company.employerPortalEnabled === true,
      timezone: companyTimezone(settings.company),
    }),
    [settings],
  );
  const [draft, setDraft] = useState<Draft>(initial);
  const [pin, setPin] = useState("");
  const [code, setCode] = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const { busy, run } = useBusyAction();
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

  // El primer dep es estable: teclear el código no vacía la vista previa.
  const provisionPreview = useQuery(
    () => queries.previewEmployerCode(code, fingerprint),
    ["employer-code", code, fingerprint, admin.pinOrigin, admin.hasPin],
  );
  const codeFingerprint = provisionPreview.data?.fingerprint ?? null;
  const showFingerprint = provisionPreview.data?.needsFingerprint === true;
  const canProvision = code.trim().length > 0 && !busy && provisionPreview.data?.confirmed === true;
  const provisionFields = useMemo(
    () => (showFingerprint ? FORM_FIELDS.settingsProvision : FORM_FIELDS.settingsProvision.filter((field) => field.id === "code")),
    [showFingerprint],
  );

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const dirty = (Object.keys(draft) as (keyof Draft)[]).some((k) => draft[k] !== initial[k]);

  const num = (s: string) => Number(s.replace(",", "."));
  const finiteAtLeast = (s: string, min: number) => {
    const n = num(s);
    return s.trim() !== "" && Number.isFinite(n) && n >= min;
  };
  const rateOk = finiteAtLeast(draft.hourlyRate, 0.0001);
  const adminNumbersOk =
    rateOk &&
    finiteAtLeast(draft.overtimeMultiplier, 0.0001) &&
    finiteAtLeast(draft.traceRetentionDays, 0) &&
    finiteAtLeast(draft.defaultRadiusM, 1) &&
    finiteAtLeast(draft.arrivalDwellMin, 0) &&
    finiteAtLeast(draft.arrivalAccuracyM, 1) &&
    finiteAtLeast(draft.arrivalReadings, 1);
  const canSave = dirty && !busy && (!unlocked || adminNumbersOk);
  const numberError = (s: string, min: number) => (finiteAtLeast(s, min) ? undefined : t("settings.numberInvalid"));
  const onSave = async () => {
    if (!canSave) return { ok: false as const, code: "INVALID_VALUE" as const };
    const patch: SettingsPatch = {
      profile: { employeeName: draft.employeeName.trim(), language: getLanguage(), dailyReminderTime: draft.dailyReminderTime },
    };
    if (unlocked) {
      // Campo vacío ≠ tarifa 0: no se guarda (tarifa 0 nunca silenciosa).
      if (draft.hourlyRate !== initial.hourlyRate && draft.hourlyRate.trim() !== "") patch.profile!.hourlyRate = num(draft.hourlyRate);
      patch.company = {
        employerName: draft.employerName.trim(),
        companyEmail: draft.companyEmail.trim(),
        overtimeMultiplier: num(draft.overtimeMultiplier),
        overtimePolicyId: draft.overtimePolicyId,
        traceRetentionDays: Math.round(num(draft.traceRetentionDays)),
        traceMode: draft.traceMode,
        defaultRadiusM: Math.round(num(draft.defaultRadiusM)),
        arrivalDwellMs: Math.min(30, Math.max(0, Math.round(num(draft.arrivalDwellMin) || 0))) * 60_000,
        arrivalAccuracyM: Math.min(500, Math.max(1, Math.round(num(draft.arrivalAccuracyM) || 50))),
        arrivalReadings: Math.min(10, Math.max(1, Math.round(num(draft.arrivalReadings) || 2))),
        employerPortalUrl: draft.portalUrl.trim() ? draft.portalUrl.trim() : null,
        employerPortalEnabled: draft.portalEnabled,
        timezone: draft.timezone,
      };
    }
    return run(() => emit({ type: "SAVE_SETTINGS", patch }));
  };

  const onAdminPin = () =>
    run(async () => {
      const res = await emit(admin.hasPin ? { type: "UNLOCK_ADMIN", pin } : { type: "SETUP_ADMIN_PIN", pin });
      setPin("");
      return res;
    });

  const onProvision = () =>
    run(async () => {
      const res = await emit({
        type: "PROVISION_ADMIN_PIN",
        code: code.trim(),
        ...(showFingerprint && fingerprint.trim() ? { fingerprint: fingerprint.trim() } : {}),
      });
      setCode("");
      setFingerprint("");
      return res;
    });

  const permTone = (ok: boolean) => (ok ? "success" : "warning");
  const profileChain = useFormFocusChain(FORM_FIELDS.settingsProfile, { onSubmit: () => void onSave(), canSubmit: canSave });
  const pinChain = useFormFocusChain(FORM_FIELDS.settingsPin, {
    onSubmit: () => void onAdminPin(),
    canSubmit: pin.length >= PIN_MIN_LENGTH && !busy && admin.status !== "locked_out",
  });
  const adminChain = useFormFocusChain(FORM_FIELDS.settingsAdmin, { onSubmit: () => void onSave(), canSubmit: canSave && unlocked });
  const provisionChain = useFormFocusChain(provisionFields, {
    onSubmit: () => void onProvision(),
    canSubmit: canProvision,
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
      footer={dirty ? <PrimaryButton label={t("common.save")} disabled={!canSave} isLoading={busy} onPress={() => void onSave()} /> : null}
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
          <Text style={[styles.label, { color: colors.text.secondary }]}>{t("settings.comprobanteTheme")}</Text>
          <View style={styles.row}>
            <Chip
              label={t("settings.comprobanteLight")}
              selected={settings.profile.comprobanteTheme !== "dark"}
              onPress={() => void emit({ type: "SAVE_SETTINGS", patch: { profile: { comprobanteTheme: "light" } } })}
            />
            <Chip
              label={t("settings.comprobanteDark")}
              selected={settings.profile.comprobanteTheme === "dark"}
              onPress={() => void emit({ type: "SAVE_SETTINGS", patch: { profile: { comprobanteTheme: "dark" } } })}
            />
          </View>
          <Text style={[styles.hint, { color: colors.text.secondary }]}>{t("settings.comprobanteThemeHint")}</Text>
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
            <KeyValueRow label={t("settings.arrivalDwell")} value={`${Math.round((settings.company.arrivalDwellMs ?? 0) / 60_000)} min`} />
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
              <Input {...adminChain.props("rate")} label={t("onboarding.hourlyRate")} value={draft.hourlyRate} onChangeText={(v) => set("hourlyRate", v)} prefix="$" suffix={t("common.perHour")} error={!rateOk ? (Number.isFinite(num(draft.hourlyRate)) ? t("onboarding.rateInvalid") : t("settings.numberInvalid")) : undefined} />
              <Input {...adminChain.props("multiplier")} label={t("settings.overtimeMultiplier")} value={draft.overtimeMultiplier} onChangeText={(v) => set("overtimeMultiplier", v)} error={numberError(draft.overtimeMultiplier, 0.0001)} />
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
              <Text style={[styles.label, { color: colors.text.secondary }]}>{t("settings.timezone")}</Text>
              <View style={styles.row}>
                {PAYROLL_TIMEZONES.map((zone) => (
                  <Chip
                    key={zone}
                    label={t(`settings.timezones.${TIMEZONE_LABEL[zone]}`)}
                    selected={draft.timezone === zone}
                    onPress={() => set("timezone", zone)}
                  />
                ))}
              </View>
              <Text style={[styles.hint, { color: colors.text.secondary }]}>{t("settings.timezoneHint")}</Text>
              <Input {...adminChain.props("retention")} label={t("settings.retention")} value={draft.traceRetentionDays} onChangeText={(v) => set("traceRetentionDays", v)} error={numberError(draft.traceRetentionDays, 0)} />
              <Input {...adminChain.props("radius")} label={t("settings.defaultRadius")} value={draft.defaultRadiusM} onChangeText={(v) => set("defaultRadiusM", v)} error={numberError(draft.defaultRadiusM, 1)} />
              <Input {...adminChain.props("portalUrl")} label={t("settings.portalUrl")} value={draft.portalUrl} onChangeText={(v) => set("portalUrl", v)} autoCapitalize="none" autoCorrect={false} />
              <Input {...adminChain.props("arrivalDwell")} label={t("settings.arrivalDwell")} value={draft.arrivalDwellMin} onChangeText={(v) => set("arrivalDwellMin", v)} error={numberError(draft.arrivalDwellMin, 0)} />
              <Text style={[styles.hint, { color: colors.text.secondary }]}>{t("settings.arrivalDwellHint")}</Text>
              <Input {...adminChain.props("arrivalAccuracy")} label={t("settings.arrivalAccuracy")} value={draft.arrivalAccuracyM} onChangeText={(v) => set("arrivalAccuracyM", v)} error={numberError(draft.arrivalAccuracyM, 1)} />
              <Input {...adminChain.props("arrivalReadings")} label={t("settings.arrivalReadings")} value={draft.arrivalReadings} onChangeText={(v) => set("arrivalReadings", v)} error={numberError(draft.arrivalReadings, 1)} />
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
            {showFingerprint ? (
              <>
                <Text style={[styles.hint, { color: colors.text.primary }]}>{t("settings.provisionFingerprintShown", { fingerprint: codeFingerprint ?? "" })}</Text>
                <Input
                  {...provisionChain.props("fingerprint")}
                  label={t("settings.provisionFingerprint")}
                  value={fingerprint}
                  onChangeText={setFingerprint}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                <Text style={[styles.hint, { color: colors.text.secondary }]}>{t("settings.provisionFingerprintHint")}</Text>
              </>
            ) : null}
            <Button label={t("settings.provisionSubmit")} disabled={!canProvision} isLoading={busy} onPress={() => void onProvision()} />
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
            <Text style={[styles.hint, { color: colors.text.muted }]} testID="settings-footer">{settingsFooterLine()}</Text>
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
  const { busy, run: guard } = useBusyAction();
  const [pendingFlag, setPendingFlag] = useState<LegalFlagDraft | null>(null);
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(start.trim());
  const minutes = m ? Number(m[1]) * 60 + Number(m[2]) : null;
  const changed = minutes !== null && (minutes !== current.workdayStartMinutes || day !== current.workweekStartDay);
  const run = (intent: Parameters<typeof emit>[0]) => guard(() => emit(intent));
  const askFlag = (draft: LegalFlagDraft) => {
    if (busy || pendingFlag || flags[draft.key] === draft.value) return;
    setPendingFlag(draft);
  };
  const applyFlag = () => {
    if (!pendingFlag) return;
    const draft = pendingFlag;
    void guard(async () => {
      const res = await emit({ type: "SAVE_SETTINGS", patch: { company: { payrollLegalFlags: { ...flags, [draft.key]: draft.value } } } });
      if (res.ok) setPendingFlag(null);
      return res;
    });
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
            onPress={() => askFlag({ key: "transitionWeeklyThreshold", value: v })}
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
                onPress={() => askFlag({ key: flag, value: v })}
              />
            ))}
          </View>
        </Fragment>
      ))}
      <Text style={[styles.hint, { color: colors.text.muted }]}>{t("settings.legalReview")}</Text>
      <ConfirmActionModal
        visible={pendingFlag !== null}
        title={t("settings.legalFlagTitle")}
        description={t("settings.legalFlagBody")}
        confirmLabel={t("common.confirm")}
        tone="warning"
        busy={busy}
        onCancel={() => setPendingFlag(null)}
        onConfirm={applyFlag}
      />
    </View>
  );
}

type LegalFlagDraft =
  | { key: "transitionWeeklyThreshold"; value: PayrollLegalFlags["transitionWeeklyThreshold"] }
  | { key: "caDoubleTime"; value: boolean }
  | { key: "caSeventhDay"; value: boolean };

function LinkRow({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint={t("a11y.linkHint")}
      style={[styles.statusRow, styles.linkHit]}
    >
      <Text style={{ color: colors.text.primary, flex: 1 }}>{label}</Text>
      <Ionicons name="chevron-forward" size={ICON.md} color={colors.text.muted} accessibilityElementsHidden importantForAccessibility="no" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { padding: TOKENS.spacing.lg, gap: TOKENS.spacing.sm },
  label: { ...FONT.label, marginTop: TOKENS.spacing.sm },
  row: { flexDirection: "row", flexWrap: "wrap", gap: TOKENS.spacing.sm, marginBottom: TOKENS.spacing.sm },
  statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: TOKENS.spacing.sm, paddingVertical: TOKENS.spacing.xs },
  linkHit: { minHeight: TOKENS.layout.minTouchTarget },
  hint: { ...FONT.caption, flex: 1 },
  calendar: { gap: TOKENS.spacing.sm, marginTop: TOKENS.spacing.sm },
});
