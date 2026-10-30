import React from "react";
import { Stack } from "expo-router";

import { useTheme } from "../../src/context/ThemeContext";

/**
 * app/(onboarding)/_layout.tsx — Wizard lineal de alta (Propuesta capa app
 * §3.1 y §"Stack de alta"). headerShown:false + gestureEnabled:false para
 * que no se pueda saltar disclosure ni permissions con un swipe-back.
 *
 * NOTA de implementación: el blueprint describe un "progress de 4 pasos"
 * visible durante todo el wizard. Un Stack de Expo Router renderiza cada
 * pantalla a pantalla completa (full-bleed) una encima de otra -- no hay un
 * "slot" persistente en el layout donde superponer un indicador compartido
 * sin recurrir a un overlay absoluto que compita con el header nativo y con
 * las animaciones de transición del Stack. Por eso el indicador de progreso
 * (paso 1/2/3/4) se implementa como un componente pequeño DENTRO de cada una
 * de las 4 pantallas (welcome, disclosure, permissions, profile), no aquí.
 * Este archivo se limita a la configuración del Stack.
 */
export default function OnboardingLayout() {
  const { tokens } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
        contentStyle: { backgroundColor: tokens.colors.background },
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="disclosure" />
      <Stack.Screen name="permissions" />
      <Stack.Screen name="profile" />
    </Stack>
  );
}
