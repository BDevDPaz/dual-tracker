import React from "react";
import { Pressable, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { FONT, TOKENS } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { t, useLanguage } from "../../i18n";
import type { ScreenId } from "../../support/types";

/** «?» abre la guía de esa pantalla. El signo no es una frase: la etiqueta accesible sí. */
export function HelpButton({ screen }: { screen: ScreenId }) {
  const router = useRouter();
  const { colors } = useTheme();
  useLanguage();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("support.helpButton")}
      onPress={() => router.push(`/support/guide/${screen}`)}
      hitSlop={TOKENS.spacing.sm}
      style={styles.hit}
    >
      <Text style={[styles.mark, { color: colors.primary }]}>?</Text>
    </Pressable>
  );
}

export function helpHeader(screen: ScreenId): { headerRight: () => React.ReactElement } {
  return { headerRight: () => <HelpButton screen={screen} /> };
}

const styles = StyleSheet.create({
  hit: { minWidth: TOKENS.layout.minTouchTarget, minHeight: TOKENS.layout.minTouchTarget, alignItems: "center", justifyContent: "center" },
  mark: { ...FONT.h2 },
});
