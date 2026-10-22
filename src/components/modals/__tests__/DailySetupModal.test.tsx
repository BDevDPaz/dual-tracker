/** Alta rápida: null o un throw se explican y no confirman el destino. */
import React from "react";
import { TextInput } from "react-native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { t } from "../../../i18n";
import { DailySetupModal } from "../DailySetupModal";

describe("DailySetupModal", () => {
  test("si el alta rápida devuelve null, se muestra el error y no se confirma", async () => {
    const onConfirm = jest.fn();
    const onQuickCreate = jest.fn().mockResolvedValue(null);
    render(
      <DailySetupModal visible mode="start" sites={[]} onCancel={jest.fn()} onConfirm={onConfirm} onQuickCreate={onQuickCreate} />,
    );
    fireEvent.changeText(screen.UNSAFE_getAllByType(TextInput)[0], "Calle 1");
    fireEvent.press(screen.getByRole("button", { name: t("modals.activateGeofence") }));
    await waitFor(() => expect(screen.getByText(t("modals.quickCreateFailed"))).toBeTruthy());
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onQuickCreate).toHaveBeenCalledTimes(1);
  });

  test("un segundo toque mientras crea no lanza otra alta", async () => {
    let release: (site: { id: number }) => void = () => undefined;
    const onQuickCreate = jest.fn(
      () =>
        new Promise<{ id: number }>((resolve) => {
          release = resolve;
        }),
    );
    render(
      <DailySetupModal
        visible
        mode="start"
        sites={[]}
        onCancel={jest.fn()}
        onConfirm={jest.fn()}
        onQuickCreate={onQuickCreate as never}
      />,
    );
    fireEvent.changeText(screen.UNSAFE_getAllByType(TextInput)[0], "Calle 1");
    fireEvent.press(screen.getByRole("button", { name: t("modals.activateGeofence") }));
    const spinning = screen.getAllByRole("button").find((button) => button.props.accessibilityState?.busy === true);
    fireEvent.press(spinning!);
    expect(onQuickCreate).toHaveBeenCalledTimes(1);
    release({ id: 4 });
    await waitFor(() => expect(onQuickCreate).toHaveBeenCalledTimes(1));
  });
});
