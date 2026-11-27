/**
 * Solicitud 7, PR 2 — pantallas y gate de H-1, H-15 y H-5, con la pila raíz
 * real (RootStack), el gate real y las pantallas reales del aviso del alta,
 * Perfil, Listo y el aviso de solo lectura. El resto son marcadores.
 */
import * as fs from "fs";
import * as path from "path";
import React from "react";
import { Text } from "react-native";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { __state as notificationState } from "../../../test/mocks/expo-notifications";
import type { OnboardingStep } from "../../core/contracts";
import { Store, StoreActions } from "../../core/store";
import { t } from "../../i18n";
import { DISCLOSURE_VERSION } from "../../i18n/legal";
import { PersistenceService } from "../../services/persistence/PersistenceService";
import { SettingsService } from "../../services/persistence/SettingsService";
import { HOUR } from "../../../test/fixtures/session.fixture";
import { seedWorld, startAndArrive } from "../../../test/helpers";
import { time } from "../../../test/time";
import OnboardingDisclosureScreen from "../../../app/(onboarding)/disclosure";
import ProfileScreen from "../../../app/(onboarding)/profile";
import LegalDisclosureScreen from "../../../app/legal/disclosure";
import { ROUTES as BASE_ROUTES } from "./gateRoutes";

const marker = (label: string) =>
  function Marker() {
    return <Text>{label}</Text>;
  };

const ROUTES = {
  ...BASE_ROUTES,
  "(onboarding)/disclosure": OnboardingDisclosureScreen,
  "(onboarding)/permissions": marker("PERMISOS"),
  "(onboarding)/profile": ProfileScreen,
  "legal/disclosure": LegalDisclosureScreen,
};

type Setup = { onboarded: boolean; accepted: boolean; step?: OnboardingStep | null; name?: string; reminder?: string };

/** Guarda en KV (como el teléfono) y vuelve a hidratar el store desde ahí. */
async function setup({ onboarded, accepted, step = null, name = "Byron", reminder = "07:00" }: Setup): Promise<void> {
  await seedWorld();
  await SettingsService.saveDevice({
    onboardingCompleted: onboarded,
    disclosureAcceptedVersion: accepted ? DISCLOSURE_VERSION : null,
    disclosureAcceptedAtMs: accepted ? time.now() : null,
    onboardingStep: step,
  });
  await SettingsService.saveProfile({ employeeName: name, hourlyRate: 20, language: "es", dailyReminderTime: reminder });
  const settings = await SettingsService.load();
  const snap = await PersistenceService.loadSnapshot();
  act(() => StoreActions.hydrated({ sessions: snap.sessions, sites: snap.sites, packs: snap.packs, settings, osKillDetected: false, hasPin: false, nowMs: time.now() }));
}

const reminderScheduled = () => notificationState.scheduled.some((n) => n.identifier === "dualtracker-daily-reminder");

