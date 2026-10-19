import { FONT, TOKENS, type ThemeColors } from "../../constants/theme";

/** Cabecera de pila: título grande, tinta (no oro) y fondo del tema activo. */
export function stackHeaderOptions(colors: ThemeColors = TOKENS.colors) {
  return {
    headerShown: true as const,
    freezeOnBlur: false,
    headerShadowVisible: false,
    headerTitleAlign: "center" as const,
    headerStyle: { backgroundColor: colors.background },
    headerTintColor: colors.text.primary,
    headerTitleStyle: { ...FONT.h2, color: colors.text.primary },
    contentStyle: { backgroundColor: colors.background },
  };
}
