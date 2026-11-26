/**
 * INTENDED REPO PATH:
 *   src/components/modals/__tests__/DailySetupModal.test.tsx
 *
 * Reemplaza el archivo actual en esa ruta (los 2 tests que ya existen
 * se conservan tal cual al final). No es un archivo nuevo.
 *
 * Bug "sin destino" — Dual Tracker, main en 9198eb1, PR #59.
 * Pruebas UI del modal con @testing-library/react-native, sin APK.
 *
 * Lo que verifica lo nuevo (3 tests):
 *  1. Alta rápida devuelve un sitio sin coordenadas: el modal confirma
 *     con ese siteId y no muestra ni error ni aviso. Hoy pasa, y
 *     documenta el silencio en la UI.
 *  2. Elegir de la lista un sitio existente sin coordenadas: mismo
 *     resultado. El picker tampoco avisa.
 *  3. Alta rápida devuelve un sitio con coordenadas (control): también
 *     confirma sin aviso. La UI hoy no distingue los dos casos.
 *
 * Lo que NO verifica: el aviso `sites.coordsMissing`
 * ("Sin coordenadas: la geocerca no podrá iniciarse") no existe en el
 * modal hoy, solo en app/sites/new.tsx. Un test que lo exigiera
 * fallaría hasta que se exponga `geocoded` / `geofenceReady` hasta
 * el modal, que hoy routeIntent pierde.
 *
 * Cómo correrlo (en el repo, sin APK):
 *   npm test -- DailySetupModal
 *   npm run typecheck
 */
import React from "react";
import { TextInput } from "react-native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { t } from "../../../i18n";
import type { Site } from "../../../core/contracts";
import { DailySetupModal } from "../DailySetupModal";

function makeSite(overrides: Partial<Site> = {}): Site {
  return {
    id: 7,
    alias: "Obra Manual",
    address: "Calle 1, Los Angeles, CA",
    clientName: null,
    notes: null,
    targetLat: null,
    targetLon: null,
    radiusM: 100,
    active: true,
    createdAtMs: 0,
    archivedAtMs: null,
    ...overrides,
  };
}

describe("DailySetupModal", () => {
  test("alta rápida devuelve un sitio sin coordenadas: confirma sin error ni aviso", async () => {
    const site = makeSite();
    const onConfirm = jest.fn();
    const onQuickCreate = jest.fn().mockResolvedValue(site);
    render(
      <DailySetupModal visible mode="start" sites={[]} onCancel={jest.fn()} onConfirm={onConfirm} onQuickCreate={onQuickCreate} />,
    );
    fireEvent.changeText(screen.UNSAFE_getAllByType(TextInput)[0], "Calle 1, Los Angeles, CA");
    fireEvent.press(screen.getByRole("button", { name: t("modals.activateGeofence") }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(7));
    expect(onQuickCreate).toHaveBeenCalledTimes(1);
    expect(onQuickCreate).toHaveBeenCalledWith({
      alias: "Calle 1, Los Angeles, CA",
      address: "Calle 1, Los Angeles, CA",
      clientName: null,
    });
    expect(screen.queryByText(t("modals.quickCreateFailed"))).toBeNull();
    // Hoy el modal no avisa que el destino quedó sin coordenadas.
    expect(screen.queryByText(t("sites.coordsMissing"))).toBeNull();
  });

  test("elegir de la lista un sitio sin coordenadas confirma sin aviso", async () => {
    const site = makeSite();
    const onConfirm = jest.fn();
    render(
      <DailySetupModal visible mode="start" sites={[site]} onCancel={jest.fn()} onConfirm={onConfirm} onQuickCreate={jest.fn()} />,
    );
    // Con sitios existentes el modal abre en el picker, no en el alta rápida.
    fireEvent.press(screen.getByRole("radio", { name: "Obra Manual" }));
    fireEvent.press(screen.getByRole("button", { name: t("modals.activateGeofence") }));
    expect(onConfirm).toHaveBeenCalledWith(7);
    expect(screen.queryByText(t("sites.coordsMissing"))).toBeNull();
  });

  test("alta rápida devuelve un sitio con coordenadas: confirma igual, sin aviso (control)", async () => {
    const site = makeSite({ targetLat: 34.05, targetLon: -118.24 });
    const onConfirm = jest.fn();
    const onQuickCreate = jest.fn().mockResolvedValue(site);
    render(
      <DailySetupModal visible mode="start" sites={[]} onCancel={jest.fn()} onConfirm={onConfirm} onQuickCreate={onQuickCreate} />,
    );
    fireEvent.changeText(screen.UNSAFE_getAllByType(TextInput)[0], "Calle 1, Los Angeles, CA");
    fireEvent.press(screen.getByRole("button", { name: t("modals.activateGeofence") }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(7));
    expect(screen.queryByText(t("modals.quickCreateFailed"))).toBeNull();
    expect(screen.queryByText(t("sites.coordsMissing"))).toBeNull();
  });

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
