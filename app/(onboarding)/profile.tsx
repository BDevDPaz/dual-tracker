/**
 * (onboarding)/profile.tsx — Alta de perfil (Producto §5.6).
 * Nombre, tarifa horaria, idioma y hora de recordatorio. Nada de campos de
 * empresa (multiplicador, radio…): eso es zona admin. Intención:
 * COMPLETE_ONBOARDING (marca onboardingCompleted).
 * Nota: la tarifa se fija aquí; después solo es editable en zona admin.
 */
import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Button, Input } from "../../src/components/ui";
import { TOKENS, FONT } from "../../src/constants/theme";
import { useWorkTracker } from "../../src/core/hooks";
import { selectSettings } from "../../src/core/selectors";
import { t } from "../../src/i18n";

export default function ProfileScreen() {
  const router = useRouter();
  const { state, emit } = useWorkTracker();
  const profile = selectSettings(state).profile;
  const [name, setName] = useState(profile.employeeName);
  const [rate, setRate] = useState(profile.hourlyRate ? String(profile.hourlyRate) : "");
  const [language, setLanguage] = useState<"es" | "en">(profile.language);
  const [reminder, setReminder] = useState(profile.dailyReminderTime);
  const [busy, setBusy] = useState(false);

  const rateNum = Number(rate.replace(",", "."));
  const valid = name.trim().length > 0 && Number.isFinite(rateNum) && rateNum >= 0 && /^([01]\d|2[0-3]):[0-5]\d$/.test(reminder);

  const onEnter = async () => {
    setBusy(true);
    const res = await emit({
      type: "COMPLETE_ONBOARDING",
      profile: { employeeName: name.trim(), hourlyRate: rateNum, language, dailyReminderTime: reminder },
    });
    setBusy(false);
    if (res.ok) router.replace("/");
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={[styles.title, { color: TOKENS.colors.text.primary }]}>{t("onboarding.profileTitle")}</Text>
      <Input label={t("onboarding.employeeName")} value={name} onChangeText={setName} autoCapitalize="words" />
      <Input label={t("onboarding.hourlyRate")} value={rate} onChangeText={setRate} keyboardType="decimal-pad" />
      <Text style={[styles.label, { color: TOKENS.colors.text.secondary }]}>{t("onboarding.language")}</Text>
      <View style={styles.langRow}>
        {(["es", "en"] as const).map((l) => (
          <Pressable
            key={l}
            onPress={() => setLanguage(l)}
            accessibilityRole="radio"
            accessibilityState={{ selected: language === l }}
            style={[styles.chip, { borderColor: language === l ? TOKENS.colors.primary : TOKENS.colors.border }]}
          >
            <Text style={{ color: language === l ? TOKENS.colors.primary : TOKENS.colors.text.secondary }}>{l.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>
      <Input label={t("onboarding.reminderTime")} value={reminder} onChangeText={setReminder} placeholder="07:00" />
      <Button label={t("onboarding.enter")} disabled={!valid} isLoading={busy} onPress={onEnter} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: TOKENS.spacing.xl, gap: TOKENS.spacing.sm },
  title: { ...FONT.h2, marginBottom: TOKENS.spacing.lg },
  label: { ...FONT.label, marginTop: TOKENS.spacing.sm },
  langRow: { flexDirection: "row", gap: TOKENS.spacing.sm, marginBottom: TOKENS.spacing.md },
  chip: { borderWidth: 1, borderRadius: TOKENS.radius.md, paddingVertical: TOKENS.spacing.sm, paddingHorizontal: TOKENS.spacing.lg },
});
