/** Button — tamaño sm respeta el objetivo táctil mínimo; texto sobre danger desde el tema. */
import React from "react";
import { StyleSheet } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { TOKENS } from "../../../constants/theme";
import { Button } from "../Button";

describe("Button", () => {
  test("size=sm mide al menos minTouchTarget (48) y no capa la escala de fuente", () => {
    render(<Button label="Ir" size="sm" testID="b" />);
    const node = screen.getByTestId("b");
    const style = StyleSheet.flatten(node.props.style) as { minHeight: number };
    expect(style.minHeight).toBeGreaterThanOrEqual(TOKENS.layout.minTouchTarget);
    expect(node.props.maxFontSizeMultiplier).toBeUndefined();
  });

  test("danger usa colors.onDanger para el texto", () => {
    render(<Button label="Borrar" variant="danger" />);
    const style = StyleSheet.flatten(screen.getByText("Borrar").props.style) as { color: string };
    expect(style.color).toBe(TOKENS.colors.onDanger);
  });
});
