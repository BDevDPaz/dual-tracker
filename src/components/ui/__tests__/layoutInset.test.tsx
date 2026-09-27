/** Layout — el margen lateral es de la pantalla; `inset` solo fuera de un contenedor con padding. */
import React from "react";
import { StyleSheet } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { TOKENS } from "../../../constants/theme";
import { DailySummaryBlock } from "../DailySummaryBlock";
import { DocumentPreviewWidget } from "../DocumentPreviewWidget";
import { PageHeader } from "../PageHeader";

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn() }) }));

describe("inset", () => {
  test("DailySummaryBlock sin margen lateral por defecto; con inset usa screenPadding", () => {
    const { toJSON, rerender } = render(<DailySummaryBlock hours="1 h" earnings="$1" />);
    const root = () => StyleSheet.flatten((toJSON() as { props: { style: never } }).props.style) as { marginHorizontal?: number };
    expect(root().marginHorizontal ?? 0).toBe(0);
    rerender(<DailySummaryBlock hours="1 h" earnings="$1" inset />);
    expect(root().marginHorizontal).toBe(TOKENS.layout.screenPadding);
  });

  test("DocumentPreviewWidget sin margen lateral por defecto", () => {
    const { toJSON } = render(<DocumentPreviewWidget employeeName="A" dateRange="r" totalHours="1 h" totalEarnings="$1" />);
    const style = StyleSheet.flatten((toJSON() as { props: { style: never } }).props.style) as { marginHorizontal?: number };
    expect(style.marginHorizontal ?? 0).toBe(0);
  });

  test("PageHeader sin padding lateral por defecto; con inset lo añade", () => {
    const { toJSON, rerender } = render(<PageHeader title="Hoy" />);
    const root = () => StyleSheet.flatten((toJSON() as { props: { style: never } }).props.style) as { paddingHorizontal?: number };
    expect(root().paddingHorizontal ?? 0).toBe(0);
    rerender(<PageHeader title="Hoy" inset />);
    expect(root().paddingHorizontal).toBe(TOKENS.layout.screenPadding);
    expect(screen.getByText("Hoy")).toBeTruthy();
  });
});
