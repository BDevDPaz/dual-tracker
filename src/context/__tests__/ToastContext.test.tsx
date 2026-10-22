/** ToastContext: inset superior, título + leyenda, región viva, cola bajo modal bloqueante. */
import React, { useEffect } from "react";
import { AccessibilityInfo, StyleSheet } from "react-native";
import { act, render, screen } from "@testing-library/react-native";
import { DURATIONS } from "../../constants/animations";
import { setLanguage } from "../../i18n";
import { ToastProvider, useToast, TOAST_TOP_GAP, type ToastType } from "../ToastContext";
import { BlockingModals } from "../../components/feedback/blockingModals";
import { __setInsets } from "../../../test/mocks/react-native-safe-area-context";

let api: ReturnType<typeof useToast>;
function Grab() {
  const ctx = useToast();
  useEffect(() => {
    api = ctx;
  });
  return null;
}
const mount = () =>
  render(
    <ToastProvider>
      <Grab />
    </ToastProvider>,
  );
const show = (title: string, type?: ToastType, caption?: string, live?: (lang: "es" | "en") => { title: string; caption?: string }) =>
  act(() => api.showToast(title, type, caption, live));

describe("ToastContext", () => {
  test("top = inset seguro + 8; título y leyenda en nodos separados; polite + alert", () => {
    __setInsets({ top: 47 });
    mount();
    show("Jornada iniciada", "success", "Geocerca activa");
    expect(StyleSheet.flatten(screen.getByTestId("toast").props.style).top).toBe(47 + TOAST_TOP_GAP);
    expect(screen.getByTestId("toast-title").props.children).toBe("Jornada iniciada");
    expect(screen.getByTestId("toast-caption").props.children).toBe("Geocerca activa");
    const card = screen.getByRole("alert");
    expect(card.props.accessibilityLiveRegion).toBe("polite");
  });

  test("sin leyenda solo hay título", () => {
    mount();
    show("Hola");
    expect(screen.queryByTestId("toast-caption")).toBeNull();
    expect(screen.queryByTestId("toast-arrival-mark")).toBeNull();
  });

  test("llegada confirmada muestra el símbolo D", () => {
    mount();
    act(() => api.showToast("Llegada confirmada", "success", "Tu jornada está activa.", undefined, "arrival"));
    expect(screen.getByTestId("toast-arrival-mark", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId("toast-title").props.children).toBe("Llegada confirmada");
  });

  test("con un modal bloqueante visible se retiene y aparece al cerrarse", () => {
    mount();
    act(() => BlockingModals.show("exit"));
    show("Aviso retenido", "warning");
    expect(screen.queryByTestId("toast")).toBeNull();
    act(() => BlockingModals.hide("exit"));
    expect(screen.getByTestId("toast-title").props.children).toBe("Aviso retenido");
  });

  test("un aviso visible se reescribe al cambiar el idioma", () => {
    mount();
    show("Jornada iniciada", "success", "Geocerca activa", (lang) => ({
      title: lang === "en" ? "Shift started" : "Jornada iniciada",
      caption: lang === "en" ? "Geofence on" : "Geocerca activa",
    }));
    expect(screen.getByTestId("toast-title").props.children).toBe("Jornada iniciada");
    act(() => setLanguage("en"));
    expect(screen.getByTestId("toast-title").props.children).toBe("Shift started");
    expect(screen.getByTestId("toast-caption").props.children).toBe("Geofence on");
    act(() => setLanguage("es"));
  });

  test("con lector de pantalla el aviso no se cierra solo", async () => {
    const reader = jest.spyOn(AccessibilityInfo, "isScreenReaderEnabled").mockResolvedValue(true);
    const listen = jest.spyOn(AccessibilityInfo, "addEventListener").mockReturnValue({ remove: () => undefined } as never);
    jest.useFakeTimers();
    try {
      mount();
      await act(async () => {
        await Promise.resolve();
      });
      show("Léeme");
      act(() => {
        jest.advanceTimersByTime(DURATIONS.toast + 500);
      });
      expect(screen.getByTestId("toast-title").props.children).toBe("Léeme");
    } finally {
      jest.useRealTimers();
      reader.mockRestore();
      listen.mockRestore();
    }
  });
});
