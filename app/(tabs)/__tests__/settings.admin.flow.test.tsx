/**
 * Ajustes · zona de administración en pantalla (wireframes de Ajustes §10):
 *  - TP-2: validación en línea con los rangos del repositorio y correo; la
 *    espera de llegada fuera de 0-30 se marca, no se recorta.
 *  - TP-3: cambiar una bandera legal guarda solo esa bandera.
 *  - TP-4: si la zona se cierra (10 min) con cambios de admin sin guardar,
 *    Guardar no anuncia éxito y el borrador sigue ahí.
 */
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ToastProvider } from "../../../src/context/ToastContext";
import { BUSY_HOLD_MS } from "../../../src/core/hooks/useBusyAction";
import { Store, StoreActions } from "../../../src/core/store";
import { t } from "../../../src/i18n";
import { PersistenceService } from "../../../src/services/persistence/PersistenceService";
import { SettingsService } from "../../../src/services/persistence/SettingsService";
import { SecurityService } from "../../../src/services/runtime/SecurityService";
import { time } from "../../../test/time";
import SettingsScreen from "../settings";

const MIN = 60_000;

jest.mock("expo-router", () => {
  const ReactNs = require("react") as typeof import("react");
  function Stack() {
    return null;
  }
  Stack.Screen = function Screen() {
    return null;
  };
  return {
    Stack,
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
    useLocalSearchParams: () => ({}),
    useNavigation: () => ({ setOptions: jest.fn(), addListener: () => () => undefined }),
    useFocusEffect: (cb: () => void | (() => void)) => {
      ReactNs.useEffect(() => {
        const clean = cb();
        return typeof clean === "function" ? clean : undefined;
      }, [cb]);
    },
  };
});

async function hydrate(): Promise<void> {
  const snapshot = await PersistenceService.loadSnapshot();
  StoreActions.hydrated({
    sessions: snapshot.sessions,
    sites: snapshot.sites,
    packs: snapshot.packs,
    sharedPackIds: [],
    settings: await SettingsService.load(),
    osKillDetected: false,
    hasPin: true,
    pinOrigin: "LOCAL",
    nowMs: time.now(),
  });
}

async function openAdmin(): Promise<void> {
  await PersistenceService.init();
  expect((await SecurityService.setPin("123456")).ok).toBe(true);
  await hydrate();
  expect((await SecurityService.unlock("123456")).ok).toBe(true);
}

function renderScreen() {
  return render(
    <ToastProvider>
      <SettingsScreen />
    </ToastProvider>,
  );
}

const field = (label: string) => screen.getByLabelText(label);
const saveButton = () => screen.getByText(t("common.save"));