describe("H-1 · el gate reanuda en el paso guardado", () => {
  test("marcador «profile»: «/» abre Perfil con el nombre y la hora guardados", async () => {
    await setup({ onboarded: false, accepted: true, step: "profile", name: "Byron", reminder: "06:30" });
    renderRouter(ROUTES, { initialUrl: "/" });
    expect(await screen.findByText(t("onboarding.profileTitle"))).toBeTruthy();
    expect(screen.getByDisplayValue("Byron")).toBeTruthy();
    expect(screen.queryByText("BIENVENIDA")).toBeNull();
  });

  test("marcador «permissions» → permisos; sin marcador → bienvenida", async () => {
    await setup({ onboarded: false, accepted: true, step: "permissions" });
    const r = renderRouter(ROUTES, { initialUrl: "/" });
    expect(await screen.findByText("PERMISOS")).toBeTruthy();
    r.unmount();
    await setup({ onboarded: false, accepted: true, step: null });
    renderRouter(ROUTES, { initialUrl: "/" });
    expect(await screen.findByText("BIENVENIDA")).toBeTruthy();
  });

  test("marcador «ready»: Listo funciona sin parámetros de ruta y completa el alta", async () => {
    await setup({ onboarded: false, accepted: true, step: "ready", name: "Byron" });
    renderRouter(ROUTES, { initialUrl: "/" });
    fireEvent.press(await screen.findByText(t("onboarding.readyStart")));
    await waitFor(() => expect(Store.getState().settings.device.onboardingCompleted).toBe(true));
    expect(await screen.findByText("HOY")).toBeTruthy();
    expect(Store.getState().settings.device.onboardingStep).toBeNull();
  });

  test("con marcador, las rutas operativas siguen bloqueadas (Stack.Protected)", async () => {
    await setup({ onboarded: false, accepted: true, step: "ready" });
    renderRouter(ROUTES, { initialUrl: "/history" });
    expect(await screen.findByText(t("onboarding.readyStart"))).toBeTruthy();
    expect(screen.queryByText("HISTORIAL")).toBeNull();
  });

  test("Perfil: Continuar guarda nombre, hora y marcador sin completar el alta ni programar el recordatorio", async () => {
    await setup({ onboarded: false, accepted: true, step: "profile", name: "", reminder: "07:00" });
    renderRouter(ROUTES, { initialUrl: "/profile" });
    fireEvent.changeText(await screen.findByDisplayValue(""), "Ana María");
    fireEvent.press(screen.getByLabelText(t("onboarding.reminderStepUp")));
    fireEvent.press(screen.getByText(t("common.continue")));
    expect(await screen.findByText(t("onboarding.readyStart"))).toBeTruthy();
    const disk = await SettingsService.load();
    expect(disk.profile.employeeName).toBe("Ana María");
    expect(disk.profile.dailyReminderTime).not.toBe("07:00");
    expect(disk.device).toMatchObject({ onboardingCompleted: false, onboardingStep: "ready" });
    expect(reminderScheduled()).toBe(false);
  });
});

describe("H-15 · el aviso ya aceptado no se vuelve a emitir", () => {
  test("versión vigente aceptada: casilla marcada y Continuar no reescribe la fecha", async () => {
    await setup({ onboarded: false, accepted: true, step: null });
    const acceptedAt = Store.getState().settings.device.disclosureAcceptedAtMs;
    time.travel(HOUR);
    renderRouter(ROUTES, { initialUrl: "/disclosure" });
    const box = await screen.findByRole("checkbox");
    expect(box.props.accessibilityState?.checked).toBe(true);
    fireEvent.press(screen.getByText(t("common.continue")));
    expect(await screen.findByText("PERMISOS")).toBeTruthy();
    const device = (await SettingsService.load()).device;
    expect(device.disclosureAcceptedAtMs).toBe(acceptedAt);
    expect(device.onboardingStep).toBe("permissions");
  });

  test("sin aceptar: casilla vacía y Continuar sí acepta (control)", async () => {
    await setup({ onboarded: false, accepted: false, step: null });
    renderRouter(ROUTES, { initialUrl: "/disclosure" });
    const box = await screen.findByRole("checkbox");
    expect(box.props.accessibilityState?.checked).toBe(false);
    fireEvent.press(box);
    fireEvent.press(screen.getByText(t("common.continue")));
    expect(await screen.findByText("PERMISOS")).toBeTruthy();
    const device = (await SettingsService.load()).device;
    expect(device.disclosureAcceptedVersion).toBe(DISCLOSURE_VERSION);
    expect(device.onboardingStep).toBe("permissions");
  });
});

