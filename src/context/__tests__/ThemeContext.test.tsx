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

  test("light: papel #F4F1EA, tinta #1C1B19, relleno #F6C452, texto dorado #7A5D0A", () => {
    render(
      <ThemeProvider preference="light">
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("probe").props.children).toBe("light|#F4F1EA|#F6C452");
    expect(COLORS.light.text.primary).toBe("#1C1B19");
    expect(COLORS.light.onPrimary).toBe("#1C1B19");
    expect(COLORS.light.goldText).toBe("#7A5D0A");
    expect(COLORS.light.primary).toBe("#F6C452");
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
    expect(theme.colors.primary).toBe("#F6C452");
    expect(theme.colors.onPrimary).toBe("#1C1B19");
    expect(theme.colors.goldText).toBe("#F6C452");
    expect(theme.colors.text.primary).toBe("#FFFFFF");
    expect(theme.colors.border).toBe("#FFFFFF");
  });

  test("fondos de estado son rgba fijos por tono (no `${color}15`)", () => {
    for (const v of Object.values(COLORS.dark.statusBg)) expect(v).toMatch(/^rgba\(\d+, \d+, \d+, 0\.12\)$/);
    expect(COLORS.dark.focusRing).toBe("rgba(246, 196, 82, 0.4)");
    expect(COLORS.dark.background).toBe("#0E0E0E");
    expect(COLORS.dark.surface).toBe("#121212");
    expect(COLORS.dark.surfaceElevated).toBe("#1E1E1E");
    expect(COLORS.dark.input).toBe("#1E1E1E");
    expect(COLORS.dark.border).toBe("#2A2A2A");
    expect(COLORS.dark.text.secondary).toBe("#A8A9AB");
    expect(COLORS.dark.primary).toBe("#F6C452");
    expect(COLORS.dark.onPrimary).toBe("#1C1B19");
    expect(COLORS.dark.status.info).toBe("#4A90E2");
    expect(COLORS.dark.status.success).toBe("#5CD65C");
    expect(COLORS.dark.status.warning).toBe("#F8C650");
    expect(COLORS.dark.status.danger).toBe("#D9534F");
    expect(COLORS.light.status.info).toBe("#4A90E2");
    expect(COLORS.light.status.success).toBe("#5CD65C");
    expect(COLORS.light.status.warning).toBe("#F8C650");
    expect(COLORS.light.status.danger).toBe("#D9534F");
    expect(COLORS.dark.divider).toBe("#33343A");
  });
});
