/** Panel reutilizable de guía: pasos, TalkBack y objetivo táctil. */
import React from "react";
import { StyleSheet } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { TOKENS } from "../../../constants/theme";
import { t } from "../../../i18n";
import { PermissionGuidancePanel } from "../PermissionGuidancePanel";

describe("PermissionGuidancePanel", () => {
  test("muestra el cuerpo, los pasos y un botón de ajustes de al menos 44 px", () => {
    const onAction = jest.fn();
    const label = t("a11y.permissionSettings", { title: t("onboarding.permNotifTitle") });
    render(
      <PermissionGuidancePanel
        body={t("onboarding.permNotifBlockedBody")}
        steps={[t("onboarding.permNotifStepSettings"), t("onboarding.permNotifStepNotifications")]}
        actionLabel={t("onboarding.permOpenSettings")}
        accessibilityLabel={label}
        onAction={onAction}
      />,
    );
    expect(screen.getByText(t("onboarding.permNotifBlockedBody"))).toBeTruthy();
    expect(screen.getByText(`1. ${t("onboarding.permNotifStepSettings")}`)).toBeTruthy();
    const button = screen.getByRole("button", { name: label });
    const style = StyleSheet.flatten(button.props.style) as { minHeight: number };
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(style.minHeight).toBeGreaterThanOrEqual(TOKENS.layout.minTouchTarget);
    fireEvent.press(button);
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
