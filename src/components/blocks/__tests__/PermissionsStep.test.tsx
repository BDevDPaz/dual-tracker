/** Permisos del alta: un subpaso, ubicación precisa obligatoria, el resto se puede saltar. */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { en, es, t } from "../../../i18n";
import { PermissionsStep } from "../PermissionsStep";

const handlers = {
  onRequest: jest.fn(),
  onOpenSettings: jest.fn(),
  onAdvance: jest.fn(),
};

function renderStep(overrides: Partial<React.ComponentProps<typeof PermissionsStep>> = {}) {
  return render(
    <PermissionsStep
      step="fine"
      index={1}
      total={3}
      foreground="unknown"
      accuracy="unknown"
      background="unknown"
      notifications="unknown"
      battery="unknown"
      platform="android"
      apiLevel={34}
      busy={false}
      reminderLabel="7:00 AM"
      {...handlers}
      {...overrides}
    />,
  );
}

describe("PermissionsStep", () => {
  beforeEach(() => {
    handlers.onRequest.mockClear();
    handlers.onOpenSettings.mockClear();
    handlers.onAdvance.mockClear();
  });

  test("la ubicación precisa bloquea Continuar y la aproximada no cuenta", () => {
    const view = renderStep({ foreground: "granted", accuracy: "coarse" });
    expect(screen.getByText(t("onboarding.permCounter", { n: 1, total: 3 }))).toBeTruthy();
    expect(screen.getAllByText(/aproximada/i).length).toBeGreaterThan(0);
    expect(screen.getByText(t("onboarding.permFineBody"))).toBeTruthy();
    const next = screen.getByRole("button", { name: t("common.continue") });
    expect(next.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(next);
    expect(handlers.onAdvance).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole("button", { name: t("onboarding.permOpenSettings") }));
    expect(handlers.onOpenSettings).toHaveBeenCalledWith("LOCATION");

    view.rerender(
      <PermissionsStep
        step="fine"
        index={1}
        total={3}
        foreground="granted"
        accuracy="fine"
        background="denied"
        notifications="denied"
        battery="restricted"
        platform="android"
        apiLevel={34}
        busy={false}
        reminderLabel="7:00 AM"
        {...handlers}
      />,
    );
    fireEvent.press(screen.getByRole("button", { name: t("common.continue") }));
    expect(handlers.onAdvance).toHaveBeenCalledTimes(1);
  });

  test("Continuar del segundo plano no vuelve a exigir la ubicación precisa", () => {
    renderStep({
      step: "background",
      index: 2,
      foreground: "denied",
      accuracy: "coarse",
      background: "granted",
      battery: "unrestricted",
    });
    expect(screen.getByText(t("onboarding.permBgScreenTitle"))).toBeTruthy();
    expect(screen.getByText(t("onboarding.permBgScreenSubtitle"))).toBeTruthy();
    expect(screen.getByText(t("onboarding.permBgStepAlways"))).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: t("onboarding.permGoSettings") }));
    expect(handlers.onOpenSettings).toHaveBeenCalledWith("LOCATION");
    fireEvent.press(screen.getByRole("button", { name: t("onboarding.permActivate") }));
    expect(handlers.onOpenSettings).toHaveBeenCalledWith("BATTERY");
    fireEvent.press(screen.getByTestId("onboarding-continue"));
    expect(handlers.onAdvance).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(t("onboarding.permSkipTitle"))).toBeNull();
  });

  test("sin activar, Continuar abre la hoja y solo sale al confirmar", () => {
    renderStep({ step: "background", index: 2, foreground: "granted", accuracy: "fine" });
    fireEvent.press(screen.getByTestId("onboarding-continue"));
    expect(handlers.onAdvance).not.toHaveBeenCalled();
    expect(screen.getByText(t("onboarding.permSkipBody"))).toBeTruthy();
    expect(screen.getByText(t("onboarding.permSkipBody")).props.children).not.toMatch(/diseñada/i);
    fireEvent.press(screen.getByRole("button", { name: t("onboarding.permSkipConfirm") }));
    expect(handlers.onAdvance).toHaveBeenCalledTimes(1);
  });

  test("el enlace de Samsung o Xiaomi muestra los pasos que ya existen", () => {
    renderStep({ step: "background", index: 2, battery: "restricted" });
    fireEvent.press(screen.getByRole("button", { name: t("onboarding.permOemLink") }));
    expect(screen.getByText(t("onboarding.permBatterySamsung"))).toBeTruthy();
    expect(screen.getByText(t("onboarding.permOemXiaomi"))).toBeTruthy();
    expect(screen.getByText(t("onboarding.permBatteryBody"))).toBeTruthy();
  });

  test("notificaciones: Ahora no explica que se puede hacer después", () => {
    renderStep({ step: "notifications", index: 3, notifications: "denied" });
    expect(screen.getByText(t("onboarding.permNotifAround", { time: "7:00 AM" }))).toBeTruthy();
    expect(screen.queryByText("Al tocar se abre Dual Tracker")).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: t("onboarding.permNotifAllow") }));
    expect(handlers.onRequest).toHaveBeenCalledWith("notifications");
    fireEvent.press(screen.getByRole("button", { name: t("onboarding.permNotNow") }));
    expect(screen.getByText(t("onboarding.permNotifLaterTitle"))).toBeTruthy();
    expect(screen.getByText(t("onboarding.permNotifLaterBody"))).toBeTruthy();
    expect(handlers.onAdvance).not.toHaveBeenCalled();
    const continues = screen.getAllByRole("button", { name: t("common.continue") });
    fireEvent.press(continues[continues.length - 1]);
    expect(handlers.onAdvance).toHaveBeenCalledTimes(1);
  });

  test("notificaciones bloqueadas abren ajustes y, si ya están concedidas, Continuar sale", () => {
    const view = renderStep({ step: "notifications", index: 3, notifications: "blocked" });
    fireEvent.press(screen.getByRole("button", { name: t("onboarding.permOpenSettings") }));
    expect(handlers.onOpenSettings).toHaveBeenCalledWith("NOTIFICATIONS");
    view.rerender(
      <PermissionsStep
        step="notifications"
        index={3}
        total={3}
        foreground="granted"
        accuracy="fine"
        background="denied"
        notifications="granted"
        battery="restricted"
        platform="android"
        apiLevel={34}
        busy={false}
        reminderLabel="7:00 AM"
        {...handlers}
      />,
    );
    fireEvent.press(screen.getByTestId("onboarding-continue"));
    expect(handlers.onAdvance).toHaveBeenCalledTimes(1);
  });

  test("en iOS no hay bloque de batería ni la frase de Android 11", () => {
    renderStep({ step: "background", index: 2, platform: "ios", apiLevel: null, background: "denied" });
    expect(screen.queryByText(t("onboarding.permBatteryTitle"))).toBeNull();
    expect(screen.queryByText(t("onboarding.permBgAlwaysBody"))).toBeNull();
    expect(screen.getByText(t("onboarding.permBgOnlySubtitle"))).toBeTruthy();
    expect(screen.getByText(t("onboarding.permBgBody"))).toBeTruthy();
  });
});

