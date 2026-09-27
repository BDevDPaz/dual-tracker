/** EmptyState — acción opcional con Button. */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { EmptyState } from "../EmptyState";

describe("EmptyState", () => {
  test("sin action no pinta botón", () => {
    render(<EmptyState title="Vacío" />);
    expect(screen.queryByTestId("empty-state-action")).toBeNull();
  });

  test("action={{label,onPress}} pinta un Button que llama a onPress", () => {
    const onPress = jest.fn();
    render(<EmptyState title="Sin destinos" action={{ label: "Crear primer destino", onPress }} />);
    fireEvent.press(screen.getByText("Crear primer destino"));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("empty-state-action").props.accessibilityRole).toBe("button");
  });
});
