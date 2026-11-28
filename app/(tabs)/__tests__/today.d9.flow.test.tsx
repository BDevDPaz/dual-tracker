/**
 * Solicitud 8 · D9 (H-7): en TRASLADO, el secundario de Hoy es «Terminar
 * jornada» (CLOSE_DAY) y cierra y paga el tramo como closeRecord. «Cancelar
 * traslado» está en su modal, abierto con el enlace de Hoy, y devuelve la
 * jornada a ACTIVA.
 */
import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { ToastProvider } from "../../../src/context/ToastContext";
import { getSessionStateUI } from "../../../src/core/selectors";
import { t } from "../../../src/i18n";
import { PersistenceService } from "../../../src/services/persistence/PersistenceService";
import { HOUR, MIN } from "../../../test/fixtures/session.fixture";
import { mustDispatch, seedWorld, startAndArrive } from "../../../test/helpers";
import { time } from "../../../test/time";
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

async function startTransfer() {
  const { siteA, siteB } = await seedWorld();
  const session = await startAndArrive(siteA);
  time.travel(2 * HOUR);
  await mustDispatch({ type: "TRANSFER_START", toSiteId: siteB });
  time.travel(30 * MIN);
  return { session, siteA, siteB };
}

describe("D9 · tabla de Hoy en TRASLADO", () => {
  test("el secundario es terminar jornada (CLOSE_DAY), no cancelar traslado", () => {
    const ui = getSessionStateUI("TRASLADO");
    expect(ui.primary).toMatchObject({ labelKey: "cta.confirmArrival", action: "CONFIRM_ARRIVAL" });
    expect(ui.secondary).toMatchObject({ labelKey: "cta.closeDay", action: "CLOSE_DAY" });
  });

  test("en ACTIVA el secundario sigue siendo la pausa, no el cierre", () => {
    const ui = getSessionStateUI("ACTIVA");
    expect(ui.primary).toMatchObject({ labelKey: "cta.closeDay", action: "OPEN_LUNCH_CLOSE" });
    expect(ui.secondary).toMatchObject({ labelKey: "cta.startLunch", action: "OPEN_PAUSE" });
  });
});

describe("D9 · Hoy en TRASLADO", () => {
  test("el secundario «Terminar jornada» cierra y paga el tramo, sin preguntar más", async () => {
    const { session } = await startTransfer();
    renderToday();

    expect(await screen.findByText(t("states.TRASLADO.label"))).toBeTruthy();
    expect(screen.getByTestId("today-cancel-transfer")).toBeTruthy();
    expect(screen.queryByTestId("cancel-transfer")).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByTestId("hero-secondary"));
    });
    await waitFor(async () => expect((await PersistenceService.getSession(session.id))?.domainStatus).toBe("CERRADA"));

    const stored = (await PersistenceService.getSession(session.id))!;
    const openish = stored.transitSegments.filter((seg) => seg.endAtMs == null);
    expect(openish).toHaveLength(0);
    const last = stored.transitSegments.at(-1)!;
    expect(last.cancelled).toBe(false);
    expect(last.paid).toBe(true);
    expect(last.endAtMs).toBe(time.now());
    expect(screen.queryByTestId("lunch-options")).toBeNull();
  });

  test("«Cancelar traslado» está en su modal, funciona y no cierra la jornada", async () => {
    const { session } = await startTransfer();
    renderToday();

    fireEvent.press(await screen.findByTestId("today-cancel-transfer"));
    expect(await screen.findByTestId("cancel-transfer")).toBeTruthy();
    expect(screen.getByText(t("modals.cancelTransferBody"))).toBeTruthy();

    const confirm = within(screen.getByTestId("cancel-transfer-card")).getAllByText(t("cta.cancelTransfer")).at(-1)!;
    await act(async () => {
      fireEvent.press(confirm);
    });
    await waitFor(async () => expect((await PersistenceService.getSession(session.id))?.domainStatus).toBe("ACTIVA"));

    const stored = (await PersistenceService.getSession(session.id))!;
    expect(stored.domainStatus).toBe("ACTIVA");
    const last = stored.transitSegments.at(-1)!;
    expect(last.cancelled).toBe(true);
    expect(last.paid).toBe(true);
    expect(last.endAtMs).toBe(time.now());
    await waitFor(() => expect(screen.queryByTestId("cancel-transfer")).toBeNull());
  });

  test("Cancelar en el aviso no cancela el traslado ni cierra la jornada", async () => {
    const { session } = await startTransfer();
    renderToday();

    fireEvent.press(await screen.findByTestId("today-cancel-transfer"));
    expect(await screen.findByTestId("cancel-transfer")).toBeTruthy();
    fireEvent.press(screen.getByText(t("common.cancel")));
    await waitFor(() => expect(screen.queryByTestId("cancel-transfer")).toBeNull());

    const stored = (await PersistenceService.getSession(session.id))!;
    expect(stored.domainStatus).toBe("TRASLADO");
    expect(stored.transitSegments.at(-1)!.endAtMs).toBeNull();
  });

  test("«Ya llegué» sigue cerrando el tramo y deja la jornada activa", async () => {
    const { session } = await startTransfer();
    renderToday();

    await act(async () => {
      fireEvent.press(await screen.findByText(t("cta.confirmArrival")));
    });
    await waitFor(async () => expect((await PersistenceService.getSession(session.id))?.domainStatus).toBe("ACTIVA"));
    const last = (await PersistenceService.getSession(session.id))!.transitSegments.at(-1)!;
    expect(last.cancelled).toBe(false);
    expect(last.endAtMs).toBe(time.now());
  });
});
