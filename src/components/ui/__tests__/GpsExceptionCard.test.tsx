import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { t } from "../../../i18n";
import { GpsExceptionCard } from "../GpsExceptionCard";

describe("GpsExceptionCard", () => {
  test("abandono de zona explica y ofrece seguir, sin cerrar sola", () => {
    const onPrimary = jest.fn();
    const onSecondary = jest.fn();
    render(<GpsExceptionCard kind="zone_exit" onPrimary={onPrimary} onSecondary={onSecondary} />);
    expect(screen.getByText(t("gps.zoneExitBody"))).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: t("cta.stayOperating") }));
    fireEvent.press(screen.getByRole("button", { name: t("cta.confirmExit") }));
    expect(onPrimary).toHaveBeenCalledTimes(1);
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });
});
