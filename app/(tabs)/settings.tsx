import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, Switch } from "react-native";
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

type ProfileDraft = Pick<
  AppSettingsRecord,
  "employeeName" | "dailyReminderTime" | "toleranceRadiusMeters"
>;

type AdminDraft = Pick<
  AppSettingsRecord,
  "hourlyRate" | "overtimeMultiplier" | "companyEmail" | "employerName"
>;

type TF = (key: keyof typeof translations.es) => string;

function toProfileDraft(settings: AppSettingsRecord): ProfileDraft {
  return {
    employeeName: settings.employeeName,
    dailyReminderTime: settings.dailyReminderTime,
    toleranceRadiusMeters: settings.toleranceRadiusMeters,
  };
}

function toAdminDraft(settings: AppSettingsRecord): AdminDraft {
  return {
    hourlyRate: settings.hourlyRate,
    overtimeMultiplier: settings.overtimeMultiplier,
    companyEmail: settings.companyEmail,
    employerName: settings.employerName,
  };
}

function statusLabel(t: TF, status: "unknown" | "granted" | "denied"): string {
  switch (status) {
    case "granted":
      return t("status_granted");
    case "denied":
      return t("status_denied");
    default:
      return t("status_unknown");
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

export default function AjustesScreen() {
  const { tokens, mode, setMode } = useTheme();
  const { lang, changeLanguage, t } = useLanguage();
  const styles = useMemo(() => getStyles(tokens), [tokens]);
  const router = useRouter();
  const { showToast } = useToast();
  const { state } = useWorkTracker();
  const { health } = useSystemHealth();
  const { unlocked, error: adminError, busy, unlock, lock } = useAdminSecurity();
  const { traceMode } = useDisclosure();

  const settings = state.domain.settings;

  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(() => toProfileDraft(settings));
  const [adminDraft, setAdminDraft] = useState<AdminDraft>(() => toAdminDraft(settings));
  const [pinInput, setPinInput] = useState("");
  const [saving, setSaving] = useState(false);

  const isProfileDirty = useMemo(() => {
    const original = toProfileDraft(settings);
    return (
      original.employeeName !== profileDraft.employeeName ||
      original.dailyReminderTime !== profileDraft.dailyReminderTime ||
      original.toleranceRadiusMeters !== profileDraft.toleranceRadiusMeters
    );
  }, [settings, profileDraft]);

  const isAdminDirty = useMemo(() => {
    if (!unlocked) return false;
    const original = toAdminDraft(settings);
    return (
      original.hourlyRate !== adminDraft.hourlyRate ||
      original.overtimeMultiplier !== adminDraft.overtimeMultiplier ||
      original.companyEmail !== adminDraft.companyEmail ||
      original.employerName !== adminDraft.employerName
    );
  }, [settings, adminDraft, unlocked]);

  const isDirty = isProfileDirty || isAdminDirty;

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const merged: AppSettingsRecord = {
        ...settings,
        ...profileDraft,
        ...(unlocked ? adminDraft : {}),
      };
      await sessionStore.saveSettings(merged);
      showToast(t("toast_settings_saved"), "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : t("toast_error_generic"), "error");
    } finally {
      setSaving(false);
    }
  }, [settings, profileDraft, adminDraft, unlocked, showToast, t]);

  const handleUnlock = useCallback(async () => {
    const ok = await unlock(pinInput);
    if (ok) {
      setPinInput("");
      setAdminDraft(toAdminDraft(settings));
    }
  }, [unlock, pinInput, settings]);

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
        <Section title={t("settings_profile")}>
          <Input
            label={t("label_name")}
            value={profileDraft.employeeName}
            onChangeText={(text) => setProfileDraft((prev) => ({ ...prev, employeeName: text }))}
            icon="person-outline"
          />
          <View style={styles.languageRow}>
            <Text style={styles.languageLabel}>{t("label_lang")}: Español</Text>
            <Switch
              value={lang === "en"}
              onValueChange={(value) => changeLanguage(value ? "en" : "es")}
              trackColor={{ false: tokens.colors.border, true: tokens.colors.primary }}
            />
            <Text style={styles.languageLabel}>Inglés</Text>
          </View>
          <Input
            label={t("label_start_time")}
            value={profileDraft.dailyReminderTime}
            onChangeText={(text) =>
              setProfileDraft((prev) => ({ ...prev, dailyReminderTime: text }))
            }
            icon="alarm-outline"
            placeholder="08:00"
          />
        </Section>

        <Section title={t("settings_appearance")}>
          <View style={styles.languageRow}>
            <Text style={styles.languageLabel}>{t("label_dark_mode")}</Text>
            <Switch
              value={mode === "dark"}
              onValueChange={(value) => setMode(value ? "dark" : "light")}
              trackColor={{ false: tokens.colors.border, true: tokens.colors.primary }}
            />
          </View>
        </Section>

        <Section title={t("settings_monitoring")}>
          <Card variant="surface" style={styles.monitorCard}>
            <View style={styles.monitorRow}>
              <Text style={styles.monitorLabel}>{t("monitor_fg_gps")}</Text>
              <Text style={styles.monitorValue}>
                {statusLabel(t, health?.locationForeground ?? "unknown")}
              </Text>
            </View>
            <View style={styles.monitorRow}>
              <Text style={styles.monitorLabel}>{t("monitor_bg_gps")}</Text>
              <Text style={styles.monitorValue}>
                {statusLabel(t, health?.locationBackground ?? "unknown")}
              </Text>
            </View>
            <View style={styles.monitorRow}>
              <Text style={styles.monitorLabel}>{t("monitor_fg_service")}</Text>
              <Text style={styles.monitorValue}>
                {health?.androidForegroundServiceType ?? "unknown"}
              </Text>
            </View>
            <View style={styles.monitorRow}>
              <Text style={styles.monitorLabel}>{t("monitor_trace")}</Text>
              <Text style={styles.monitorValue}>{traceModeLabel(t, currentTraceMode)}</Text>
            </View>
          </Card>
          <Button
            label={t("btn_system_health")}
            variant="secondary"
            size="sm"
            iconName="pulse-outline"
            onPress={() => router.push("/system/health")}
            style={styles.linkButton}
          />
        </Section>

        <Section title={t("settings_sites")}>
          <Button
            label={t("btn_manage_sites")}
            variant="secondary"
            size="sm"
            iconName="location-outline"
            onPress={() => router.push("/sites")}
            style={styles.linkButton}
          />
          <Input
            label={t("label_radius")}
            value={String(profileDraft.toleranceRadiusMeters)}
            onChangeText={(text) => {
              const parsed = Number(text.replace(/[^0-9]/g, ""));
              setProfileDraft((prev) => ({
                ...prev,
                toleranceRadiusMeters: Number.isFinite(parsed)
                  ? parsed
                  : prev.toleranceRadiusMeters,
              }));
            }}
            keyboardType="numeric"
            icon="radio-button-on-outline"
          />
        </Section>

        <Section title={t("admin_zone")}>
          {!unlocked ? (
            <View>
              <Input
                label={t("admin_pass_placeholder")}
                value={pinInput}
                onChangeText={setPinInput}
                secureTextEntry
                icon="lock-closed-outline"
                error={adminError ?? undefined}
              />
              <Button
                label={t("admin_unlock")}
                variant="primary"
                onPress={handleUnlock}
                isLoading={busy}
              />
            </View>
          ) : (
            <View>
              <Input
                label={t("label_rate")}
                value={String(adminDraft.hourlyRate)}
                onChangeText={(text) => {
                  const parsed = Number(text.replace(/[^0-9.]/g, ""));
                  setAdminDraft((prev) => ({
                    ...prev,
                    hourlyRate: Number.isFinite(parsed) ? parsed : prev.hourlyRate,
                  }));
                }}
                keyboardType="decimal-pad"
                icon="cash-outline"
              />
              <Input
                label={t("label_multiplier")}
                value={String(adminDraft.overtimeMultiplier)}
                onChangeText={(text) => {
                  const parsed = Number(text.replace(/[^0-9.]/g, ""));
                  setAdminDraft((prev) => ({
                    ...prev,
                    overtimeMultiplier: Number.isFinite(parsed) ? parsed : prev.overtimeMultiplier,
                  }));
                }}
                keyboardType="decimal-pad"
                icon="trending-up-outline"
              />
              <Input
                label={t("label_report_email")}
                value={adminDraft.companyEmail}
                onChangeText={(text) => setAdminDraft((prev) => ({ ...prev, companyEmail: text }))}
                keyboardType="email-address"
                autoCapitalize="none"
                icon="mail-outline"
              />
              <Input
                label={t("label_company_name")}
                value={adminDraft.employerName}
                onChangeText={(text) => setAdminDraft((prev) => ({ ...prev, employerName: text }))}
                icon="business-outline"
              />
              <Button label={t("btn_lock")} variant="secondary" onPress={lock} />
            </View>
          )}
        </Section>

        <Section title={t("settings_legal")}>
          <Button
            label={t("btn_view_disclosure")}
            variant="secondary"
            size="sm"
            iconName="document-text-outline"
            onPress={() => router.push("/legal/disclosure")}
            style={styles.linkButton}
          />
          <Button
            label={t("btn_view_retention")}
            variant="secondary"
            size="sm"
            iconName="archive-outline"
            onPress={() => router.push("/legal/retention")}
            style={styles.linkButton}
          />
        </Section>

        <View style={styles.footerSpacer} />
      </KeyboardAwareScrollView>

      {isDirty && (
        <View style={styles.stickyFooter}>
          <Button label={t("settings_save")} onPress={handleSave} isLoading={saving} />
        </View>
      )}
    </ScreenContainer>
  );
}

function getStyles(tokens: AppTokens) {
  return StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: tokens.spacing["3xl"],
  },
  languageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.md,
  },
  languageLabel: {
    ...FONT.caption,
    color: tokens.colors.text.secondary,
  },
  monitorCard: {
    marginBottom: tokens.spacing.md,
  },
  monitorRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: tokens.spacing.xs,
  },
  monitorLabel: {
    ...FONT.caption,
    color: tokens.colors.text.secondary,
  },
  monitorValue: {
    ...FONT.caption,
    color: tokens.colors.text.primary,
    fontWeight: "700",
  },
  linkButton: {
    marginBottom: tokens.spacing.md,
    alignSelf: "flex-start",
  },
  footerSpacer: {
    height: tokens.spacing["4xl"],
  },
  stickyFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: tokens.layout.screenPadding,
    backgroundColor: tokens.colors.background,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.border,
  },
  });
}
