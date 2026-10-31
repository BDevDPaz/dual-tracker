/** G1: Almuerzo deshabilitado cuando el día ya lo usó. ES/EN vía t(). */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { setLanguage, t } from "../../../i18n";
import { PauseKindModal } from "../PauseKindModal";

describe("PauseKindModal", () => {
  test("lunchUsedToday deshabilita Almuerzo y usa pauseLunchUsed en ES y EN", () => {
    const onLunch = jest.fn();
    setLanguage("es");
    const props = { visible: true as const, lunchUsed: true, onLunch, onRest: jest.fn(), onCancel: jest.fn() };
    const view = render(<PauseKindModal {...props} />);
    expect(screen.getByText(t("modals.pauseLunchUsed"))).toBeTruthy();
    expect(screen.getByText("Ya tomaste almuerzo hoy.")).toBeTruthy();
    const lunch = screen.getByRole("button", { name: t("modals.pauseLunch") });
    expect(lunch.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(lunch);
    expect(onLunch).not.toHaveBeenCalled();
    view.unmount();
    setLanguage("en");
    render(<PauseKindModal {...props} />);
    expect(screen.getByText(t("modals.pauseLunchUsed"))).toBeTruthy();
    expect(screen.getByText("You already took lunch today.")).toBeTruthy();
    expect(screen.queryByText("Ya tomaste almuerzo hoy.")).toBeNull();
    const open = screen.getByRole("button", { name: t("modals.pauseLunch") });
    expect(open.props.accessibilityState.disabled).toBe(true);
    setLanguage("es");
  });

  test("sin almuerzo del día, Almuerzo sigue disponible", () => {
    const onLunch = jest.fn();
    render(<PauseKindModal visible lunchUsed={false} onLunch={onLunch} onRest={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByText(t("modals.pauseLunchSub"))).toBeTruthy();
    const lunch = screen.getByRole("button", { name: t("modals.pauseLunch") });
    expect(lunch.props.accessibilityState.disabled).toBe(false);
    fireEvent.press(lunch);
    expect(onLunch).toHaveBeenCalledTimes(1);
  });
});
