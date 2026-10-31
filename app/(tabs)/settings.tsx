import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Switch, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";

import { FONT, type AppTokens } from "../../src/constants/theme";
import { useTheme } from "../../src/context/ThemeContext";
import { useLanguage } from "../../src/context/LanguageContext";
import { useWorkTracker } from "../../src/core/hooks/useWorkTracker";
import { useSystemHealth, useAdminSecurity, useDisclosure } from "../../src/core/hooks/dualTracker";
import { sessionStore } from "../../src/core/runtime";
import type { AppSettingsRecord } from "../../src/core/contracts";
import { ScreenContainer, PageHeader, Section, Input, Button, Card } from "../../src/components/ui";
import { useToast } from "../../src/context/ToastContext";
import type { translations } from "../../src/utils/i18n";

type TF = (key: keyof typeof translations.es, vars?: Record<string, string | number>) => string;
const PIN_MIN_LENGTH = 4;

type TraceMode = "PERIMETER" | "BREADCRUMB" | "RASTRO_ACTIVO" | "SOLO_GEOCERCA" | "SIN_UBICACION";

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
  portalUrl: string;
  portalEnabled: boolean;
  timezone: string;
  highContrast: boolean;
  comprobanteTheme: "light" | "dark";
}

function toDraft(s: any): Draft {
  return {
    employeeName: s.employeeName ?? "",
    dailyReminderTime: s.dailyReminderTime ?? "08:00",
    hourlyRate: String(s.hourlyRate ?? ""),
    employerName: s.employerName ?? "",
    companyEmail: s.companyEmail ?? "",
    overtimeMultiplier: String(s.overtimeMultiplier ?? "1.5"),
    overtimePolicyId: s.overtimePolicyId ?? "default",
    traceRetentionDays: String(s.traceRetentionDays ?? "90"),
    traceMode: s.traceMode ?? "SOLO_GEOCERCA",
    defaultRadiusM: String(s.defaultRadiusM ?? s.toleranceRadiusMeters ?? "100"),
    arrivalDwellMin: String(s.arrivalDwellMin ?? "5"),
    portalUrl: s.portalUrl ?? s.employerPortalUrl ?? "",
    portalEnabled: s.portalEnabled ?? s.employerPortalEnabled ?? false,
    timezone: s.timezone ?? "America/Los_Angeles",
    highContrast: s.highContrast ?? false,
    comprobanteTheme: s.comprobanteTheme ?? "light",
  };
}

function statusLabel(t: TF, status: "unknown" | "granted" | "denied"): string {
  switch (status) {
    case "granted": return t("status_granted");
    case "denied": return t("status_denied");
    default: return t("status_unknown");
  }
}

function traceModeLabel(t: TF, mode: string): string {
  switch (mode) {
    case "RASTRO_ACTIVO":
      return t("tracemode_breadcrumb");
    case "SOLO_GEOCERCA":
      return t("tracemode_geofence");
    case "SIN_UBICACION":
      return t("tracemode_none");
    default:
      return t("status_unknown");
  }
}

