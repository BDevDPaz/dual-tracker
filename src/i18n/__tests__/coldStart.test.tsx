/** El primer fotograma usa el idioma guardado, no el español de carga del módulo. */
import React, { useEffect, useState } from "react";
import { Text } from "react-native";
import { render, screen, waitFor } from "@testing-library/react-native";
import { setLanguage, t, useLanguage } from "..";
import * as Notifications from "expo-notifications";
import { NOTIFICATION_ACTIONS } from "../../constants/notifications";
import { applyPersistedLanguage } from "../../core/boot";
import { SessionEngineService } from "../../services/domain/SessionEngineService";
import { PersistenceService } from "../../services/persistence/PersistenceService";
import { SettingsService } from "../../services/persistence/SettingsService";
import { NotificationService } from "../../services/runtime/NotificationService";
import { HOUR } from "../../../test/fixtures/session.fixture";
import { makeExit } from "../../../test/fixtures/spatial.fixture";
import { startAndArrive, seedWorld } from "../../../test/helpers";
import { time } from "../../../test/time";

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

  test("F03: un botón pulsado con la app cerrada se despacha al arrancar", async () => {
    const { siteA } = await seedWorld();
    const s = await startAndArrive(siteA);
    time.travel(HOUR);
    await SessionEngineService.dispatch({ type: "EXIT_DETECTED", fact: makeExit({ sessionId: s.id, timestampMs: time.now() }) }, "GEOFENCE");
    (Notifications as unknown as { __state: { lastResponse: unknown } }).__state.lastResponse = {
      actionIdentifier: NOTIFICATION_ACTIONS.END_SESSION,
      notification: { request: { identifier: `dualtracker-exit-${s.id}`, content: { data: { sessionId: s.id, kind: "EXIT_DECISION" } } } },
    };
    await NotificationService.init({
      intent: async (intent) => {
        await SessionEngineService.dispatch(intent, "NOTIFICATION");
      },
      ui: () => {},
    });
    const closed = await PersistenceService.getSession(s.id);
    expect(closed?.domainStatus).toBe("CERRADA");
    const rows = await PersistenceService.listLedger({ sessionId: s.id });
    expect(rows.some((e) => e.intent === "CLOSE_DAY" && e.actor === "USER")).toBe(true);
  });
});
