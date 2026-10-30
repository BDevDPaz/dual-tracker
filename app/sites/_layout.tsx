import React from "react";
import { Stack } from "expo-router";

import { useTheme } from "../../src/context/ThemeContext";

/** Stack de destinos (Propuesta capa app §5.11). Grupo accesible desde Hoy y Ajustes. */
export default function SitesLayout() {
  const { tokens } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: tokens.colors.background },
        headerTintColor: tokens.colors.text.primary,
        headerTitleStyle: { fontFamily: undefined },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Destinos", headerShown: false }} />
      <Stack.Screen name="new" options={{ title: "Nuevo destino", headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: "Ficha de sitio", headerShown: false }} />
    </Stack>
  );
}
