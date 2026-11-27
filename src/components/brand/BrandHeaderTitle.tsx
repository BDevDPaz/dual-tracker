import { Text, View, StyleSheet } from "react-native";
import { FONT, ICON, TOKENS } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { PinClockMark } from "./PinClockMark";

/**
 * Título de la cabecera nativa de Soporte. La barra sigue el tema activo
 * (stackHeaderOptions con useTheme().colors), no es obsidiana fija: la marca A
 * toma sus colores por defecto del tema y el texto usa colors.text.primary.
 */
export function BrandHeaderTitle({ title }: { title: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <PinClockMark size={ICON.xl} decorative />
      <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: TOKENS.spacing.sm },
  title: { ...FONT.bodyStrong },
});
