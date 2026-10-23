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
import { Text, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Input, SAFE_EDGES, ScreenScroll } from "../../src/components/ui";
import { useFormFocusChain } from "../../src/components/ui/formChain";
import { FORM_FIELDS } from "../../src/components/ui/formFields";
import { HelpButton } from "../../src/components/support/HelpButton";
import { LanguageSwitch } from "../../src/components/support/LanguageSwitch";
import { TOKENS, FONT } from "../../src/constants/theme";
import { useTheme } from "../../src/context/ThemeContext";
import { useBusyAction, useWorkTracker } from "../../src/core/hooks";
import { selectSettings } from "../../src/core/selectors";
import { getLanguage, t } from "../../src/i18n";

export default function ProfileScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state, emit } = useWorkTracker();
  const profile = selectSettings(state).profile;
  const [name, setName] = useState(profile.employeeName);
  const [rate, setRate] = useState(profile.hourlyRate ? String(profile.hourlyRate) : "");
  const [reminder, setReminder] = useState(profile.dailyReminderTime);
  const { busy, run } = useBusyAction();

  const rateNum = Number(rate.replace(",", "."));
  // Campo vacío no cuenta como tarifa 0 (Number("") === 0). $0 no se acepta en el alta.
  const rateOk = rate.trim() !== "" && Number.isFinite(rateNum) && rateNum > 0;
  const valid = name.trim().length > 0 && rateOk && /^([01]\d|2[0-3]):[0-5]\d$/.test(reminder);
  const onEnter = () =>
    run(async () => {
      const res = await emit({
        type: "COMPLETE_ONBOARDING",
        profile: { employeeName: name.trim(), hourlyRate: rateNum, language: getLanguage(), dailyReminderTime: reminder },
      });
      if (res.ok) router.replace("/");
      return res;
    });
  const chain = useFormFocusChain(FORM_FIELDS.onboardingProfile, { onSubmit: () => void onEnter(), canSubmit: valid && !busy });

  return (
    <ScreenScroll edges={SAFE_EDGES.none}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, styles.titleFlex, { color: colors.text.primary }]}>{t("onboarding.profileTitle")}</Text>
        <HelpButton screen="profile" />
      </View>
      <Input {...chain.props("name")} label={t("onboarding.employeeName")} value={name} onChangeText={setName} />
      <Input
        {...chain.props("rate")}
        label={t("onboarding.hourlyRate")}
        value={rate}
        onChangeText={setRate}
        prefix="$"
        suffix={t("common.perHour")}
        hint={t("onboarding.rateAdminOnly")}
        error={rate.trim() !== "" && !rateOk ? t("onboarding.rateInvalid") : undefined}
      />
      <LanguageSwitch />
      <Input {...chain.props("reminder")} label={t("onboarding.reminderTime")} value={reminder} onChangeText={setReminder} placeholder="07:00" mask="HH:mm" />
      <Button label={t("onboarding.enter")} disabled={!valid} isLoading={busy} onPress={onEnter} />
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.sm },
  title: { ...FONT.h2, marginBottom: TOKENS.spacing.lg },
  titleFlex: { flex: 1 },
});
