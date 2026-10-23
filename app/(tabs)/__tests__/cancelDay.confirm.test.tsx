/** T02: Cancelar jornada solo emite CANCEL_DAY después de confirmar. Volver no cambia ESPERANDO. */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ToastProvider } from "../../../src/context/ToastContext";
import { t } from "../../../src/i18n";
import { PersistenceService } from "../../../src/services/persistence/PersistenceService";
import { mustDispatch, seedWorld } from "../../../test/helpers";
import TodayScreen from "../index";

jest.mock("expo-router", () => {
  const ReactNs = require("react") as typeof import("react");
  return {
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
    useFocusEffect: (cb: () => void | (() => void)) => {
      ReactNs.useEffect(() => {
        const clean = cb();
        return typeof clean === "function" ? clean : undefined;
      }, [cb]);
    },
  };
});

function renderToday() {
  return render(
    <ToastProvider>
      <TodayScreen />
    </ToastProvider>,
  );
}

describe("Hoy · cancelar jornada", () => {
  test("T02 Volver deja ESPERANDO y confirmar emite CANCEL_DAY", async () => {
    const { siteA } = await seedWorld();
    const open = await mustDispatch({ type: "START_DAY", siteId: siteA });
    renderToday();

    fireEvent.press(screen.getByText(t("cta.cancelDay")));
    expect(screen.getByText(t("today.cancelDayBody"))).toBeTruthy();
    fireEvent.press(screen.getByText(t("common.back")));
    expect((await PersistenceService.getSession(open.id))?.domainStatus).toBe("ESPERANDO");

    fireEvent.press(screen.getByText(t("cta.cancelDay")));
    fireEvent.press(screen.getByText(t("today.cancelDayConfirm")));
    await waitFor(async () => {
      expect((await PersistenceService.getSession(open.id))?.bookkeeping.cancelled).toBe(true);
    });
    expect((await PersistenceService.getSession(open.id))?.domainStatus).toBe("CERRADA");
  });
});