export default function SettingsScreen() {
  const { tokens, mode, setMode } = useTheme();
  const { lang, changeLanguage, t } = useLanguage();
  const styles = useMemo(() => getStyles(tokens), [tokens]);
  const router = useRouter();
  const { showToast } = useToast();
  const { state } = useWorkTracker();
  const { health } = useSystemHealth();
  const { unlocked, error: adminError, busy, unlock, lock } = useAdminSecurity();
  const { traceMode } = useDisclosure();

  const settings: any = (state as any).domain?.settings ?? {};

  const initial = useMemo(() => toDraft(settings), [state]);
  const [draft, setDraftField] = useState<Draft>(initial);
  const [pinInput, setPinInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraftField(initial); }, [initial]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraftField((d) => ({ ...d, [k]: v }));

  const dirty = useMemo(
    () => (Object.keys(draft) as (keyof Draft)[]).some((k) => draft[k] !== (initial as any)[k]),
    [draft, initial]
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const merged: any = {
        ...settings,
        ...draft,
        hourlyRate: Number(draft.hourlyRate) || 0,
        overtimeMultiplier: Number(draft.overtimeMultiplier) || 1,
        traceRetentionDays: Math.round(Number(draft.traceRetentionDays) || 0),
        defaultRadiusM: Math.round(Number(draft.defaultRadiusM) || 0),
        toleranceRadiusMeters: Math.round(Number(draft.defaultRadiusM) || 0),
      };
      await sessionStore.saveSettings(merged as AppSettingsRecord);
      showToast(t("toast_settings_saved"), "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("toast_error_generic"), "error");
    } finally {
      setSaving(false);
    }
  }, [settings, draft, showToast, t]);

  const handleUnlock = useCallback(async () => {
    const ok = await unlock(pinInput);
    if (ok) setPinInput("");
  }, [unlock, pinInput]);

  const currentTraceMode = traceMode({
    disclaimerAccepted: settings.disclaimerAccepted,
    hasBackgroundLocation: health?.locationBackground === "granted",
    hasForegroundLocation: health?.locationForeground === "granted",
  });

  return (
    <ScreenContainer noPadding>
      <PageHeader title={t("settings_title")} />
      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        enableOnAndroid={true}
        extraScrollHeight={24}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* PERFIL */}
        <Section title={t("settings_profile")}>
          <Input label={t("label_name")} value={draft.employeeName} onChangeText={(v) => set("employeeName", v)} icon="person-outline" />
          <View style={styles.languageRow}>
            <Text style={styles.languageLabel}>{t("label_lang")}: {t("lang_es")}</Text>
            <Switch value={lang === "en"} onValueChange={(v) => changeLanguage(v ? "en" : "es")}
              trackColor={{ false: tokens.colors.border, true: tokens.colors.primary }} />
            <Text style={styles.languageLabel}>{t("lang_en")}</Text>
          </View>
          <Input label={t("label_start_time")} value={draft.dailyReminderTime} onChangeText={(v) => set("dailyReminderTime", v)} icon="alarm-outline" placeholder="08:00" />
          <Pressable onPress={() => set("highContrast", !draft.highContrast)} style={styles.statusRow}>
            <Text style={{ color: tokens.colors.text.primary }}>{t("settings_high_contrast")}</Text>
            <Text style={styles.languageLabel}>{draft.highContrast ? t("toggle_on") : t("toggle_off")}</Text>
          </Pressable>
          <Text style={[styles.label, { color: tokens.colors.text.secondary }]}>{t("settings_receipt_theme")}</Text>
          <View style={styles.row}>
            <Button label={t("settings_theme_light")} variant={draft.comprobanteTheme !== "dark" ? "primary" : "secondary"} size="sm" onPress={() => set("comprobanteTheme", "light")} />
            <Button label={t("settings_theme_dark")} variant={draft.comprobanteTheme === "dark" ? "primary" : "secondary"} size="sm" onPress={() => set("comprobanteTheme", "dark")} />
          </View>
        </Section>

        {/* APARIENCIA */}
        <Section title={t("settings_appearance")}>
          <View style={styles.languageRow}>
            <Text style={styles.languageLabel}>{t("label_dark_mode")}</Text>
            <Switch value={mode === "dark"} onValueChange={(v) => setMode(v ? "dark" : "light")}
              trackColor={{ false: tokens.colors.border, true: tokens.colors.primary }} />
          </View>
        </Section>
        {/* MONITOREO */}
        <Section title={t("settings_monitoring")}>
          <Card variant="surface" style={styles.monitorCard}>
            <View style={styles.monitorRow}>
              <Text style={styles.monitorLabel}>{t("monitor_fg_gps")}</Text>
              <Text style={styles.monitorValue}>{statusLabel(t, health?.locationForeground ?? "unknown")}</Text>
            </View>
            <View style={styles.monitorRow}>
              <Text style={styles.monitorLabel}>{t("monitor_bg_gps")}</Text>
              <Text style={styles.monitorValue}>{statusLabel(t, health?.locationBackground ?? "unknown")}</Text>
            </View>
            <View style={styles.monitorRow}>
              <Text style={styles.monitorLabel}>{t("monitor_fg_service")}</Text>
              <Text style={styles.monitorValue}>{health?.androidForegroundServiceType ?? "unknown"}</Text>
            </View>
            <View style={styles.monitorRow}>
              <Text style={styles.monitorLabel}>{t("monitor_trace")}</Text>
              <Text style={styles.monitorValue}>{traceModeLabel(t, currentTraceMode)}</Text>
            </View>
            <Text style={[styles.label, { color: tokens.colors.text.secondary }]}>{t("settings_trace_mode")}</Text>
            <View style={styles.row}>
              <Button label={t("tracemode_geofence_short")} variant={draft.traceMode === "SOLO_GEOCERCA" ? "primary" : "secondary"} size="sm" onPress={() => set("traceMode", "SOLO_GEOCERCA")} />
              <Button label={t("tracemode_breadcrumb_short")} variant={draft.traceMode === "BREADCRUMB" ? "primary" : "secondary"} size="sm" onPress={() => set("traceMode", "BREADCRUMB")} />
              <Button label={t("tracemode_perimeter_short")} variant={draft.traceMode === "PERIMETER" ? "primary" : "secondary"} size="sm" onPress={() => set("traceMode", "PERIMETER")} />
            </View>
          </Card>
          <Button label={t("btn_system_health")} variant="secondary" size="sm" iconName="pulse-outline" onPress={() => router.push("/system/health")} style={styles.linkButton} />
        </Section>

        {/* DESTINOS */}
        <Section title={t("settings_sites")}>
          <Card variant="surface" style={styles.monitorCard}>
            <View style={styles.monitorRow}>
              <Text style={styles.monitorLabel}>{t("settings_default_radius")}</Text>
              <Text style={styles.monitorValue}>{draft.defaultRadiusM} {t("unit_m")}</Text>
            </View>
            <View style={styles.monitorRow}>
              <Text style={styles.monitorLabel}>{t("settings_arrival_dwell")}</Text>
              <Text style={styles.monitorValue}>{draft.arrivalDwellMin} {t("unit_min")}</Text>
            </View>
          </Card>
          <Button label={t("btn_manage_sites")} variant="secondary" size="sm" iconName="location-outline" onPress={() => router.push("/sites")} style={styles.linkButton} />
          <Input label={t("label_radius")} value={String(draft.defaultRadiusM)}
            onChangeText={(text) => {
              const parsed = Number(text.replace(/[^0-9]/g, ""));
              if (Number.isFinite(parsed)) set("defaultRadiusM", String(parsed));
            }} keyboardType="numeric" icon="radio-button-on-outline" />
          <Input label={t("label_arrival_dwell")} value={String(draft.arrivalDwellMin)}
            onChangeText={(text) => {
              const parsed = Number(text.replace(/[^0-9]/g, ""));
              if (Number.isFinite(parsed)) set("arrivalDwellMin", String(parsed));
            }} keyboardType="numeric" icon="timer-outline" />
        </Section>

        {/* ZONA ADMIN */}
        <Section title={t("admin_zone")}>
          {!unlocked ? (
            <View>
              <Input label={t("admin_pass_placeholder")} value={pinInput} onChangeText={setPinInput} secureTextEntry icon="lock-closed-outline" error={adminError ?? undefined} />
              <Button label={t("admin_unlock")} variant="primary" onPress={handleUnlock} isLoading={busy} />
              <Text style={styles.hint}>{t("hint_pin_min", { n: PIN_MIN_LENGTH })}</Text>
            </View>
          ) : (
            <View>
              <Input label={t("label_rate")} value={String(draft.hourlyRate)} onChangeText={(v) => set("hourlyRate", v)} keyboardType="decimal-pad" icon="cash-outline" />
              <Input label={t("label_multiplier")} value={String(draft.overtimeMultiplier)} onChangeText={(v) => set("overtimeMultiplier", v)} keyboardType="decimal-pad" icon="trending-up-outline" />
              <Input label={t("label_report_email")} value={draft.companyEmail} onChangeText={(v) => set("companyEmail", v)} keyboardType="email-address" autoCapitalize="none" icon="mail-outline" />
              <Input label={t("label_company_name")} value={draft.employerName} onChangeText={(v) => set("employerName", v)} icon="business-outline" />
              <Input label={t("label_overtime_policy")} value={draft.overtimePolicyId} onChangeText={(v) => set("overtimePolicyId", v)} icon="document-text-outline" />
              <Input label={t("label_retention_days")} value={draft.traceRetentionDays} onChangeText={(v) => set("traceRetentionDays", v)} keyboardType="numeric" icon="archive-outline" />
              <Input label={t("label_portal_url")} value={draft.portalUrl} onChangeText={(v) => set("portalUrl", v)} autoCapitalize="none" icon="globe-outline" />
              <View style={styles.languageRow}>
                <Text style={styles.languageLabel}>{t("label_portal_enabled")}</Text>
                <Switch value={draft.portalEnabled} onValueChange={(v) => set("portalEnabled", v)} trackColor={{ false: tokens.colors.border, true: tokens.colors.primary }} />
              </View>
              <Input label={t("label_timezone")} value={draft.timezone} onChangeText={(v) => set("timezone", v)} icon="time-outline" />
              <Text style={styles.hint}>{t("hint_timezone_example")}</Text>
              <Button label={t("btn_lock")} variant="secondary" onPress={lock} />
            </View>
          )}
        </Section>

        {/* CALENDARIO */}
        <Section title={t("settings_calendar")}>
          <Card variant="surface" style={styles.monitorCard}>
            <Text style={styles.monitorLabel}>{t("settings_calendar_desc")}</Text>
          </Card>
        </Section>

        {/* LEGAL */}
        <Section title={t("settings_legal")}>
          <Button label={t("btn_view_disclosure")} variant="secondary" size="sm" iconName="document-text-outline" onPress={() => router.push("/legal/disclosure")} style={styles.linkButton} />
          <Button label={t("btn_view_retention")} variant="secondary" size="sm" iconName="archive-outline" onPress={() => router.push("/legal/retention")} style={styles.linkButton} />
        </Section>

        <View style={styles.footerSpacer} />
      </KeyboardAwareScrollView>

      {dirty && (
        <View style={styles.stickyFooter}>
          <Button label={t("settings_save")} onPress={handleSave} isLoading={saving} />
        </View>
      )}
    </ScreenContainer>
  );
}

