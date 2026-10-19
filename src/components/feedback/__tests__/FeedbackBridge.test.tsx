/** FeedbackBridge — diálogos con ModalShell (nunca Alert.alert), cola y deduplicación. */
import React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { ToastProvider } from "../../../context/ToastContext";
import { Store } from "../../../core/store";
import { FeedbackService } from "../../../services/application/FeedbackService";
import { t } from "../../../i18n";
import { BlockingModals } from "../blockingModals";
import { FeedbackBridge } from "../FeedbackBridge";

const mount = () =>
  render(
    <ToastProvider>
      <FeedbackBridge />
    </ToastProvider>,
  );

afterEach(() => BlockingModals.__reset());

describe("FeedbackBridge", () => {
  test("un aviso kind=dialog se pinta con ModalShell y no llama a Alert.alert", async () => {
    const alertSpy = jest.spyOn(Alert, "alert");
    mount();
    await act(async () => {
      FeedbackService.emit("DAY_AUTO_CLOSED");
    });
    expect(alertSpy).not.toHaveBeenCalled();
    expect(screen.getByText("Jornada cerrada automáticamente")).toBeTruthy();
    // Descartable: tiene X.
    expect(screen.getByLabelText(t("a11y.closeModal"))).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText(t("common.ok")));
    });
    expect(screen.queryByText("Jornada cerrada automáticamente")).toBeNull();
    expect(Store.getState().feedback.pending).toHaveLength(0);
  });

  test("integridad/permiso: diálogo NO descartable (sin X, atrás no cierra)", async () => {
    mount();
    await act(async () => {
      FeedbackService.emit("PERMISSION_REVOKED");
    });
    expect(screen.getByText("Permiso necesario")).toBeTruthy();
    expect(screen.queryByLabelText(t("a11y.closeModal"))).toBeNull();
    await act(async () => {
      fireEvent(screen.getByTestId("feedback-dialog"), "requestClose");
    });
    expect(screen.getByText("Permiso necesario")).toBeTruthy();
    expect(Store.getState().feedback.pending).toHaveLength(1);
  });

  test("dos diálogos se muestran de uno en uno", async () => {
    mount();
    await act(async () => {
      FeedbackService.emit("OS_KILL_RECOVERED");
      FeedbackService.emit("DAY_AUTO_CLOSED");
    });
    expect(screen.getByText("Sesión recuperada")).toBeTruthy();
    expect(screen.queryByText("Jornada cerrada automáticamente")).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByText(t("common.ok")));
    });
    expect(screen.getByText("Jornada cerrada automáticamente")).toBeTruthy();
  });

  test("no abre un diálogo encima de un modal bloqueante (ExitDetectionModal): espera a que se cierre", async () => {
    mount();
    act(() => BlockingModals.show("exit"));
    await act(async () => {
      FeedbackService.emit("OS_KILL_RECOVERED");
    });
    expect(screen.queryByText("Sesión recuperada")).toBeNull();
    act(() => BlockingModals.hide("exit"));
    expect(screen.getByText("Sesión recuperada")).toBeTruthy();
  });

  test("llegada y check-in automático usan el símbolo D; otro éxito no", async () => {
    mount();
    await act(async () => {
      FeedbackService.emit("AUTO_CHECKIN");
    });
    expect(screen.getByTestId("toast-arrival-mark", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText("Llegaste al sitio")).toBeTruthy();
    await act(async () => {
      FeedbackService.emit("ARRIVAL_CONFIRMED");
    });
    expect(screen.getByText("Llegada confirmada")).toBeTruthy();
    expect(screen.getByTestId("toast-arrival-mark", { includeHiddenElements: true })).toBeTruthy();
    await act(async () => {
      FeedbackService.emit("DAY_STARTED");
    });
    expect(screen.getByText("Jornada iniciada")).toBeTruthy();
    expect(screen.queryByTestId("toast-arrival-mark")).toBeNull();
  });

  test("EXIT_DETECTED nunca es un segundo diálogo (lo decide ExitDetectionModal)", async () => {
    const alertSpy = jest.spyOn(Alert, "alert");
    mount();
    await act(async () => {
      FeedbackService.emit("EXIT_DETECTED", {}, { kind: "dialog" });
    });
    expect(alertSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId("feedback-dialog")).toBeNull();
    expect(Store.getState().feedback.pending).toHaveLength(0);
  });
});
