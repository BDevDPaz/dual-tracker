import React from "react";
import { Stack } from "expo-router";

import { useTheme } from "../../src/context/ThemeContext";

/** Stack legal de solo lectura: descargo y retención. */
export default function LegalLayout() {
  const { tokens } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerTitle: "Legal",
        headerStyle: { backgroundColor: tokens.colors.background },
        headerTintColor: tokens.colors.text.primary,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="disclosure" options={{ headerTitle: "Aviso de rastreo" }} />
      <Stack.Screen name="retention" options={{ headerTitle: "Retención de datos" }} />
    </Stack>
  );
}
