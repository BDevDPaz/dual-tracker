import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { TOKENS, FONT } from "../../constants/theme";

/** Fila etiqueta/valor para desgloses (sesión, estado de nómina, pack). */
export function KeyValueRow({ label, value, emphasis = false, mono = false }: { label: string; value: string; emphasis?: boolean; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: TOKENS.colors.text.secondary }]}>{label}</Text>
      <Text selectable style={[styles.value, { color: emphasis ? TOKENS.colors.primary : TOKENS.colors.text.primary }, mono && styles.mono]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: TOKENS.spacing.xs, gap: TOKENS.spacing.md },
  label: { ...FONT.caption, flexShrink: 0 },
  value: { ...FONT.bodyStrong, fontSize: 14, flexShrink: 1, textAlign: "right" },
  mono: { fontFamily: "monospace", fontSize: 12 },
});
