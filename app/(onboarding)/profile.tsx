/**
 * (onboarding)/profile.tsx — Alta de perfil (Producto §5.6).
 * Nombre, tarifa horaria, idioma y hora de recordatorio. Nada de campos de
 * empresa (multiplicador, radio…): eso es zona admin. Intención:
 * COMPLETE_ONBOARDING (marca onboardingCompleted).
 * Nota: la tarifa se fija aquí; después solo es editable en zona admin.
 * El idioma es el mismo selector que Ajustes y Soporte: se aplica y se
 * guarda al pulsar, no al pulsar Entrar.
 */
import { useState } from "react";
import { Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Button, Input, SAFE_EDGES, ScreenScroll } from "../../src/components/ui";
import { useFormFocusChain } from "../../src/components/ui/formChain";
import { FORM_FIELDS } from "../../src/components/ui/formFields";
import { HelpButton } from "../../src/components/support/HelpButton";
import { LanguageSwitch } from "../../src/components/support/LanguageSwitch";
import { TOKENS, FONT } from "../../src/constants/theme";
import { useWorkTracker } from "../../src/core/hooks";
import { selectSettings } from "../../src/core/selectors";
import { getLanguage, t } from "../../src/i18n";

export default function ProfileScreen() {
  const router = useRouter();
  const { state, emit } = useWorkTracker();
  const profile = selectSettings(state).profile;
  const [name, setName] = useState(profile.employeeName);
  const [rate, setRate] = useState(profile.hourlyRate ? String(profile.hourlyRate) : "");
  const [reminder, setReminder] = useState(profile.dailyReminderTime);
  const [busy, setBusy] = useState(false);

  const rateNum = Number(rate.replace(",", "."));
  // Campo vacío no cuenta como tarifa 0 (Number("") === 0).
  const valid = name.trim().length > 0 && rate.trim() !== "" && Number.isFinite(rateNum) && rateNum >= 0 && /^([01]\d|2[0-3]):[0-5]\d$/.test(reminder);
  const onEnter = async () => {
    setBusy(true);
    const res = await emit({
      type: "COMPLETE_ONBOARDING",
      profile: { employeeName: name.trim(), hourlyRate: rateNum, language: getLanguage(), dailyReminderTime: reminder },
    });
    setBusy(false);
    if (res.ok) router.replace("/");
  };
  const chain = useFormFocusChain(FORM_FIELDS.onboardingProfile, { onSubmit: () => void onEnter(), canSubmit: valid && !busy });

  return (
    <ScreenScroll edges={SAFE_EDGES.none}>
      <HelpButton screen="profile" />
      <Text style={[styles.title, { color: TOKENS.colors.text.primary }]}>{t("onboarding.profileTitle")}</Text>
      <Input {...chain.props("name")} label={t("onboarding.employeeName")} value={name} onChangeText={setName} />
      <Input {...chain.props("rate")} label={t("onboarding.hourlyRate")} value={rate} onChangeText={setRate} />
      <LanguageSwitch />
      <Input {...chain.props("reminder")} label={t("onboarding.reminderTime")} value={reminder} onChangeText={setReminder} placeholder="07:00" mask="HH:mm" />
      <Button label={t("onboarding.enter")} disabled={!valid} isLoading={busy} onPress={onEnter} />
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  title: { ...FONT.h2, marginBottom: TOKENS.spacing.lg },
});