describe("Ajustes · zona de administración", () => {
  test("TP-2: cada campo marca su error con los rangos del servidor y la espera no se recorta", async () => {
    await openAdmin();
    renderScreen();
    expect(await screen.findByLabelText(t("settings.arrivalDwell"))).toBeTruthy();

    fireEvent.changeText(field(t("settings.overtimeMultiplier")), "0,5");
    expect(screen.getByText(t("settings.validation.multiplierRange"))).toBeTruthy();
    fireEvent.changeText(field(t("settings.overtimeMultiplier")), "11");
    expect(screen.getByText(t("settings.validation.multiplierRange"))).toBeTruthy();
    fireEvent.changeText(field(t("settings.overtimeMultiplier")), "2");
    expect(screen.queryByText(t("settings.validation.multiplierRange"))).toBeNull();

    fireEvent.changeText(field(t("settings.retention")), "1.5");
    expect(screen.getByText(t("settings.validation.retentionRange"))).toBeTruthy();
    fireEvent.changeText(field(t("settings.retention")), "3651");
    expect(screen.getByText(t("settings.validation.retentionRange"))).toBeTruthy();
    fireEvent.changeText(field(t("settings.retention")), "30");

    fireEvent.changeText(field(t("settings.defaultRadius")), "20000");
    expect(screen.getByText(t("settings.validation.radiusRange"))).toBeTruthy();
    fireEvent.changeText(field(t("settings.defaultRadius")), "150");

    fireEvent.changeText(field(t("settings.companyEmail")), "rrhh-empresa");
    expect(screen.getByText(t("settings.validation.email"))).toBeTruthy();
    fireEvent.changeText(field(t("settings.companyEmail")), "rrhh@empresa.test");
    expect(screen.queryByText(t("settings.validation.email"))).toBeNull();

    // 45 min no se convierte en 30 al guardar: se marca y Guardar no envía nada.
    fireEvent.changeText(field(t("settings.arrivalDwell")), "45");
    expect(screen.getByText(t("settings.validation.dwellRange"))).toBeTruthy();
    expect(saveButton()).toBeTruthy();
    await act(async () => {
      fireEvent.press(saveButton());
    });
    expect((await SettingsService.load()).company.arrivalDwellMs ?? 0).toBe(0);

    fireEvent.changeText(field(t("settings.arrivalDwell")), "5");
    expect(screen.queryByText(t("settings.validation.dwellRange"))).toBeNull();
    await act(async () => {
      fireEvent.press(saveButton());
    });
    await waitFor(async () => expect((await SettingsService.load()).company.arrivalDwellMs).toBe(5 * MIN));
    const saved = await SettingsService.load();
    expect(saved.company).toMatchObject({ overtimeMultiplier: 2, traceRetentionDays: 30, defaultRadiusM: 150, companyEmail: "rrhh@empresa.test" });
  });

  test("TP-3: cambiar una bandera legal guarda solo esa bandera", async () => {
    await openAdmin();
    renderScreen();
    const on = await screen.findAllByText(t("settings.calendar.flagOn"));
    // [0] = caDoubleTime, [1] = caSeventhDay.
    fireEvent.press(on[0]);
    expect(screen.getByText(t("settings.legalFlagBody"))).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText(t("common.confirm")));
    });
    await waitFor(async () => expect((await SettingsService.load()).company.payrollLegalFlags).toEqual({ caDoubleTime: true }));
    const entry = (await PersistenceService.listLedger({ intent: "PAYROLL_POLICY_CHANGED" })).at(-1);
    expect(JSON.parse(entry!.payloadJson).data).toMatchObject({ changes: { payrollLegalFlags: { from: { caDoubleTime: false }, to: { caDoubleTime: true } } } });
  });

  test("TP-4: la zona se cierra con cambios de admin sin guardar → no hay «Ajustes guardados» y el borrador sigue", async () => {
    await openAdmin();
    renderScreen();
    fireEvent.changeText(await screen.findByLabelText(t("settings.employerName")), "Leon's Electrical");
    // Pasan 11 min: la zona (10 min) se cierra.
    time.travel(11 * MIN);
    // isUnlocked() caducado cierra la zona en el store (como el reloj de la pantalla).
    act(() => {
      expect(SecurityService.isUnlocked()).toBe(false);
    });
    await act(async () => {
      fireEvent.press(saveButton());
    });
    expect(await screen.findByTestId("settings-admin-unsaved")).toBeTruthy();
    const pending = Store.getState().feedback.pending;
    expect(pending.map((f) => f.code)).not.toContain("SETTINGS_SAVED");
    expect(JSON.stringify(pending)).toContain("ADMIN_CHANGES_UNSAVED");
    expect((await SettingsService.load()).company.employerName).toBe("");

    // Al volver a abrir la zona, el borrador sigue ahí y se guarda.
    await act(async () => {
      expect((await SecurityService.unlock("123456")).ok).toBe(true);
    });
    expect(await screen.findByDisplayValue("Leon's Electrical")).toBeTruthy();
    // El anti-doble toque (BUSY_HOLD_MS) suelta el botón.
    await act(async () => {
      await new Promise((r) => setTimeout(r, BUSY_HOLD_MS + 50));
    });
    await act(async () => {
      fireEvent.press(saveButton());
    });
    await waitFor(async () => expect((await SettingsService.load()).company.employerName).toBe("Leon's Electrical"));
  });
});
