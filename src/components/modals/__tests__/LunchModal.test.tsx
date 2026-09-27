/** LunchModal — rejilla 2×2, hora de inicio con máscara y error explicado. */
import React from "react";
import { StyleSheet } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { t } from "../../../i18n";
import { LunchModal } from "../LunchModal";

describe("LunchModal", () => {
  test("las cuatro opciones van en rejilla 2×2 (wrap)", () => {
    render(<LunchModal visible mode="close" onCancel={jest.fn()} onConfirm={jest.fn()} />);
    const grid = StyleSheet.flatten(screen.getByTestId("lunch-options").props.style) as { flexWrap: string };
    expect(grid.flexWrap).toBe("wrap");
    expect(screen.getAllByRole("radio")).toHaveLength(4);
  });

  test("con askStartTime: 1230 → 12:30 y confirma; hora imposible se explica", () => {
    const onConfirm = jest.fn();
    render(<LunchModal visible mode="close" askStartTime onCancel={jest.fn()} onConfirm={onConfirm} />);
    fireEvent.press(screen.getByLabelText(`30 ${t("common.minutes")}`));
    fireEvent.changeText(screen.getByTestId("lunch-start"), "2599");
    expect(screen.getByText(t("common.invalidTime"))).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("lunch-start"), "1230");
    expect(screen.queryByText(t("common.invalidTime"))).toBeNull();
    fireEvent.press(screen.getByText(t("common.confirm")));
    expect(onConfirm).toHaveBeenCalledWith(30, "12:30");
  });
});
