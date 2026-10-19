import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { TOKENS, FONT } from "../../constants/theme";
import { Chip } from "../ui/Chip";
import { useWorkTracker } from "../../core/hooks";
import { selectSettings } from "../../core/selectors";
import { setLanguage as setActiveLanguage, t, useLanguage } from "../../i18n";

/** Mismo selector que Ajustes: el idioma cambia al pulsar y las guías se repintan. */
export function LanguageSwitch() {
  const language = useLanguage();
  const { state, emit } = useWorkTracker();
  const saved = selectSettings(state).profile.language;

  const onLanguage = async (next: "es" | "en") => {
    if (next === language && next === saved) return;
    setActiveLanguage(next);
    const res = await emit({ type: "SET_LANGUAGE", language: next });
    if (!res.ok) setActiveLanguage(saved);
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: TOKENS.colors.text.secondary }]}>{t("onboarding.language")}</Text>
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
