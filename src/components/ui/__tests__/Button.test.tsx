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

  test("primary: relleno #F6C452 y texto onPrimary #1C1B19", () => {
    render(<Button label="Guardar" testID="primary" />);
    const node = screen.getByTestId("primary");
    const style = StyleSheet.flatten(node.props.style) as { backgroundColor: string; borderColor: string };
    expect(style.backgroundColor).toBe("#F6C452");
    expect(style.backgroundColor).toBe(TOKENS.colors.primary);
    expect(style.borderColor).toBe(TOKENS.colors.primary);
    const text = StyleSheet.flatten(screen.getByText("Guardar").props.style) as { color: string };
    expect(text.color).toBe("#1C1B19");
    expect(text.color).toBe(TOKENS.colors.onPrimary);
  });

  test("danger usa colors.onDanger para el texto", () => {
    render(<Button label="Borrar" variant="danger" />);
    const style = StyleSheet.flatten(screen.getByText("Borrar").props.style) as { color: string };
    expect(style.color).toBe(TOKENS.colors.onDanger);
  });
});
