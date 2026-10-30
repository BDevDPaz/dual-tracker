import React from "react";
import { Stack } from "expo-router";

import { useTheme } from "../../src/context/ThemeContext";

/**
 * Stack de expediente (Propuesta capa app §3.1 / §5.9-5.10).
 * El comportamiento "back al origen" (Historial u Hoy) NO se resuelve aquí:
 * un `_layout` de Stack no puede leer el search param `from` del hijo antes
 * de que este se monte, así que `app/session/[id].tsx` implementa su propio
 * `PageHeader` con `onBack` explícito y oculta el header nativo de esta
 * pantalla. Este layout solo aporta el header nativo por defecto (usado tal
 * cual en `trace.tsx`, que no necesita lógica de origen).
 */
export default function SessionLayout() {
  const { tokens } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: tokens.colors.background },
        headerTintColor: tokens.colors.text.primary,
        headerTitleStyle: { fontFamily: undefined },
      }}
    >
      <Stack.Screen name="[id]" options={{ title: "Expediente", headerShown: false }} />
      <Stack.Screen name="[id]/trace" options={{ title: "Rastro" }} />
    </Stack>
  );
}
