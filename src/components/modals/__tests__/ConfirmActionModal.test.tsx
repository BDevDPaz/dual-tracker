/** ConfirmActionModal — el mismo patrón que DeleteSessionModal. */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { t } from "../../../i18n";
import { ConfirmActionModal } from "../ConfirmActionModal";

describe("ConfirmActionModal", () => {
  test("cancelar no confirma y confirmar llama a la acción", () => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    render(
      <ConfirmActionModal
        visible
        title={t("sites.archiveTitle")}
        description={t("sites.archiveBody")}
        confirmLabel={t("sites.archive")}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByText(t("sites.archiveBody"))).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: t("common.cancel") }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole("button", { name: t("sites.archive") }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test("mientras está ocupado el botón de confirmar no se pulsa", () => {
    const onConfirm = jest.fn();
    render(
      <ConfirmActionModal
        visible
        title={t("conflict.splitTitle")}
        description={t("conflict.splitBody")}
        confirmLabel={t("conflict.split")}
        tone="warning"
        busy
        onCancel={jest.fn()}
        onConfirm={onConfirm}
      />,
    );
    const confirm = screen.getAllByRole("button").find((button) => button.props.accessibilityState?.busy === true);
    expect(confirm?.props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    fireEvent.press(confirm!);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test("el criterio legal usa el mismo diálogo, con su propio texto", () => {
    render(
      <ConfirmActionModal
        visible
        title={t("settings.legalFlagTitle")}
        description={t("settings.legalFlagBody")}
        confirmLabel={t("common.confirm")}
        tone="warning"
        onCancel={jest.fn()}
        onConfirm={jest.fn()}
      />,
    );
    expect(screen.getByText(t("settings.legalFlagTitle"))).toBeTruthy();
    expect(screen.getByText(t("settings.legalFlagBody"))).toBeTruthy();
    expect(t("settings.legalFlagTitle", {}, "en")).not.toBe("settings.legalFlagTitle");
    expect(t("conflict.splitBody", {}, "en")).not.toBe("conflict.splitBody");
    expect(t("sites.archiveBody", {}, "en")).not.toBe("sites.archiveBody");
  });
});
