import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { TOKENS, FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { useToastOptional } from "../../context/ToastContext";
import { Chip } from "../ui/Chip";
import { useWorkTracker } from "../../core/hooks";
import { selectSettings } from "../../core/selectors";
import { setLanguage as setActiveLanguage, t, useLanguage } from "../../i18n";

/** Mismo selector que Ajustes: el idioma cambia al pulsar y las guías se repintan. */
export function LanguageSwitch() {
  const language = useLanguage();
  const { colors } = useTheme();
  const toast = useToastOptional();
  const { state, emit } = useWorkTracker();
  const saved = selectSettings(state).profile.language;

  const onLanguage = async (next: "es" | "en") => {
    if (next === language && next === saved) return;
    setActiveLanguage(next);
    const res = await emit({ type: "SET_LANGUAGE", language: next });
    if (!res.ok) {
      setActiveLanguage(saved);
      toast?.showToast(t("common.actionFailed"), "error", undefined, (lang) => ({ title: t("common.actionFailed", {}, lang) }));
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.text.secondary }]}>{t("onboarding.language")}</Text>
      <View style={styles.row}>
        {(["es", "en"] as const).map((code) => (
          <Chip
            key={code}
            testID={`language-${code}`}
            label={t(code === "es" ? "onboarding.languageEs" : "onboarding.languageEn")}
            selected={language === code}
            onPress={() => void onLanguage(code)}
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
