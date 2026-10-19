import { Text, View, StyleSheet } from "react-native";
import { COLORS, FONT, ICON, TOKENS } from "../../constants/theme";
import { PinClockMark } from "./PinClockMark";

/**
 * Título de la cabecera nativa de Soporte. La barra es obsidiana fija
 * (stackHeaderOptions), así que la marca A usa la paleta oscura y no el
 * tema claro, que dejaría las manecillas en tinta sobre fondo negro.
 */
export function BrandHeaderTitle({ title }: { title: string }) {
  return (
    <View style={styles.row}>
      <PinClockMark size={ICON.xl} color={COLORS.dark.primary} handColor={COLORS.dark.text.primary} decorative />
      <Text style={[styles.title, { color: COLORS.dark.text.primary }]} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.sm },
  title: { ...FONT.bodyStrong },
});
