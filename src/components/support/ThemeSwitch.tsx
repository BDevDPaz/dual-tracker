import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { TOKENS, FONT } from "../../constants/theme";
import type { ThemePreference } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { useToastOptional } from "../../context/ToastContext";
import { Chip } from "../ui/Chip";
import { useWorkTracker } from "../../core/hooks";
import { t, useLanguage } from "../../i18n";

const OPTIONS: { id: ThemePreference; labelKey: "onboarding.themeSystem" | "onboarding.themeDark" | "onboarding.themeLight" }[] = [
  { id: "system", labelKey: "onboarding.themeSystem" },
  { id: "dark", labelKey: "onboarding.themeDark" },
  { id: "light", labelKey: "onboarding.themeLight" },
];

/** El tema se guarda al pulsar. La bienvenida parte de «system» (el teléfono). */
export function ThemeSwitch() {
  useLanguage();
  const { preference, colors } = useTheme();
  const toast = useToastOptional();
  const { emit } = useWorkTracker();

  const onTheme = async (next: ThemePreference) => {
    if (next === preference) return;
    const res = await emit({ type: "SAVE_SETTINGS", patch: { profile: { theme: next } } });
    if (!res.ok) toast?.showToast(t("common.actionFailed"), "error", undefined, (lang) => ({ title: t("common.actionFailed", {}, lang) }));
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.text.secondary }]}>{t("onboarding.theme")}</Text>
      <View style={styles.row}>
        {OPTIONS.map((option) => (
          <Chip
            key={option.id}
            testID={`theme-${option.id}`}
            label={t(option.labelKey)}
            selected={preference === option.id}
            onPress={() => void onTheme(option.id)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: TOKENS.spacing.xs },
  label: { ...FONT.label },
  row: { flexDirection: "row", flexWrap: "wrap", gap: TOKENS.spacing.sm },
});
