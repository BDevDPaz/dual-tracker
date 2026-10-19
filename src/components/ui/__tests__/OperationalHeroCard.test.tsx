/** OperationalHeroCard — CTAs apilados en pantallas < 360 dp y línea de siguiente acción. */
import React from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { getSessionStateUI } from "../../../core/selectors";
import { OperationalHeroCard } from "../OperationalHeroCard";

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({ __esModule: true, default: jest.fn() }));
const mockDims = useWindowDimensions as unknown as jest.Mock;

const props = (state: Parameters<typeof getSessionStateUI>[0]) => ({
  ui: getSessionStateUI(state),
  destination: "Obra",
  timeString: "1h 0m",
  earnings: "$25.00",
  onPrimaryAction: jest.fn(),
  onSecondaryAction: jest.fn(),
});

const direction = () => (StyleSheet.flatten(screen.getByTestId("hero-actions").props.style) as { flexDirection: string }).flexDirection;

describe("OperationalHeroCard", () => {
  test("ancho ≥ 360: CTAs en fila", () => {
    mockDims.mockReturnValue({ width: 390, height: 800, scale: 2, fontScale: 1 });
    render(<OperationalHeroCard {...props("ACTIVA")} />);
    expect(direction()).toBe("row");
    expect(screen.getByTestId("arrival-mark", { includeHiddenElements: true })).toBeTruthy();
  });

  test("ancho < 360: CTAs apilados y tipografía ≥ 16", () => {
    mockDims.mockReturnValue({ width: 320, height: 640, scale: 2, fontScale: 1 });
    render(<OperationalHeroCard {...props("ACTIVA")} />);
    expect(direction()).toBe("column");
    const timer = StyleSheet.flatten(screen.getByTestId("hero-timer").props.style) as { fontSize: number; fontVariant: string[] };
    expect(timer.fontSize).toBeGreaterThanOrEqual(16);
    expect(timer.fontVariant).toContain("tabular-nums");
  });

  test("ESPERANDO: línea de siguiente acción en lugar del hueco vacío", () => {
    mockDims.mockReturnValue({ width: 390, height: 800, scale: 2, fontScale: 1 });
    render(<OperationalHeroCard {...props("ESPERANDO")} nextAction="Siguiente: llegar a Obra · geocerca vigilando" />);
    expect(screen.getByTestId("hero-next-action")).toBeTruthy();
    expect(screen.getByText("Siguiente: llegar a Obra · geocerca vigilando")).toBeTruthy();
    expect(screen.queryByTestId("hero-timer")).toBeNull();
    expect(screen.queryByTestId("arrival-mark")).toBeNull();
  });
});
