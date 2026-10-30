import React, { useState, useMemo } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer, Input, Button } from "../../src/components/ui";
import { useWorkTracker } from "../../src/core/hooks/useWorkTracker";
import { sessionStore } from "../../src/core/runtime";
import { useToast } from "../../src/context/ToastContext";
import { FONT } from "../../src/constants/theme";
import { useTheme } from "../../src/context/ThemeContext";

const TOTAL_STEPS = 4;
function OnboardingStepIndicator({ step }: { step: number }) {
  const { tokens } = useTheme();
  const styles = useMemo(() => StyleSheet.create({
    stepRow: { flexDirection: "row", gap: tokens.spacing.sm, marginBottom: tokens.spacing.xl },
    stepDot: { flex: 1, height: 4, borderRadius: tokens.radius.round },
  }), [tokens]);
  return (
    <View style={styles.stepRow}>
      {Array.from({ length: TOTAL_STEPS }).map((_, index) => (
        <View key={index} style={[styles.stepDot, { backgroundColor: index < step ? tokens.colors.primary : tokens.colors.surfaceElevated }]} />
      ))}
    </View>
  );
}
const TIME_FORMAT_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export default function ProfileScreen() {
  const { tokens } = useTheme();
  const router = useRouter();
  const { state, dispatch } = useWorkTracker();
  const { showToast } = useToast();
  const [employeeName, setEmployeeName] = useState(state.domain.settings.employeeName ?? "");
  const [hourlyRateText, setHourlyRateText] = useState(state.domain.settings.hourlyRate ? String(state.domain.settings.hourlyRate) : "");
  const [language, setLanguage] = useState<"es" | "en">((state.domain.settings.language as "es" | "en") ?? "es");
  const [dailyReminderTime, setDailyReminderTime] = useState(state.domain.settings.dailyReminderTime ?? "08:00");
  const [timeError, setTimeError] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);

  const styles = useMemo(() => StyleSheet.create({
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: tokens.layout.screenPadding, paddingTop: tokens.spacing.xl, paddingBottom: tokens.spacing["2xl"] },
    title: { ...FONT.h2, color: tokens.colors.text.primary, marginBottom: tokens.spacing.xs },
    subtitle: { ...FONT.body, color: tokens.colors.text.secondary, marginBottom: tokens.spacing.xl },
    fieldLabel: { ...FONT.label, color: tokens.colors.text.secondary, marginBottom: tokens.spacing.xs, marginLeft: 4 },
    languageRow: { flexDirection: "row", gap: tokens.spacing.sm, marginBottom: tokens.spacing.md },
    languageOption: { flex: 1, paddingVertical: tokens.spacing.sm, borderRadius: tokens.radius.md, borderWidth: 1, borderColor: tokens.colors.border, alignItems: "center", backgroundColor: tokens.colors.surface },
    languageOptionActive: { borderColor: tokens.colors.primary, backgroundColor: tokens.colors.surfaceElevated },
    languageOptionText: { ...FONT.bodyStrong, color: tokens.colors.text.secondary },
    languageOptionTextActive: { color: tokens.colors.primary },
    cta: { width: "100%", marginTop: tokens.spacing.lg },
  }), [tokens]);

  const handleSubmit = async () => {
    if (!TIME_FORMAT_REGEX.test(dailyReminderTime)) { setTimeError("Usa el formato HH:MM (24 horas), por ejemplo 08:00"); return; }
    setTimeError(undefined);
    const parsedRate = parseFloat(hourlyRateText.replace(",", "."));
    const hourlyRate = Number.isFinite(parsedRate) ? parsedRate : 0;
    setIsSaving(true);
    try {
      const mergedSettings = { ...state.domain.settings, employeeName: employeeName.trim(), hourlyRate, language, dailyReminderTime };
      await sessionStore.saveSettings({ ...mergedSettings, onboardingCompleted: true });
      dispatch({ type: "ONBOARDING_COMPLETED" });
      router.replace("/(tabs)");
    } catch { showToast("No se pudo guardar tu perfil. Revisa los datos e inténtalo de nuevo.", "error"); }
    finally { setIsSaving(false); }
  };

  return (
    <ScreenContainer noPadding>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <OnboardingStepIndicator step={4} />
        <Text style={styles.title}>Tu perfil</Text>
        <Text style={styles.subtitle}>Estos datos son tuyos: los de tu empresa (tarifa base, política de horas extra) se configuran después, en la zona administrativa.</Text>
        <Input label="Nombre del operario" placeholder="Ej. Ana Martínez" value={employeeName} onChangeText={setEmployeeName} autoCapitalize="words" />
        <Input label="Tarifa horaria" placeholder="Ej. 18.50" value={hourlyRateText} onChangeText={setHourlyRateText} keyboardType="decimal-pad" icon="cash-outline" />
        <Text style={styles.fieldLabel}>Idioma</Text>
        <View style={styles.languageRow}>
          <Pressable style={[styles.languageOption, language === "es" && styles.languageOptionActive]} onPress={() => setLanguage("es")} accessibilityRole="button" accessibilityState={{ selected: language === "es" }}>
            <Text style={[styles.languageOptionText, language === "es" && styles.languageOptionTextActive]}>Español</Text>
          </Pressable>
          <Pressable style={[styles.languageOption, language === "en" && styles.languageOptionActive]} onPress={() => setLanguage("en")} accessibilityRole="button" accessibilityState={{ selected: language === "en" }}>
            <Text style={[styles.languageOptionText, language === "en" && styles.languageOptionTextActive]}>English</Text>
          </Pressable>
        </View>
        <Input label="Hora de recordatorio diario" placeholder="HH:MM" value={dailyReminderTime} onChangeText={setDailyReminderTime} keyboardType="numbers-and-punctuation" icon="alarm-outline" error={timeError} maxLength={5} />
        <Button label="Entrar a Dual Tracker" variant="primary" size="lg" isLoading={isSaving} style={styles.cta} onPress={handleSubmit} />
      </ScrollView>
    </ScreenContainer>
  );
}
