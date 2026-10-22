/** Un solo estado de «no existe»: el botón dice Volver. */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { setLanguage, t } from "../../../i18n";
import { NotFoundState } from "../NotFoundState";

afterEach(() => setLanguage("es"));

describe("NotFoundState", () => {
  test("muestra el título y Volver, y llama a onBack", () => {
    const onBack = jest.fn();
    render(<NotFoundState title={t("session.notFound")} onBack={onBack} />);
    expect(screen.getByText(t("session.notFound"))).toBeTruthy();
    expect(screen.getByText(t("common.back"))).toBeTruthy();
    expect(screen.queryByText(t("notFound.goHome"))).toBeNull();
    fireEvent.press(screen.getByTestId("empty-state-action"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test("en inglés el botón es Back", () => {
    setLanguage("en");
    render(<NotFoundState title="Missing" onBack={jest.fn()} />);
    expect(screen.getByText("Back")).toBeTruthy();
  });
});
