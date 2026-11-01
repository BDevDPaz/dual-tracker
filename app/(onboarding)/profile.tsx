/**
 * (onboarding)/profile.tsx — Nombre, tarifa bloqueada y recordatorio.
 * Continuar solo exige un nombre de al menos 2 caracteres. La tarifa no se
 * edita aquí: el cambio posterior ya pasa por el PIN de la zona admin
 * (SAVE_SETTINGS). El alta se marca en Listo, no en esta pantalla.
 */
import { useState } from "react";
import { Text, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Button, Input, SAFE_EDGES, ScreenScroll } from "../../src/components/ui";
import { HelpButton } from "../../src/components/support/HelpButton";
import { TOKENS, FONT, ICON } from "../../src/constants/theme";
import { useTheme } from "../../src/context/ThemeContext";
import { useWorkTracker } from "../../src/core/hooks";
import { selectSettings } from "../../src/core/selectors";
import { t } from "../../src/i18n";
import {
  formatReminderClock,
  lockedRateAmount,
  nameNeedsError,
  readDeviceHour24,
  stepReminderTime,
} from "../../src/onboarding/flow";

export default function ProfileScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state } = useWorkTracker();
  const profile = selectSettings(state).profile;
  const [name, setName] = useState(profile.employeeName);
  const [reminder, setReminder] = useState(profile.dailyReminderTime || "07:00");
  const [showNameError, setShowNameError] = useState(false);
  const hour24 = readDeviceHour24();
  const invalidName = nameNeedsError(name);

  const onContinue = () => {
    if (invalidName) {
      setShowNameError(true);
      return;
    }
    router.push({ pathname: "/(onboarding)/ready", params: { name: name.trim(), reminder } });
  };

  return (
    <ScreenScroll edges={SAFE_EDGES.none}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, styles.titleFlex, { color: colors.text.primary }]}>{t("onboarding.profileTitle")}</Text>
        <HelpButton screen="profile" />
      </View>
      <Input
        label={t("onboarding.employeeName")}
        value={name}
        onChangeText={(value) => {
          setName(value);
          if (showNameError) setShowNameError(nameNeedsError(value));
        }}
        error={showNameError && invalidName ? t("onboarding.nameMinError") : undefined}
        onSubmitEditing={onContinue}
      />
      <View style={styles.rate}>
        <View style={styles.rateRow}>
          <Ionicons name="lock-closed-outline" size={ICON.md} color={colors.text.secondary} />
          <Text style={[styles.rateLabel, { color: colors.text.secondary }]}>{t("onboarding.hourlyRate")}</Text>
          <Text style={[styles.rateValue, { color: colors.text.primary }]}>
            {t("onboarding.rateLockedValue", { amount: lockedRateAmount(profile.hourlyRate) })}
          </Text>
        </View>
        <Text style={[styles.help, { color: colors.text.secondary }]}>{t("onboarding.rateLockedHelp")}</Text>
      </View>
      <View style={styles.reminder}>
        <Text style={[styles.rateLabel, { color: colors.text.secondary }]}>{t("onboarding.reminderTime")}</Text>
        <View style={styles.stepper}>
          <Button
            label="−"
            variant="secondary"
            accessibilityLabel={t("onboarding.reminderStepDown")}
            onPress={() => setReminder((current) => stepReminderTime(current, -1))}
          />
          <Text style={[styles.clock, { color: colors.text.primary }]} accessibilityLabel={formatReminderClock(reminder, hour24)}>
            {formatReminderClock(reminder, hour24)}
          </Text>
          <Button
            label="+"
            variant="secondary"
            accessibilityLabel={t("onboarding.reminderStepUp")}
            onPress={() => setReminder((current) => stepReminderTime(current, 1))}
          />
        </View>
        <Text style={[styles.help, { color: colors.text.secondary }]}>{t("onboarding.reminderHelp")}</Text>
      </View>
      <Button label={t("common.continue")} onPress={onContinue} />
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.sm },
  title: { ...FONT.h2, marginBottom: TOKENS.spacing.lg },
  titleFlex: { flex: 1 },
  rate: { gap: TOKENS.spacing.xs },
  rateRow: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.sm, minHeight: TOKENS.layout.minTouchTarget },
  rateLabel: { ...FONT.label, flex: 1 },
  rateValue: { ...FONT.bodyStrong },
  help: { ...FONT.caption },
  reminder: { gap: TOKENS.spacing.sm },
  stepper: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.md },
  clock: { ...FONT.h2, flex: 1, textAlign: "center" },
});
