/** Paso de permisos: el aviso queda arriba y Continuar nunca se bloquea. */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { t } from "../../../i18n";
import { PermissionsStep } from "../PermissionsStep";

const handlers = {
  onRequest: jest.fn(),
  onOpenSettings: jest.fn(),
  onContinue: jest.fn(),
};

function renderStep(overrides: Partial<React.ComponentProps<typeof PermissionsStep>> = {}) {
  return render(
    <PermissionsStep
      foreground="unknown"
      background="unknown"
      notifications="unknown"
      battery="unknown"
      platform="android"
      apiLevel={34}
      samsung
      busy={false}
      attempted={{}}
      {...handlers}
      {...overrides}
    />,
  );
}

describe("PermissionsStep", () => {
  beforeEach(() => {
    handlers.onRequest.mockClear();
    handlers.onOpenSettings.mockClear();
    handlers.onContinue.mockClear();
  });

  test("sin permisos el CTA es modo limitado, el aviso está sobre las tarjetas y se puede continuar", () => {
    renderStep();
    const banner = screen.getByText(t("onboarding.limitedBanner"));
    const card = screen.getByText(t("onboarding.permFgTitle"));
    const tree = JSON.stringify(screen.toJSON());
    expect(tree.indexOf(t("onboarding.limitedBanner"))).toBeLessThan(tree.indexOf(t("onboarding.permFgTitle")));
    expect(banner).toBeTruthy();
    expect(card).toBeTruthy();
    const next = screen.getByRole("button", { name: t("onboarding.continueLimited") });
    expect(next.props.accessibilityState?.disabled).not.toBe(true);
    fireEvent.press(next);
    expect(handlers.onContinue).toHaveBeenCalledTimes(1);
    expect(screen.getByText(t("onboarding.permBatteryTitle"))).toBeTruthy();
    expect(screen.getByText(t("onboarding.permBatteryBody"))).toBeTruthy();
  });

  test("si el segundo plano está denegado el banner degradado queda encima de las tarjetas", () => {
    renderStep({ foreground: "granted", background: "denied", notifications: "granted", battery: "unrestricted" });
    const tree = JSON.stringify(screen.toJSON());
    expect(tree.indexOf(t("onboarding.degradedBanner"))).toBeLessThan(tree.indexOf(t("onboarding.permFgTitle")));
    expect(screen.queryByText(t("onboarding.permFgBody"))).toBeNull();
    expect(screen.getByText(t("onboarding.permBgBody"))).toBeTruthy();
    expect(screen.getByText(t("onboarding.permBgAlwaysBody"))).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: t("a11y.permissionSettings", { title: t("onboarding.permBgTitle") }) }));
    expect(handlers.onOpenSettings).toHaveBeenCalledWith("LOCATION");
    const next = screen.getByRole("button", { name: t("onboarding.continuePartial") });
    expect(next.props.accessibilityState?.disabled).not.toBe(true);
  });

  test("notificaciones bloqueadas en Android 13 muestran Ajustes › Notificaciones", () => {
    renderStep({
      foreground: "granted",
      background: "granted",
      notifications: "blocked",
      battery: "unrestricted",
      apiLevel: 33,
    });
    expect(screen.getByText(t("onboarding.permNotifBlockedBody"))).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: t("a11y.permissionSettings", { title: t("onboarding.permNotifTitle") }) }));
    expect(handlers.onOpenSettings).toHaveBeenCalledWith("NOTIFICATIONS");
  });

  test("la batería restringida abre el ajuste existente y no impide continuar", () => {
    renderStep({
      foreground: "granted",
      background: "granted",
      notifications: "granted",
      battery: "restricted",
      samsung: true,
    });
    expect(screen.getByText(t("onboarding.permBatterySamsung"))).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: t("a11y.permissionSettings", { title: t("onboarding.permBatteryTitle") }) }));
    expect(handlers.onOpenSettings).toHaveBeenCalledWith("BATTERY");
    fireEvent.press(screen.getByRole("button", { name: t("common.continue") }));
    expect(handlers.onContinue).toHaveBeenCalledTimes(1);
  });

  test("en iOS no hay tarjeta de batería ni guía de Android 11", () => {
    renderStep({ platform: "ios", apiLevel: null, samsung: false, foreground: "granted", background: "denied" });
    expect(screen.queryByText(t("onboarding.permBatteryTitle"))).toBeNull();
    expect(screen.queryByText(t("onboarding.permBgAlwaysBody"))).toBeNull();
  });
});
