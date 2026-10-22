import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { FONT, TOKENS } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { t, useLanguage } from "../../i18n";
import { Skeleton } from "./Skeleton";

/** La misma presentación de carga en pantalla completa y dentro de una sección. */
export function LoadingState({ message }: { message?: string }) {
  const { colors } = useTheme();
  useLanguage();
  const label = message ?? t("common.loading");
  return (
    <View style={styles.center} accessibilityRole="progressbar" accessibilityLabel={label}>
      <Skeleton decorative />
      <Text accessibilityElementsHidden importantForAccessibility="no" style={[styles.text, { color: colors.text.secondary }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", padding: TOKENS.spacing.xl },
  text: { ...FONT.caption, marginTop: TOKENS.spacing.md },
});
