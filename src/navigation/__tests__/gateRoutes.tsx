/** Mapa de rutas para renderRouter: pila raíz real (RootStack), gate real y Listo real; el resto son marcadores. */
import React from "react";
import { Text } from "react-native";
import { Slot } from "expo-router";
import { act } from "expo-router/testing-library";
import { StoreActions } from "../../core/store";
import { DISCLOSURE_VERSION } from "../../i18n/legal";
import { PersistenceService } from "../../services/persistence/PersistenceService";
import { SettingsService } from "../../services/persistence/SettingsService";
import { time } from "../../../test/time";
import Gate from "../../../app/index";
import ReadyScreen from "../../../app/(onboarding)/ready";
import { RootStack } from "../RootStack";

type Flags = { onboarded: boolean; accepted: boolean };

export async function hydrateWith({ onboarded, accepted }: Flags): Promise<void> {
  const base = await SettingsService.load();
  const settings = {
    ...base,
    device: {
      ...base.device,
      onboardingCompleted: onboarded,
      disclosureAcceptedVersion: accepted ? DISCLOSURE_VERSION : null,
      disclosureAcceptedAtMs: accepted ? time.now() : null,
    },
  };
  const snap = await PersistenceService.loadSnapshot();
  act(() => StoreActions.hydrated({ sessions: snap.sessions, sites: snap.sites, packs: snap.packs, settings, osKillDetected: false, hasPin: false, nowMs: time.now() }));
}

const marker = (label: string) =>
  function Marker() {
    return <Text>{label}</Text>;
  };

export const ROUTES = {
  _layout: () => <RootStack />,
  index: Gate,
  "(boot)/hydrating": marker("HIDRATANDO"),
  "(tabs)/_layout": () => <RootStackTabs />,
  "(tabs)/index": marker("HOY"),
  "(tabs)/history": marker("HISTORIAL"),
  "(onboarding)/welcome": marker("BIENVENIDA"),
  "(onboarding)/disclosure": marker("AVISO"),
  "(onboarding)/profile": marker("PERFIL"),
  "(onboarding)/ready": ReadyScreen,
  "session/_layout": () => <RootStackTabs />,
  "session/[id]": marker("DETALLE"),
  "system/_layout": () => <RootStackTabs />,
  "system/conflict": marker("CONFLICTO"),
};

function RootStackTabs() {
  return <Slot />;
}

