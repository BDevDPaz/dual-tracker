/** E19: Hoy muestra «Sin avisos» cuando el permiso está negado. */
import React from "react";
import { View } from "react-native";
import { render, screen } from "@testing-library/react-native";
import { t } from "../../../i18n";
import { ScreenStatusBanner } from "../ScreenStatusBanner";

function bannerFor(permission: string) {
  if (permission !== "denied" && permission !== "blocked") return null;
  return <ScreenStatusBanner status="degraded" message={t("notifications.noticesDenied")} />;
}

describe("banner Sin avisos", () => {
  test("permiso denegado o bloqueado muestra el aviso; concedido no", () => {
    const { rerender } = render(<View>{bannerFor("denied")}</View>);
    expect(screen.getByText("Sin avisos")).toBeTruthy();
    rerender(<View>{bannerFor("blocked")}</View>);
    expect(screen.getByText("Sin avisos")).toBeTruthy();
    rerender(<View>{bannerFor("granted")}</View>);
    expect(screen.queryByText("Sin avisos")).toBeNull();
  });
});
