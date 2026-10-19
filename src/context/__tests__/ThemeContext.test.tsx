/** ThemeContext — fuente única de color: esquema, paletas y caída a oscuro. */
import React from "react";
import { Text } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { COLORS, CONTRAST_COLORS, PALETTE_LIGHT, TOKENS } from "../../constants/theme";
import { ThemeProvider, resolveScheme, themeFor, useTheme } from "../ThemeContext";

function Probe() {
  const { scheme, colors } = useTheme();
  return <Text testID="probe">{`${scheme}|${colors.background}|${colors.primary}`}</Text>;
}

describe("ThemeContext", () => {
  test("sin proveedor → oscuro (compatibilidad con TOKENS)", () => {
    render(<Probe />);
    expect(screen.getByTestId("probe").props.children).toBe(`dark|${TOKENS.colors.background}|${TOKENS.colors.primary}`);
  });

  test("por defecto el proveedor usa profile.theme ausente = dark", () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("probe").props.children.startsWith("dark|")).toBe(true);
  });

  test("light: papel #F4F1EA, tinta #1A1714, oro #8A6D1F", () => {
    render(
      <ThemeProvider preference="light">
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("probe").props.children).toBe("light|#F4F1EA|#8A6D1F");
    expect(COLORS.light.text.primary).toBe("#1A1714");
    expect(PALETTE_LIGHT.obsidian).toBe("#F4F1EA");
  });

  test("system sigue al SO; lo desconocido cae a oscuro", () => {
    expect(resolveScheme("system", "light")).toBe("light");
    expect(resolveScheme("system", "dark")).toBe("dark");
    expect(resolveScheme("system", null)).toBe("dark");
    expect(themeFor("light").tokens.colors).toBe(COLORS.light);
  });

  test("alto contraste aclara texto y bordes y conserva el oro", () => {
    const theme = themeFor("dark", null, true);
    expect(theme.highContrast).toBe(true);
    expect(theme.scheme).toBe("dark");
    expect(theme.colors.background).toBe(CONTRAST_COLORS.background);
    expect(theme.colors.primary).toBe("#C5A059");
    expect(theme.colors.text.primary).toBe("#FFFFFF");
    expect(theme.colors.border).toBe("#FFFFFF");
  });

  test("fondos de estado son rgba fijos por tono (no `${color}15`)", () => {
    for (const v of Object.values(COLORS.dark.statusBg)) expect(v).toMatch(/^rgba\(\d+, \d+, \d+, 0\.12\)$/);
    expect(COLORS.dark.focusRing).toBe("rgba(197, 160, 89, 0.4)");
  });
});
