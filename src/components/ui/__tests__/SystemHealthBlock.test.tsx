/** SystemHealthBlock — iconos de segundo plano y línea de impacto cuando está degradado. */
import React from "react";
import { act, render, screen } from "@testing-library/react-native";
import { ICONS } from "../../../constants/icons";
import { t } from "../../../i18n";
import { SystemHealthBlock } from "../SystemHealthBlock";
import { ReduceMotionPref } from "../motion";

const healthy = { gpsOk: true, backgroundOk: true, traceMode: "SOLO_GEOCERCA" as const, degraded: false, checked: true };

describe("SystemHealthBlock", () => {
  test("sano: sin línea de impacto; segundo plano con icono de teléfono (no luna)", () => {
    render(<SystemHealthBlock health={healthy} tracking={false} />);
    expect(screen.queryByTestId("health-impact")).toBeNull();
    expect(screen.getByTestId(`icon-Ionicons-${ICONS.domain.background}`)).toBeTruthy();
    expect(screen.queryByTestId("icon-Ionicons-moon-outline")).toBeNull();
  });

  test("degradado: una línea t('health.impactNoValid')", () => {
    render(<SystemHealthBlock health={{ ...healthy, backgroundOk: false, degraded: true }} tracking />);
    expect(screen.getByTestId("health-impact").props.children).toBe(t("health.impactNoValid"));
  });

  test("traslado ya no usa el avión", () => {
    expect(ICONS.domain.transit).not.toBe("airplane-outline");
  });

  test("pulso solo en la fila GPS al rastrear y nunca con movimiento reducido", () => {
    const { unmount } = render(<SystemHealthBlock health={healthy} tracking />);
    expect(screen.getAllByTestId("health-dot-pulsing")).toHaveLength(1);
    unmount();
    act(() => ReduceMotionPref.__set(true));
    render(<SystemHealthBlock health={healthy} tracking />);
    expect(screen.queryByTestId("health-dot-pulsing")).toBeNull();
  });
});
