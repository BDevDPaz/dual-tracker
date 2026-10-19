import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { TOKENS, FONT } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";

/** Fila etiqueta/valor para desgloses (sesión, estado de nómina, pack). */
export function KeyValueRow({ label, value, emphasis = false, mono = false }: { label: string; value: string; emphasis?: boolean; mono?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.text.secondary }]}>{label}</Text>
      <Text selectable style={[styles.value, { color: emphasis ? colors.primary : colors.text.primary }, mono && styles.mono]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: TOKENS.spacing.xs, gap: TOKENS.spacing.md },
  label: { ...FONT.caption, flex: 1 },
  value: { ...FONT.figure, flexShrink: 1, textAlign: "right", maxWidth: "48%" },
  mono: { ...FONT.micro, fontFamily: "monospace" },
});
