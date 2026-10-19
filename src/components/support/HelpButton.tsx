import React from "react";
import { Pressable, Text, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { FONT, ICON, TOKENS } from "../../constants/theme";
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
      <Text style={[styles.mark, { color: colors.text.primary }]}>?</Text>
    </Pressable>
  );
}

export function helpHeader(screen: ScreenId): { headerRight: () => React.ReactElement } {
  return { headerRight: () => <HeaderActions screen={screen} /> };
}

/** Ayuda y salud en la cabecera nativa (detalle, rastro, salud). */
export function HeaderActions({ screen }: { screen: ScreenId }) {
  const router = useRouter();
  const { colors } = useTheme();
  useLanguage();
  return (
    <View style={styles.row}>
      <HelpButton screen={screen} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("a11y.openHealth")}
        onPress={() => router.push("/system/health")}
        hitSlop={TOKENS.spacing.sm}
        style={styles.hit}
      >
        <Ionicons name="pulse-outline" size={ICON.xl} color={colors.text.primary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  hit: { minWidth: TOKENS.layout.minTouchTarget, minHeight: TOKENS.layout.minTouchTarget, alignItems: "center", justifyContent: "center" },
  mark: { ...FONT.h3 },
});