describe("H-5 · retirar o repetir desde el aviso de solo lectura", () => {
  test("el texto sigue visible y retirar pide confirmación; al confirmar, el gate vuelve a pedir el alta y bloquea /history", async () => {
    await setup({ onboarded: true, accepted: true });
    const r = renderRouter(ROUTES, { initialUrl: "/legal/disclosure" });
    expect(await screen.findByTestId("consent-actions")).toBeTruthy();
    expect(screen.getAllByText(new RegExp(DISCLOSURE_VERSION)).length).toBeGreaterThan(0);
    fireEvent.press(screen.getByTestId("consent-withdraw"));
    expect(await screen.findByText(t("legal.withdrawTitle"))).toBeTruthy();
    expect(Store.getState().settings.device.disclosureAcceptedVersion).toBe(DISCLOSURE_VERSION);
    fireEvent.press(screen.getByText(t("legal.withdrawConfirm")));
    expect(await screen.findByText("BIENVENIDA")).toBeTruthy();
    expect(Store.getState().settings.device).toMatchObject({ disclosureAcceptedVersion: null, onboardingCompleted: false });
    r.unmount();
    renderRouter(ROUTES, { initialUrl: "/history" });
    expect(await screen.findByText("BIENVENIDA")).toBeTruthy();
    expect(screen.queryByText("HISTORIAL")).toBeNull();
  });

  test("cancelar la confirmación no cambia nada", async () => {
    await setup({ onboarded: true, accepted: true });
    renderRouter(ROUTES, { initialUrl: "/legal/disclosure" });
    fireEvent.press(await screen.findByTestId("consent-withdraw"));
    fireEvent.press(await screen.findByText(t("common.cancel")));
    expect(Store.getState().settings.device.disclosureAcceptedVersion).toBe(DISCLOSURE_VERSION);
  });

  test("con jornada abierta se rechaza y no se retira", async () => {
    await setup({ onboarded: true, accepted: true });
    await startAndArrive((await PersistenceService.listSites())[0]!.id);
    renderRouter(ROUTES, { initialUrl: "/legal/disclosure" });
    fireEvent.press(await screen.findByTestId("consent-withdraw"));
    fireEvent.press(await screen.findByText(t("legal.withdrawConfirm")));
    await waitFor(() => expect(Store.getState().feedback.pending.some((f) => JSON.stringify(f).includes("CONSENT_OPEN_SESSION"))).toBe(true));
    expect(Store.getState().settings.device.disclosureAcceptedVersion).toBe(DISCLOSURE_VERSION);
    expect(Store.getState().settings.device.onboardingCompleted).toBe(true);
  });

  test("repetir el alta conserva la aceptación y lleva a la bienvenida", async () => {
    await setup({ onboarded: true, accepted: true });
    const acceptedAt = Store.getState().settings.device.disclosureAcceptedAtMs;
    renderRouter(ROUTES, { initialUrl: "/legal/disclosure" });
    fireEvent.press(await screen.findByTestId("consent-repeat"));
    fireEvent.press(await screen.findByText(t("legal.repeatConfirm")));
    expect(await screen.findByText("BIENVENIDA")).toBeTruthy();
    expect(Store.getState().settings.device).toMatchObject({
      onboardingCompleted: false,
      disclosureAcceptedVersion: DISCLOSURE_VERSION,
      disclosureAcceptedAtMs: acceptedAt,
    });
  });

  test("sin aviso aceptado ni alta no se ofrecen las acciones", async () => {
    await setup({ onboarded: false, accepted: false });
    renderRouter(ROUTES, { initialUrl: "/legal/disclosure" });
    await waitFor(() => expect(screen.getAllByText(new RegExp(DISCLOSURE_VERSION)).length).toBeGreaterThan(0));
    expect(screen.queryByTestId("consent-actions")).toBeNull();
  });

  test("Ajustes: la sección legal incluye las mismas acciones", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../../app/(tabs)/settings.tsx"), "utf8");
    const legal = src.slice(src.indexOf('<Section title={t("settings.legal")}>'));
    expect(legal.slice(0, legal.indexOf("</Section>"))).toContain("<ConsentActions />");
  });
});
