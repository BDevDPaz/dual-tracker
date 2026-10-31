/** Primitivas del restyle premium: altura, oro del dinero y alto contraste. */
import React from "react";
import { StyleSheet } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { TOKENS } from "../../../constants/theme";
import { PrimaryButton } from "../Button";
import { SummaryCard } from "../SummaryCard";

describe("premium", () => {
  test("PrimaryButton mide 52 y no baja de 48", () => {
    render(<PrimaryButton label="Guardar" testID="primary" />);
    const style = StyleSheet.flatten(screen.getByTestId("primary").props.style) as { minHeight: number; borderRadius: number };
    expect(style.minHeight).toBe(TOKENS.layout.buttonPrimary);
    expect(style.minHeight).toBeGreaterThanOrEqual(TOKENS.layout.minTouchTarget);
    expect(style.borderRadius).toBe(TOKENS.radius.button);
  });

  test("SummaryCard pinta el dinero en oro y las horas en tinta", () => {
    render(<SummaryCard hoursLabel="Horas" hours="8.00 h" moneyLabel="Estimado" money="$160.00" />);
    const money = StyleSheet.flatten(screen.getByText("$160.00").props.style) as { color: string; fontVariant?: string[] };
    const hours = StyleSheet.flatten(screen.getByText("8.00 h").props.style) as { fontVariant?: string[] };
    expect(money.color).toBe(TOKENS.colors.goldText);
    expect(money.fontVariant).toContain("tabular-nums");
    expect(hours.fontVariant).toContain("tabular-nums");
  });
});