function getStyles(tokens: AppTokens) {
  return StyleSheet.create({
    scroll: { flex: 1 },
    scrollContent: { flexGrow: 1, paddingBottom: tokens.spacing["3xl"] },
    languageRow: { flexDirection: "row", alignItems: "center", gap: tokens.spacing.sm, marginBottom: tokens.spacing.md },
    languageLabel: { ...FONT.caption, color: tokens.colors.text.secondary },
    monitorCard: { marginBottom: tokens.spacing.md },
    monitorRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: tokens.spacing.xs },
    monitorLabel: { ...FONT.caption, color: tokens.colors.text.secondary },
    monitorValue: { ...FONT.caption, color: tokens.colors.text.primary, fontWeight: "700" },
    linkButton: { marginBottom: tokens.spacing.md, alignSelf: "flex-start" },
    footerSpacer: { height: tokens.spacing["4xl"] },
    stickyFooter: {
      position: "absolute", left: 0, right: 0, bottom: 0,
      padding: tokens.layout.screenPadding,
      backgroundColor: tokens.colors.background,
      borderTopWidth: 1, borderTopColor: tokens.colors.border,
    },
    row: { flexDirection: "row", flexWrap: "wrap", gap: tokens.spacing.sm, marginBottom: tokens.spacing.md },
    label: { ...FONT.label, marginTop: tokens.spacing.sm },
    hint: { ...FONT.caption, color: tokens.colors.text.muted, marginTop: 4 },
    statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: tokens.spacing.xs },
  });
}
