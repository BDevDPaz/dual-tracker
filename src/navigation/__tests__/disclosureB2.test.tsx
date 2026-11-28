/**
 * Solicitud 7, PR 3 (B2) — pantalla del aviso con la pila raíz real, el gate
 * real, el aviso del alta real y el aviso de solo lectura real.
 * TODO(legal): el texto de B2 está pendiente de revisión por la asesoría legal.
 */
import * as fs from "fs";
import * as path from "path";
import React from "react";
import { Text } from "react-native";
import { act, fireEvent, renderRouter, screen } from "expo-router/testing-library";
import { Store, StoreActions } from "../../core/store";
import { t } from "../../i18n";
import { DISCLOSURE_VERSION, getDisclosureContent } from "../../i18n/legal";
import { PersistenceService } from "../../services/persistence/PersistenceService";
import { SettingsService } from "../../services/persistence/SettingsService";
import { seedWorld } from "../../../test/helpers";
import { time } from "../../../test/time";
import OnboardingDisclosureScreen from "../../../app/(onboarding)/disclosure";
import LegalDisclosureScreen from "../../../app/legal/disclosure";
import { ROUTES as BASE_ROUTES } from "./gateRoutes";

const ROUTES = {
  ...BASE_ROUTES,
  "(onboarding)/disclosure": OnboardingDisclosureScreen,
  "(onboarding)/permissions": () => <Text>PERMISOS</Text>,
  "legal/disclosure": LegalDisclosureScreen,
};

const OLD_VERSION = "2026-11-v3";

async function setup(acceptedVersion: string | null, onboarded = true): Promise<void> {
  await seedWorld();
  await SettingsService.saveDevice({
    onboardingCompleted: onboarded,
    disclosureAcceptedVersion: acceptedVersion,
    disclosureAcceptedAtMs: acceptedVersion ? time.now() : null,
    onboardingStep: null,
  });
  await SettingsService.saveProfile({ employeeName: "Byron", hourlyRate: 20, language: "es", dailyReminderTime: "07:00" });
  const settings = await SettingsService.load();
  const snap = await PersistenceService.loadSnapshot();
  act(() => StoreActions.hydrated({ sessions: snap.sessions, sites: snap.sites, packs: snap.packs, settings, osKillDetected: false, hasPin: false, nowMs: time.now() }));
}

describe("B2 · subir la versión fuerza la re-aceptación", () => {
  test("alta completa con la versión anterior: el gate lleva al aviso, la casilla sale vacía y aceptar guarda la versión nueva", async () => {
    await setup(OLD_VERSION);
    renderRouter(ROUTES, { initialUrl: "/history" });
    const box = await screen.findByRole("checkbox");
    expect(screen.queryByText("HISTORIAL")).toBeNull();
    expect(box.props.accessibilityState?.checked).toBe(false);
    fireEvent.press(box);
    fireEvent.press(screen.getByText(t("common.continue")));
    expect(await screen.findByText("HOY")).toBeTruthy();
    const device = (await SettingsService.load()).device;
    expect(device.disclosureAcceptedVersion).toBe(DISCLOSURE_VERSION);
    expect(device.onboardingCompleted).toBe(true);
  });
});

describe("B2 · pantalla del alta", () => {
  test("muestra los tres bloques cortos y no los bloques del aviso completo", async () => {
    await setup(null, false);
    renderRouter(ROUTES, { initialUrl: "/disclosure" });
    const content = getDisclosureContent("es");
    for (const block of content.summary) {
      expect(await screen.findByText(block.title)).toBeTruthy();
      expect(screen.getByText(block.body)).toBeTruthy();
    }
    expect(screen.queryByText(content.blocks.find((b) => b.key === "arrival")!.title)).toBeNull();
  });

  test("«Leer aviso completo» abre legal/disclosure (ruta existente) con el texto completo", async () => {
    await setup(null, false);
    const r = renderRouter(ROUTES, { initialUrl: "/disclosure" });
    fireEvent.press(await screen.findByText(t("onboarding.avisoReadFull")));
    const content = getDisclosureContent("es");
    expect(await screen.findByText(content.title)).toBeTruthy();
    expect(r.getPathname()).toBe("/legal/disclosure");
    for (const block of content.blocks) expect(screen.getByText(block.body)).toBeTruthy();
    expect(Store.getState().settings.device.disclosureAcceptedVersion).toBeNull();
  });

  test("no hay ruta nueva: app/legal sigue con las mismas pantallas", () => {
    const dir = path.resolve(__dirname, "../../../app/legal");
    expect(fs.readdirSync(dir).sort()).toEqual(["_layout.tsx", "disclosure.tsx", "retention.tsx"]);
    const src = fs.readFileSync(path.resolve(__dirname, "../../../app/(onboarding)/disclosure.tsx"), "utf8");
    expect(src).toContain('router.push("/legal/disclosure")');
  });
});

describe("B2 · aviso completo v4", () => {
  test("el aviso completo renderiza todos los bloques, incluido control", async () => {
    await setup(null, false);
    const r = renderRouter(ROUTES, { initialUrl: "/disclosure" });
    fireEvent.press(await screen.findByText(t("onboarding.avisoReadFull")));
    const content = getDisclosureContent("es");
    expect(content.version).toBe(DISCLOSURE_VERSION);
    expect(DISCLOSURE_VERSION).toBe("2026-11-v4");
    expect(content.blocks.map((b) => b.key)).toEqual([
      "perimeter",
      "breadcrumb",
      "lunch",
      "retention",
      "recipients",
      "purpose",
      "arrival",
      "autoClose",
      "control",
    ]);
    expect(r.getPathname()).toBe("/legal/disclosure");
    expect(await screen.findByText("Tu control")).toBeTruthy();
    for (const block of content.blocks) expect(screen.getByText(block.body)).toBeTruthy();
  });
});
