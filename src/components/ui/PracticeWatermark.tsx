import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { t, useLanguage } from "../../i18n";

/** Marca de agua del modo práctica. No intercepta toques ni escribe datos. */
export function PracticeWatermark() {
  useLanguage();
  const { colors } = useTheme();
  return (
    <View pointerEvents="none" style={styles.layer} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text style={[styles.mark, { color: colors.text.primary }]}>{t("support.practice.watermark")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  mark: {
    ...FONT.display,
    letterSpacing: 6,
    opacity: 0.08,
    transform: [{ rotate: "-18deg" }],
  },
});
