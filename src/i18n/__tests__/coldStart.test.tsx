/** El primer fotograma usa el idioma guardado, no el español de carga del módulo. */
import React, { useEffect, useState } from "react";
import { Text } from "react-native";
import { render, screen, waitFor } from "@testing-library/react-native";
import { setLanguage, t, useLanguage } from "..";
import { applyPersistedLanguage } from "../../core/boot";
import { SettingsService } from "../../services/persistence/SettingsService";

function Gate() {
  useLanguage();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    void applyPersistedLanguage().then(() => {
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);
  if (!ready) return <Text testID="hold">…</Text>;
  return <Text testID="tab">{t("tabs.today")}</Text>;
}

describe("arranque en frío", () => {
  test("con perfil en inglés no se pinta Hoy antes de Today", async () => {
    setLanguage("es");
    const loaded = await SettingsService.load();
    await SettingsService.saveProfile({ ...loaded.profile, language: "en" });

    render(<Gate />);
    expect(screen.getByTestId("hold")).toBeTruthy();
    expect(screen.queryByText("Hoy")).toBeNull();
    expect(screen.queryByText("Today")).toBeNull();

    await waitFor(() => expect(screen.getByTestId("tab").props.children).toBe("Today"));
    expect(screen.queryByText("Hoy")).toBeNull();
  });

  test("sin perfil se queda en el idioma de arranque (es en test)", async () => {
    setLanguage("en");
    render(<Gate />);
    await waitFor(() => expect(screen.getByTestId("tab").props.children).toBe(t("tabs.today")));
    expect(screen.getByTestId("tab").props.children).toBe("Hoy");
  });
});
