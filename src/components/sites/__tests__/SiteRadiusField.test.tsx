/** El campo de radio usa teclado numérico y explica el valor inválido. */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { t } from "../../../i18n";
import { SiteRadiusField } from "../SiteRadiusField";

describe("SiteRadiusField", () => {
  test("un valor no numérico o ≤ 0 muestra el error y el teclado es numérico", () => {
    const onChangeText = jest.fn();
    const view = render(<SiteRadiusField testID="radius" value="abc" onChangeText={onChangeText} />);
    expect(screen.getByTestId("radius").props.keyboardType).toBe("numeric");
    expect(screen.getByText(t("sites.radiusInvalid"))).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("radius"), "0");
    expect(onChangeText).toHaveBeenCalledWith("0");

    view.rerender(<SiteRadiusField testID="radius" value="0" onChangeText={onChangeText} />);
    expect(screen.getByText(t("sites.radiusInvalid"))).toBeTruthy();

    view.rerender(<SiteRadiusField testID="radius" value="120" onChangeText={onChangeText} />);
    expect(screen.queryByText(t("sites.radiusInvalid"))).toBeNull();
  });

  test("el aviso también está en inglés", () => {
    expect(t("sites.radiusInvalid", {}, "en")).toBe("Radius has to be a number greater than 0.");
  });
});