/**
 * B1 y B3 (Solicitud 7, PR 1). Textos exactos de b1b3_prompt.txt:4-5 (B1) y :8-9 (B3).
 * B1: divulgación de ubicación en segundo plano en toda versión de Android, justo
 * encima del botón de la tarjeta («Conceder» o «Ir a Ajustes»). No en iOS.
 */
describe("PermissionsStep · B1/B3 tarjeta de segundo plano", () => {
  const DISCLOSURE_ES =
    "Dual Tracker recopila tu ubicación para registrar tu jornada, confirmar tus horas y avisarte si sales del sitio, incluso cuando la app está cerrada o no la estás usando.";
  const DISCLOSURE_EN =
    "Dual Tracker collects location data to record your shift, confirm your hours and alert you if you leave the site, even when the app is closed or not in use.";
  const BODY_ES = "Sirve para registrar tu llegada y tu salida del sitio aunque la app esté cerrada.";
  const BODY_EN = "Lets the app record when you arrive at and leave the site, even when it is closed.";

  type Node = { children?: (Node | string)[] | null } | string | null;
  /** Textos de la tarjeta de segundo plano en orden de pintado. */
  function cardTexts(): string[] {
    const out: string[] = [];
    const walk = (n: Node) => {
      if (n == null) return;
      if (typeof n === "string") {
        out.push(n);
        return;
      }
      (n.children ?? []).forEach(walk);
    };
    walk(screen.getByTestId("permission-background") as unknown as Node);
    return out;
  }
  function expectDisclosureRightAbove(buttonLabel: string) {
    const texts = cardTexts();
    const at = texts.indexOf(DISCLOSURE_ES);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(texts[at + 1]).toBe(buttonLabel);
  }

  test("textos exactos en es y en", () => {
    expect(es.onboarding.permBgDisclosure).toBe(DISCLOSURE_ES);
    expect(en.onboarding.permBgDisclosure).toBe(DISCLOSURE_EN);
    expect(es.onboarding.permBgBody).toBe(BODY_ES);
    expect(en.onboarding.permBgBody).toBe(BODY_EN);
  });

  test("Android < 11: divulgación justo encima de «Conceder» y cuerpo nuevo de permBgBody", () => {
    renderStep({ step: "background", index: 2, platform: "android", apiLevel: 29, background: "denied" });
    expect(screen.getByRole("button", { name: "Conceder" })).toBeTruthy();
    expectDisclosureRightAbove("Conceder");
    expect(screen.getByText(BODY_ES)).toBeTruthy();
    expect(screen.queryByText(t("onboarding.permBgAlwaysBody"))).toBeNull();
  });

  test("Android 11+: divulgación justo encima de «Ir a Ajustes» y sin permBgBody", () => {
    renderStep({ step: "background", index: 2, platform: "android", apiLevel: 34, background: "denied" });
    expect(screen.getByRole("button", { name: "Ir a Ajustes" })).toBeTruthy();
    expectDisclosureRightAbove("Ir a Ajustes");
    expect(screen.queryByText(BODY_ES)).toBeNull();
    expect(screen.getByText(t("onboarding.permBgAlwaysBody"))).toBeTruthy();
  });

  test("Android < 11 con el permiso bloqueado: divulgación justo encima de «Ir a Ajustes»", () => {
    renderStep({ step: "background", index: 2, platform: "android", apiLevel: 29, background: "blocked" });
    expect(screen.getByRole("button", { name: "Ir a Ajustes" })).toBeTruthy();
    expectDisclosureRightAbove("Ir a Ajustes");
    expect(screen.getByText(BODY_ES)).toBeTruthy();
  });

  test("Android sin nivel de API conocido: también se muestra (se trata como 11+)", () => {
    renderStep({ step: "background", index: 2, platform: "android", apiLevel: null, background: "granted" });
    expectDisclosureRightAbove("Ir a Ajustes");
  });

  test("iOS: sin divulgación (la explica el diálogo del sistema) y con el cuerpo nuevo", () => {
    renderStep({ step: "background", index: 2, platform: "ios", apiLevel: null, background: "denied" });
    expect(screen.queryByTestId("permission-bg-disclosure")).toBeNull();
    expect(screen.queryByText(DISCLOSURE_ES)).toBeNull();
    expect(screen.getByText(BODY_ES)).toBeTruthy();
  });

  test("fuera de la tarjeta de segundo plano no aparece", () => {
    const view = renderStep({ step: "fine", platform: "android", apiLevel: 29 });
    expect(screen.queryByText(DISCLOSURE_ES)).toBeNull();
    view.rerender(
      <PermissionsStep
        step="notifications"
        index={3}
        total={3}
        foreground="granted"
        accuracy="fine"
        background="denied"
        notifications="denied"
        battery="unknown"
        platform="android"
        apiLevel={29}
        busy={false}
        reminderLabel="7:00 AM"
        {...handlers}
      />,
    );
    expect(screen.queryByText(DISCLOSURE_ES)).toBeNull();
  });
});
