/** Marcas A y D: trazos del SVG fuente y color según la paleta. */
import fs from "fs";
import path from "path";
import React from "react";
import { Path } from "react-native-svg";
import { StyleSheet } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { COLORS } from "../../../constants/theme";
import { ThemeProvider } from "../../../context/ThemeContext";
import { t } from "../../../i18n";
import { ArrivalMark } from "../ArrivalMark";
import { BrandHeaderTitle } from "../BrandHeaderTitle";
import { PinClockMark } from "../PinClockMark";
import { ARRIVAL_CHECK, ARRIVAL_LINE, ARRIVAL_PIN, PIN_CLOCK_HANDS, PIN_CLOCK_PIN } from "../paths";

const ROOT = path.resolve(__dirname, "../../../..");

describe("trazos fuente", () => {
  test("A y D coinciden con assets/brand", () => {
    const a = fs.readFileSync(path.join(ROOT, "assets/brand/A/adaptive-foreground.svg"), "utf8");
    const d = fs.readFileSync(path.join(ROOT, "assets/brand/D/adaptive-foreground.svg"), "utf8");
    expect(a).toContain(PIN_CLOCK_PIN);
    expect(a).toContain(PIN_CLOCK_HANDS);
    expect(d).toContain(ARRIVAL_PIN);
    expect(d).toContain(ARRIVAL_CHECK);
    expect(d).toContain(ARRIVAL_LINE);
  });
});

describe("ArrivalMark", () => {
  test("oscuro: acento dorado y línea secundaria", () => {
    render(
      <ThemeProvider preference="dark">
        <ArrivalMark />
      </ThemeProvider>,
    );
    const mark = screen.getByTestId("arrival-mark");
    expect(mark.props.accessibilityLabel).toBe(t("a11y.arrivalConfirmed", {}, "es"));
    const pin = screen.UNSAFE_getAllByType(Path).map((n) => n.props);
    expect(pin.some((p) => p.fill === COLORS.dark.goldText)).toBe(true);
    expect(pin.some((p) => p.stroke === COLORS.dark.text.secondary)).toBe(true);
  });

  test("claro: acento y línea de la paleta de papel", () => {
    render(
      <ThemeProvider preference="light">
        <ArrivalMark />
      </ThemeProvider>,
    );
    const pin = screen.UNSAFE_getAllByType(Path).map((n) => n.props);
    expect(pin.some((p) => p.fill === COLORS.light.goldText)).toBe(true);
    expect(pin.some((p) => p.stroke === COLORS.light.text.secondary)).toBe(true);
    expect(COLORS.light.goldText).toBe("#7A5D0A");
    expect(COLORS.light.primary).toBe("#F6C452");
    expect(COLORS.light.goldText).not.toBe(COLORS.light.primary);
  });
});

describe("PinClockMark", () => {
  test("manecillas del tema y anuncio de marca", () => {
    render(
      <ThemeProvider preference="dark">
        <PinClockMark />
      </ThemeProvider>,
    );
    const mark = screen.getByLabelText(t("a11y.brandMark"));
    expect(mark.props.accessibilityRole).toBe("image");
    const paths = screen.UNSAFE_getAllByType(Path).map((n) => n.props);
    expect(paths.some((p) => p.stroke === COLORS.dark.goldText)).toBe(true);
    expect(paths.some((p) => p.stroke === COLORS.dark.text.primary)).toBe(true);
  });

  test("decorativa: no anuncia", () => {
    render(<PinClockMark decorative testID="pin-quiet" />);
    expect(screen.getByTestId("pin-quiet", { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(true);
  });
});

describe("BrandHeaderTitle", () => {
  function renderHeader(preference: "dark" | "light") {
    render(
      <ThemeProvider preference={preference}>
        <BrandHeaderTitle title="Soporte" />
      </ThemeProvider>,
    );
    const strokes = screen.UNSAFE_getAllByType(Path).map((n) => n.props.stroke);
    const textColor = StyleSheet.flatten(screen.getByText("Soporte").props.style).color;
    return { strokes, textColor };
  }

  test("oscuro: pin y texto de la paleta oscura", () => {
    const { strokes, textColor } = renderHeader("dark");
    expect(strokes).toContain(COLORS.dark.goldText);
    expect(textColor).toBe(COLORS.dark.text.primary);
    expect(textColor).toBe("#FFFFFF");
  });

  test("claro: la barra sigue el tema, pin y texto de la paleta de papel", () => {
    const { strokes, textColor } = renderHeader("light");
    expect(strokes).toContain(COLORS.light.goldText);
    expect(COLORS.light.goldText).toBe("#7A5D0A");
    expect(textColor).toBe(COLORS.light.text.primary);
    expect(textColor).toBe("#1C1B19");
    expect(strokes).not.toContain(COLORS.dark.text.primary);
  });
});
