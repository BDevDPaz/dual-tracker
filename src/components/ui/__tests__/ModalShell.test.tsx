/** Componentes — ModalShell: dismissible, X solo cuando procede, etiqueta i18n. */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { setLanguage, t } from "../../../i18n";
import { BlockingModals } from "../../feedback/blockingModals";
import { ModalShell } from "../ModalShell";

afterEach(() => {
  setLanguage("es");
  BlockingModals.__reset();
});

describe("ModalShell", () => {
  test("por defecto es descartable: X (etiqueta i18n), fondo y onRequestClose cierran", () => {
    const onClose = jest.fn();
    render(<ModalShell visible title="Hola" onClose={onClose} testID="m" />);
    fireEvent.press(screen.getByLabelText(t("a11y.closeModal")));
    fireEvent.press(screen.getByTestId("m-backdrop", { includeHiddenElements: true }));
    fireEvent(screen.getByTestId("m"), "requestClose");
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(BlockingModals.count()).toBe(0);
  });

  test("dismissible={false}: sin X, sin fondo pulsable, atrás no cierra y registra el bloqueo", () => {
    const onClose = jest.fn();
    const onOk = jest.fn();
    const { rerender } = render(
      <ModalShell visible dismissible={false} title="Salida" onClose={onClose} testID="m" primaryAction={{ label: "Decidir", onPress: onOk }} />,
    );
    expect(screen.queryByLabelText(t("a11y.closeModal"))).toBeNull();
    expect(screen.queryByTestId("m-backdrop", { includeHiddenElements: true })).toBeNull();
    fireEvent(screen.getByTestId("m"), "requestClose");
    expect(onClose).not.toHaveBeenCalled();
    expect(BlockingModals.count()).toBe(1);
    fireEvent.press(screen.getByText("Decidir"));
    expect(onOk).toHaveBeenCalledTimes(1);
    rerender(<ModalShell visible={false} dismissible={false} title="Salida" onClose={onClose} testID="m" />);
    expect(BlockingModals.count()).toBe(0);
  });

  test("showCloseButton={false} oculta la X pero sigue siendo descartable", () => {
    const onClose = jest.fn();
    render(<ModalShell visible showCloseButton={false} title="Editar" onClose={onClose} testID="m" />);
    expect(screen.queryByLabelText(t("a11y.closeModal"))).toBeNull();
    fireEvent.press(screen.getByTestId("m-backdrop", { includeHiddenElements: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("la etiqueta de la X sigue el idioma activo", () => {
    setLanguage("en");
    render(<ModalShell visible title="Hi" onClose={() => undefined} />);
    expect(screen.getByLabelText("Close")).toBeTruthy();
  });
});
