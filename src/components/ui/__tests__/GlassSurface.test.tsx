/** Cristal del hero y de ModalShell: blur + relleno + filo; sólido al reducir transparencia. */
import React from "react";
import { act, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { COLORS } from "../../../constants/theme";
import { ReduceTransparencyPref } from "../motion";
import { ModalShell } from "../ModalShell";
import { OperationalHeroCard } from "../OperationalHeroCard";
import { getSessionStateUI } from "../../../core/selectors";

const hero = () => (
  <OperationalHeroCard ui={getSessionStateUI("ACTIVA")} destination="Obra" timeString="01:00:00" earnings="$10" onPrimaryAction={() => undefined} />
);

describe("Glass", () => {
  test("hero con cristal: BlurView (tinte oscuro) + filo dorado 1 px", () => {
    render(hero());
    const blur = screen.getByTestId("glass-blur");
    expect(blur.props.tint).toBe("dark");
    const card = StyleSheet.flatten(screen.getByTestId("hero-card").props.style);
    expect(card.borderColor).toBe(COLORS.dark.glass.hairline);
    expect(card.borderWidth).toBe(1);
  });

  test("reducir transparencia → surfaceElevated sólido, sin blur", () => {
    act(() => ReduceTransparencyPref.__set(true));
    render(hero());
    expect(screen.queryByTestId("glass-blur")).toBeNull();
    const card = StyleSheet.flatten(screen.getByTestId("hero-card").props.style);
    expect(card.backgroundColor).toBe(COLORS.dark.surfaceElevated);
  });

  test("ModalShell usa la misma superficie", () => {
    render(<ModalShell visible title="T" onClose={() => undefined} testID="m" />);
    expect(screen.getByTestId("glass-blur")).toBeTruthy();
  });
});
