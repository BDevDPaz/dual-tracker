/** Ritmo adaptable: anchos de referencia y escala de fuente sin recortar el texto de los botones. */
import React from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { BREAKPOINTS, FONT, TOKENS, contentMaxWidthFor, screenPaddingFor } from "../../../constants/theme";
import { getSessionStateUI } from "../../../core/selectors";
import { Button } from "../Button";
import { OperationalHeroCard } from "../OperationalHeroCard";
import { useResponsive } from "../responsive";

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 390, height: 844, scale: 2, fontScale: 1 })),
}));

const mockDims = useWindowDimensions as unknown as jest.Mock;

function setWindow(width: number, height: number, fontScale = 1) {
  mockDims.mockReturnValue({ width, height, scale: 2, fontScale });
}

function Probe() {
  const metrics = useResponsive();
  return (
    <View testID="probe">
      <Text testID="bp">{metrics.breakpoint}</Text>
      <Text testID="pad">{String(metrics.screenPadding)}</Text>
      <Text testID="max">{metrics.contentMaxWidth == null ? "full" : String(metrics.contentMaxWidth)}</Text>
      <Text testID="land">{metrics.landscape ? "land" : "port"}</Text>
      <Text testID="fs">{String(metrics.fontScale)}</Text>
    </View>
  );
}

const WINDOWS: { width: number; height: number; bp: string; pad: number; max: string; land: string }[] = [
  { width: 320, height: 640, bp: "compact", pad: TOKENS.layout.screenPaddingCompact, max: "full", land: "port" },
  { width: 360, height: 800, bp: "regular", pad: TOKENS.layout.screenPadding, max: "full", land: "port" },
  { width: 390, height: 844, bp: "regular", pad: TOKENS.layout.screenPadding, max: "full", land: "port" },
  { width: 600, height: 960, bp: "expanded", pad: TOKENS.layout.screenPadding, max: "full", land: "port" },
  { width: 840, height: 1200, bp: "tablet", pad: TOKENS.layout.screenPadding, max: String(TOKENS.layout.readableMax), land: "port" },
  { width: 800, height: 360, bp: "expanded", pad: TOKENS.layout.screenPadding, max: String(TOKENS.layout.readableMax), land: "land" },
];

describe("useResponsive", () => {
  test.each(WINDOWS)("$width×$height → $bp", ({ width, height, bp, pad, max, land }) => {
    setWindow(width, height);
    render(<Probe />);
    expect(screen.getByTestId("bp").props.children).toBe(bp);
    expect(screen.getByTestId("pad").props.children).toBe(String(pad));
    expect(screen.getByTestId("max").props.children).toBe(max);
    expect(screen.getByTestId("land").props.children).toBe(land);
    expect(screenPaddingFor(width)).toBe(pad);
    expect(contentMaxWidthFor(width, height)).toBe(max === "full" ? undefined : Number(max));
  });

  test.each([1, 1.3, 2])("fontScale %s llega al layout y el botón no lo capa", (fontScale) => {
    setWindow(390, 844, fontScale);
    render(
      <View>
        <Probe />
        <Button label="Guardar jornada" testID="cta" />
      </View>,
    );
    expect(screen.getByTestId("fs").props.children).toBe(String(fontScale));
    const button = screen.getByTestId("cta");
    expect(button.props.maxFontSizeMultiplier).toBeUndefined();
    expect(screen.getByText("Guardar jornada").props.numberOfLines).toBeUndefined();
    const style = StyleSheet.flatten(button.props.style) as { minHeight: number };
    expect(style.minHeight).toBeGreaterThanOrEqual(TOKENS.layout.minTouchTarget);
  });

  test("hero estrecho apila métricas y encoge la cifra; el botón no", () => {
    setWindow(320, 568, 2);
    render(
      <OperationalHeroCard
        ui={getSessionStateUI("ACTIVA")}
        destination="Obra norte con un nombre largo en español"
        timeString="12h 45m"
        earnings="$125.00"
        onPrimaryAction={jest.fn()}
      />,
    );
    const timer = screen.getByTestId("hero-timer");
    expect(timer.props.adjustsFontSizeToFit).toBe(true);
    expect(timer.props.minimumFontScale).toBe(0.6);
    expect(timer.props.numberOfLines).toBe(1);
    const flat = StyleSheet.flatten(timer.props.style) as { fontSize: number; fontVariant?: string[] };
    expect(flat.fontSize).toBe(FONT.metricCompact.fontSize);
    expect(flat.fontVariant).toContain("tabular-nums");
    const actions = StyleSheet.flatten(screen.getByTestId("hero-actions").props.style) as { flexDirection: string };
    expect(actions.flexDirection).toBe("column");
    expect(screen.getByText("Obra norte con un nombre largo en español").props.numberOfLines).toBe(2);
  });

  test("ancho de tablet deja los CTAs en fila", () => {
    setWindow(BREAKPOINTS.tablet, 1200, 1);
    render(
      <OperationalHeroCard
        ui={getSessionStateUI("ACTIVA")}
        destination="Obra"
        timeString="1h 0m"
        earnings="$25.00"
        onPrimaryAction={jest.fn()}
      />,
    );
    const actions = StyleSheet.flatten(screen.getByTestId("hero-actions").props.style) as { flexDirection: string };
    expect(actions.flexDirection).toBe("row");
  });

  test("instantánea del ritmo en teléfono estrecho y en tablet", () => {
    setWindow(320, 640, 2);
    const compact = render(<Probe />);
    expect(compact.toJSON()).toMatchSnapshot();
    compact.unmount();
    setWindow(BREAKPOINTS.tablet, 1200, 1);
    expect(render(<Probe />).toJSON()).toMatchSnapshot();
  });
});
