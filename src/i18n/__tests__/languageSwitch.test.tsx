/** El cambio de idioma repinta todas las superficies montadas, no solo la que lo pidió. */
import React from "react";
import { Text, View } from "react-native";
import { act, render, screen } from "@testing-library/react-native";
import { setLanguage, t, useLanguage } from "..";

function Pane({ id, k }: { id: string; k: string }) {
  useLanguage();
  return <Text testID={id}>{t(k)}</Text>;
}

afterEach(() => setLanguage("es"));

describe("cambio de idioma", () => {
  test("varias superficies montadas pasan a EN a la vez y vuelven a ES", () => {
    render(
      <View>
        <Pane id="tab" k="tabs.today" />
        <Pane id="blocked" k="integrity.BLOCKED" />
        <Pane id="valid" k="integrity.VALID" />
        <Pane id="refresh" k="a11y.refresh" />
      </View>,
    );
    expect(screen.getByTestId("tab").props.children).toBe("Hoy");
    expect(screen.getByTestId("blocked").props.children).toBe("No certificable");
    expect(screen.getByTestId("valid").props.children).toBe("Validada");
    expect(screen.getByTestId("refresh").props.children).toBe("Actualizar");

    act(() => setLanguage("en"));
    expect(screen.getByTestId("tab").props.children).toBe("Today");
    expect(screen.getByTestId("blocked").props.children).toBe("Not certifiable");
    expect(screen.getByTestId("valid").props.children).toBe("Validated");
    expect(screen.getByTestId("refresh").props.children).toBe("Refresh");

    act(() => setLanguage("es"));
    expect(screen.getByTestId("tab").props.children).toBe("Hoy");
  });

  test("setLanguage con el mismo idioma no deja la UI a medias", () => {
    render(
      <View>
        <Pane id="tab" k="tabs.settings" />
      </View>,
    );
    act(() => setLanguage("es"));
    expect(screen.getByTestId("tab").props.children).toBe("Ajustes");
  });
});
