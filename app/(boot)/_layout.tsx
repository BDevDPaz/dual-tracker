import React from "react";
import { Stack } from "expo-router";

import { useTheme } from "../../src/context/ThemeContext";

/**
 * app/(boot)/_layout.tsx — Stack de arranque (Propuesta capa app §3.1).
 * Sin header propio, fondo obsidian y sin gesto de back: el usuario no
 * puede "salirse" de la rehidratación arrastrando hacia atrás.
 */
export default function BootLayout() {
  const { tokens } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
        contentStyle: { backgroundColor: tokens.colors.background },
      }}
    >
      <Stack.Screen name="hydrating" />
    </Stack>
  );
}
