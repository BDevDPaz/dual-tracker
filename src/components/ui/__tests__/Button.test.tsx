/** Button — tamaño sm respeta el objetivo táctil mínimo; texto sobre danger desde el tema. */
import React from "react";
import { StyleSheet } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { TOKENS } from "../../../constants/theme";
import { Button } from "../Button";

describe("Button", () => {
  test("size=sm mide al menos minTouchTarget (44)", () => {
    render(<Button label="Ir" size="sm" testID="b" />);
    const style = StyleSheet.flatten(screen.getByTestId("b").props.style) as { height: number };
    expect(style.height).toBeGreaterThanOrEqual(TOKENS.layout.minTouchTarget);
  });

  test("danger usa colors.onDanger para el texto", () => {
    render(<Button label="Borrar" variant="danger" />);
    const style = StyleSheet.flatten(screen.getByText("Borrar").props.style) as { color: string };
    expect(style.color).toBe(TOKENS.colors.onDanger);
  });
});
