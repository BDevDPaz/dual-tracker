/** Tarjeta de permiso: colapsa lo concedido, resalta lo pendiente y guía el ajuste. */
import React from "react";
import { StyleSheet } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { TOKENS } from "../../../constants/theme";
import { t } from "../../../i18n";
import { PermissionCard } from "../PermissionCard";

const base = {
  title: t("onboarding.permBgTitle"),
  body: t("onboarding.permBgBody"),
  enabled: true,
  onRequest: jest.fn(),
  onOpenSettings: jest.fn(),
};

describe("PermissionCard", () => {
  beforeEach(() => {
    base.onRequest.mockClear();
    base.onOpenSettings.mockClear();
  });

  test("una tarjeta concedida se colapsa y se vuelve a abrir con un objetivo de 44 px", () => {
    render(<PermissionCard {...base} state="granted" testID="card" />);
    expect(screen.queryByText(t("onboarding.permBgBody"))).toBeNull();
    const header = screen.getByRole("button", { name: t("a11y.permissionGranted", { title: base.title, state: t("permission.granted") }) });
    const style = StyleSheet.flatten(header.props.style) as { minHeight: number };
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(style.minHeight).toBeGreaterThanOrEqual(TOKENS.layout.minTouchTarget);
    expect(header.props.accessibilityState).toMatchObject({ expanded: false });
    fireEvent.press(header);
    expect(screen.getByText(t("onboarding.permBgBody"))).toBeTruthy();
    expect(header.props.accessibilityState.expanded).toBe(true);
  });

  test("la pendiente usa el acento oro del tema y no apaga el contraste con opacidad", () => {
    render(<PermissionCard {...base} state="denied" highlighted testID="card" />);
    const style = StyleSheet.flatten(screen.getByTestId("card").props.style) as { borderColor?: string; opacity?: number; backgroundColor?: string };
    expect(style.borderColor).toBe(TOKENS.colors.primary);
    expect(style.backgroundColor).toBe(TOKENS.colors.glass.fill);
    expect(style.opacity).toBeUndefined();
    expect(screen.getByLabelText(t("a11y.permissionPending", { title: base.title }))).toBeTruthy();
  });

  test("una deshabilitada no usa opacidad 0.5", () => {
    render(<PermissionCard {...base} state="unknown" enabled={false} testID="card" />);
    const style = StyleSheet.flatten(screen.getByTestId("card").props.style) as { opacity?: number };
    expect(style.opacity).not.toBe(0.5);
    expect(screen.getByRole("button", { name: t("onboarding.permRequest") }).props.accessibilityState.disabled).toBe(true);
  });

  test("con solo primer plano muestra la guía y el botón de ajustes", () => {
    const onOpenSettings = jest.fn();
    render(
      <PermissionCard
        {...base}
        state="denied"
        onOpenSettings={onOpenSettings}
        guidance={{
          body: t("onboarding.permBgAlwaysBody"),
          steps: [t("onboarding.permBgStepSettings"), t("onboarding.permBgStepAlways")],
          actionLabel: t("onboarding.permOpenSettings"),
          accessibilityLabel: t("a11y.permissionSettings", { title: base.title }),
        }}
      />,
    );
    expect(screen.getByText(t("onboarding.permBgAlwaysBody"))).toBeTruthy();
    expect(screen.getByText(t("onboarding.permBgStepAlways"), { exact: false })).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: t("a11y.permissionSettings", { title: base.title }) }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: t("onboarding.permRequest") })).toBeTruthy();
  });
});
