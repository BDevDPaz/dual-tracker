import { FONT, TOKENS } from "../../constants/theme";

/** Cabecera de pila compartida: mismo fondo, tipo y alineación en sesión, destinos, reportes, soporte, sistema y legal. */
export function stackHeaderOptions() {
  return {
    headerShown: true as const,
    freezeOnBlur: false,
    headerShadowVisible: false,
    headerTitleAlign: "center" as const,
    headerStyle: { backgroundColor: TOKENS.colors.background },
    headerTintColor: TOKENS.colors.primary,
    headerTitleStyle: { ...FONT.bodyStrong, color: TOKENS.colors.text.primary },
    contentStyle: { backgroundColor: TOKENS.colors.background },
  };
}
